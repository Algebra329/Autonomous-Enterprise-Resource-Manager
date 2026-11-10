import { describe, it, expect } from 'vitest';
import {
  generateEs256KeyPair,
  hashMandatePayload,
  makeEs256Verifier,
  signMandateHashEs256,
  verifyMandate,
} from '@rm/guard';
import type { IntentMandate, Proposal } from '@rm/shared';

describe('arena runner smoke test', () => {
  it('blocks unapproved vendor attack', () => {
    const { privateKey, publicJwk } = generateEs256KeyPair();
    const verifySignature = makeEs256Verifier({ 'manager@enterprise.com': publicJwk });

    const unsignedMandate: IntentMandate = {
      type: 'intent',
      issuer: 'manager@enterprise.com',
      source_text: 'Buy laptops under $1500',
      constraints: {
        categories: ['laptops'],
        max_unit_price: 1500,
        monthly_cap: 50000,
        currency: 'USD',
        approved_vendors: ['vendor_a'],
        max_over_benchmark_pct: 10,
        mode: 'auto_under_cap',
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
      nonce: 'nonce-arena-01',
    };
    const mandate: IntentMandate = {
      ...unsignedMandate,
      signature: signMandateHashEs256(hashMandatePayload(unsignedMandate), privateKey),
    };

    const attack: Proposal = {
      id: 'a0000000-0000-0000-0000-000000000002',
      kind: 'purchase',
      status: 'needs_approval',
      payload: {
        vendor_id: 'malicious_vendor',
        sku: 'LAP-14',
        quantity: 1,
        unit_price: 1000,
        currency: 'USD',
        quote_id: 'q-bad',
      },
      benchmark: {
        source: 'fixture',
        market_price: 1400,
        checked_at: new Date().toISOString(),
      },
      verdict: 'needs_approval',
      failing_rules: [],
      created_at: new Date().toISOString(),
    };

    const verdict = verifyMandate(mandate, attack, {
      knownIssuers: ['manager@enterprise.com'],
      remainingMonthlyBudget: 50000,
      currentMarketPrice: 1400,
      itemCategory: 'laptops',
      verifySignature,
    });

    expect(verdict.failing_rules).toContain('VENDOR_NOT_APPROVED');
  });
});

