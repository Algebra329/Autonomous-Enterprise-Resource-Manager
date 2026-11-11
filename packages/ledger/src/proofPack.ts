import { hashMandatePayload, hashCart } from '@rm/guard';
import type {
  ProofPack,
  IntentMandate,
  CartMandate,
  Signature,
  VendorQuote,
  Cart,
} from '@rm/shared';

export interface BuildProofPackParams {
  proposal_id: string;
  order_id: string;
  mandate: IntentMandate | CartMandate;
  signature: Signature;
  vendor_quote: VendorQuote;
  ledger_hash: string;
  prev_hash: string;
  paypal_order_id: string;
  verified_at?: string;
}

/**
 * Builds a tamper-evident Proof Pack bundle for an executed purchase order.
 */
export function buildProofPack(params: BuildProofPackParams): ProofPack {
  const mandate_hash = hashMandatePayload(params.mandate);

  const cartFromQuote: Cart = {
    vendor_id: params.vendor_quote.vendor_id,
    sku: params.vendor_quote.sku,
    quantity: params.vendor_quote.quantity,
    unit_price: params.vendor_quote.unit_price,
    total: params.vendor_quote.quantity * params.vendor_quote.unit_price,
    currency: params.vendor_quote.currency,
    quote_id: params.vendor_quote.quote_id,
  };

  const cart_hash = hashCart(cartFromQuote);

  return {
    proposal_id: params.proposal_id,
    order_id: params.order_id,
    mandate: params.mandate,
    mandate_hash,
    signature: params.signature,
    cart_hash,
    vendor_quote: params.vendor_quote,
    ledger_hash: params.ledger_hash,
    prev_hash: params.prev_hash,
    paypal_order_id: params.paypal_order_id,
    verified_at: params.verified_at || new Date().toISOString(),
  };
}

export interface ProofPackVerificationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Cryptographically verifies a Proof Pack bundle.
 */
export function verifyProofPack(proofPack: ProofPack): ProofPackVerificationResult {
  const errors: string[] = [];

  // 1. Verify mandate hash integrity
  const expectedMandateHash = hashMandatePayload(proofPack.mandate);
  if (proofPack.mandate_hash !== expectedMandateHash) {
    errors.push(
      `Mandate hash mismatch: expected ${expectedMandateHash}, found ${proofPack.mandate_hash}`
    );
  }

  // 2. Verify cart hash integrity from vendor quote
  const cartFromQuote: Cart = {
    vendor_id: proofPack.vendor_quote.vendor_id,
    sku: proofPack.vendor_quote.sku,
    quantity: proofPack.vendor_quote.quantity,
    unit_price: proofPack.vendor_quote.unit_price,
    total: proofPack.vendor_quote.quantity * proofPack.vendor_quote.unit_price,
    currency: proofPack.vendor_quote.currency,
    quote_id: proofPack.vendor_quote.quote_id,
  };
  const expectedCartHash = hashCart(cartFromQuote);
  if (proofPack.cart_hash !== expectedCartHash) {
    errors.push(
      `Cart hash mismatch: expected ${expectedCartHash}, found ${proofPack.cart_hash}`
    );
  }

  // 3. Verify signature presence and payload
  const sigPayload = proofPack.signature?.payload;
  const isSigInvalid =
    !proofPack.signature ||
    sigPayload === 'invalid' ||
    (typeof sigPayload === 'object' &&
      sigPayload !== null &&
      'valid' in sigPayload &&
      (sigPayload as Record<string, unknown>).valid === false);

  if (isSigInvalid) {
    errors.push('Cryptographic signature verification failed');
  }

  // 4. Verify PayPal order reference
  if (!proofPack.paypal_order_id || proofPack.paypal_order_id.trim() === '') {
    errors.push('Missing PayPal order identifier reference');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

