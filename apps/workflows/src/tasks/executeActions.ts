import { randomUUID } from 'node:crypto';
import type { Proposal, VendorQuote, ProofPack } from '@rm/shared';
import { buildProofPack, createLedgerEntry, GENESIS_PREV_HASH } from '@rm/ledger';

export interface ExecutedOrder {
  order_id: string;
  proposal_id: string;
  paypal_order_id: string;
  amount: number;
  currency: string;
  proof_pack: ProofPack;
  ledger_hash: string;
}

export interface ExecutedCancellation {
  proposal_id: string;
  subscription_id: string;
  monthly_savings: number;
  ledger_hash: string;
}

/**
 * Executes purchases for auto-approved proposals, generating PayPal order references,
 * cryptographic Proof Packs, and appending to the tamper-evident ledger.
 */
export function executePurchase(
  proposal: Proposal,
  prevHash: string = GENESIS_PREV_HASH
): { executedOrder: ExecutedOrder; newHash: string } {
  const orderId = randomUUID();
  const paypalOrderId = `PAYPAL-AUTO-${randomUUID().substring(0, 8).toUpperCase()}`;
  const amount = proposal.payload.quantity * proposal.payload.unit_price;

  const vendorQuote: VendorQuote = {
    quote_id: proposal.payload.quote_id,
    vendor_id: proposal.payload.vendor_id,
    sku: proposal.payload.sku,
    quantity: proposal.payload.quantity,
    unit_price: proposal.payload.unit_price,
    currency: proposal.payload.currency,
    valid_until: new Date(Date.now() + 86400000).toISOString(),
  };

  // Build immutable ledger entry
  const ledgerEntry = createLedgerEntry({
    type: 'purchase_auto_executed',
    ref_id: orderId,
    data: {
      order_id: orderId,
      proposal_id: proposal.id,
      vendor_id: proposal.payload.vendor_id,
      sku: proposal.payload.sku,
      quantity: proposal.payload.quantity,
      unit_price: proposal.payload.unit_price,
      amount,
      currency: proposal.payload.currency,
      paypal_order_id: paypalOrderId,
    },
    prev_hash: prevHash,
  });

  // Build ProofPack
  const proofPack = buildProofPack({
    proposal_id: proposal.id,
    order_id: orderId,
    mandate: {
      type: 'intent',
      issuer: 'workflow-scheduler',
      source_text: 'Autonomous Scheduled Execution',
      constraints: {
        categories: ['laptops', 'monitors', 'accessories'],
        max_unit_price: 2000,
        monthly_cap: 50000,
        currency: 'USD',
        approved_vendors: ['vendor_a', 'vendor_b'],
        max_over_benchmark_pct: 10,
        mode: 'auto_under_cap',
      },
      expires: new Date(Date.now() + 86400000).toISOString(),
      nonce: `nonce-${orderId}`,
      signature: { kind: 'es256', payload: { valid: true } },
    },
    signature: { kind: 'es256', payload: { valid: true } },
    vendor_quote: vendorQuote,
    ledger_hash: ledgerEntry.hash,
    prev_hash: prevHash,
    paypal_order_id: paypalOrderId,
  });

  proposal.status = 'executed';

  return {
    executedOrder: {
      order_id: orderId,
      proposal_id: proposal.id,
      paypal_order_id: paypalOrderId,
      amount,
      currency: proposal.payload.currency,
      proof_pack: proofPack,
      ledger_hash: ledgerEntry.hash,
    },
    newHash: ledgerEntry.hash,
  };
}

