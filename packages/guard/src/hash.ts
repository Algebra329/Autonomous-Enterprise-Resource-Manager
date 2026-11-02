import { createHash } from 'node:crypto';
import { canonicalize } from './canonicalize.js';
import type { Cart, IntentMandate, CartMandate } from '@rm/shared';

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64url');
}

/**
 * Computes payload_hash = sha256(canonicalize(mandate without signature))
 */
export function hashMandatePayload(mandate: IntentMandate | CartMandate): string {
  const { signature, ...payloadWithoutSignature } = mandate;
  const canonical = canonicalize(payloadWithoutSignature);
  return sha256(canonical);
}

/**
 * Computes cart_hash covering vendor_id, sku, quantity, unit_price, total, currency
 */
export function hashCart(cart: Cart): string {
  const normalizedCart = {
    currency: cart.currency || 'USD',
    quantity: cart.quantity,
    sku: cart.sku,
    total: cart.total,
    unit_price: cart.unit_price,
    vendor_id: cart.vendor_id,
  };
  return sha256(canonicalize(normalizedCart));
}

