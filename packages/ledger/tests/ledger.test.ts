import { describe, it, expect } from 'vitest';
import {
  GENESIS_PREV_HASH,
  computeLedgerHash,
  createLedgerEntry,
  verifySingleEntry,
  verifyLedgerChain,
} from '../src/chain.js';
import { buildProofPack, verifyProofPack } from '../src/proofPack.js';
import type { IntentMandate, VendorQuote, LedgerEntry } from '@rm/shared';

describe('packages/ledger - Cryptographic Hash Chain', () => {
  it('computes deterministic hashes using canonicalized data', () => {
    const prevHash = GENESIS_PREV_HASH;
    const dataA = { b: 2, a: 1, c: { y: 20, x: 10 } };
    const dataB = { a: 1, c: { x: 10, y: 20 }, b: 2 };

    const hashA = computeLedgerHash(prevHash, dataA);
    const hashB = computeLedgerHash(prevHash, dataB);

    expect(hashA).toBe(hashB);
    expect(hashA).toHaveLength(64);
  });

  it('creates and self-verifies a single valid ledger entry', () => {
    const entry = createLedgerEntry({
      seq: 1,
      type: 'order_executed',
      ref_id: 'order-123',
      data: { amount: 1400, vendor_id: 'vendor_a', sku: 'LAP-14' },
      prev_hash: GENESIS_PREV_HASH,
    });

    expect(verifySingleEntry(entry)).toBe(true);
    expect(entry.prev_hash).toBe(GENESIS_PREV_HASH);
  });

  it('verifies a multi-block sequential chain', () => {
    const chain: LedgerEntry[] = [];
    let prevHash = GENESIS_PREV_HASH;

    for (let i = 1; i <= 5; i++) {
      const entry = createLedgerEntry({
        seq: i,
        type: i % 2 === 0 ? 'order_executed' : 'mandate_registered',
        ref_id: `ref-${i}`,
        data: { step: i, value: i * 100 },
        prev_hash: prevHash,
      });
      chain.push(entry);
      prevHash = entry.hash;
    }

    const verification = verifyLedgerChain(chain);
    expect(verification.valid).toBe(true);
  });

  it('detects tampering in data within the ledger chain', () => {
    const chain: LedgerEntry[] = [];
    let prevHash = GENESIS_PREV_HASH;

    for (let i = 1; i <= 4; i++) {
      const entry = createLedgerEntry({
        seq: i,
        type: 'order_executed',
        ref_id: `ref-${i}`,
        data: { amount: i * 500 },
        prev_hash: prevHash,
      });
      chain.push(entry);
      prevHash = entry.hash;
    }

    // Tamper with data of block 2 (index 1)
    chain[1]!.data = { amount: 999999 };

    const verification = verifyLedgerChain(chain);
    expect(verification.valid).toBe(false);
    expect(verification.errorIndex).toBe(1);
    expect(verification.reason).toContain('tampered data or invalid self-hash');
  });

  it('detects broken link when an entry prev_hash is modified', () => {
    const chain: LedgerEntry[] = [];
    let prevHash = GENESIS_PREV_HASH;

    for (let i = 1; i <= 3; i++) {
      const entry = createLedgerEntry({
        seq: i,
        type: 'test_event',
        data: { idx: i },
        prev_hash: prevHash,
      });
      chain.push(entry);
      prevHash = entry.hash;
    }

    // Tamper with link of block 3 (index 2)
    chain[2]!.prev_hash = '1'.repeat(64);

    const verification = verifyLedgerChain(chain);
    expect(verification.valid).toBe(false);
    expect(verification.errorIndex).toBe(2);
    expect(verification.reason).toContain('broken chain link');
  });

  it('detects swapped order of blocks', () => {
    const chain: LedgerEntry[] = [];
    let prevHash = GENESIS_PREV_HASH;

    for (let i = 1; i <= 4; i++) {
      const entry = createLedgerEntry({
        seq: i,
        type: 'test_event',
        data: { idx: i },
        prev_hash: prevHash,
      });
      chain.push(entry);
      prevHash = entry.hash;
    }

    // Swap block 2 and block 3
    const temp = chain[1]!;
    chain[1] = chain[2]!;
    chain[2] = temp;

    const verification = verifyLedgerChain(chain);
    expect(verification.valid).toBe(false);
  });
});

describe('packages/ledger - Proof Pack Builder & Verifier', () => {
  const sampleMandate: IntentMandate = {
    type: 'intent',
    issuer: 'manager-alice',
    source_text: 'Laptops under $1500',
    constraints: {
      categories: ['laptops'],
      max_unit_price: 1500,
      monthly_cap: 8000,
      currency: 'USD',
      approved_vendors: ['vendor_a'],
      max_over_benchmark_pct: 10,
      mode: 'auto_under_cap',
    },
    expires: '2026-12-31T23:59:59Z',
    nonce: 'nonce-proof-001',
    signature: { kind: 'es256', payload: { valid: true } },
  };

  const sampleQuote: VendorQuote = {
    quote_id: 'q-999',
    vendor_id: 'vendor_a',
    sku: 'LAP-14',
    quantity: 2,
    unit_price: 1450,
    currency: 'USD',
    valid_until: '2026-12-31T23:59:59Z',
  };

  it('builds and verifies a cryptographically sound Proof Pack', () => {
    const proofPack = buildProofPack({
      proposal_id: '11111111-2222-3333-4444-555555555555',
      order_id: 'order-777',
      mandate: sampleMandate,
      signature: sampleMandate.signature!,
      vendor_quote: sampleQuote,
      ledger_hash: 'a'.repeat(64),
      prev_hash: 'b'.repeat(64),
      paypal_order_id: 'PAYPAL-ORD-12345',
    });

    const res = verifyProofPack(proofPack);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('detects tampered mandate inside Proof Pack', () => {
    const proofPack = buildProofPack({
      proposal_id: '11111111-2222-3333-4444-555555555555',
      order_id: 'order-777',
      mandate: sampleMandate,
      signature: sampleMandate.signature!,
      vendor_quote: sampleQuote,
      ledger_hash: 'a'.repeat(64),
      prev_hash: 'b'.repeat(64),
      paypal_order_id: 'PAYPAL-ORD-12345',
    });

    // Tamper with mandate constraints after pack creation
    if (proofPack.mandate.type === 'intent') {
      proofPack.mandate.constraints.max_unit_price = 999999;
    }

    const res = verifyProofPack(proofPack);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('Mandate hash mismatch');
  });

  it('detects tampered vendor quote inside Proof Pack', () => {
    const proofPack = buildProofPack({
      proposal_id: '11111111-2222-3333-4444-555555555555',
      order_id: 'order-777',
      mandate: sampleMandate,
      signature: sampleMandate.signature!,
      vendor_quote: sampleQuote,
      ledger_hash: 'a'.repeat(64),
      prev_hash: 'b'.repeat(64),
      paypal_order_id: 'PAYPAL-ORD-12345',
    });

    // Tamper with quote unit price
    proofPack.vendor_quote.unit_price = 500;

    const res = verifyProofPack(proofPack);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('Cart hash mismatch');
  });
});

