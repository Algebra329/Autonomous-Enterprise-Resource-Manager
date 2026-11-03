import type { VendorQuote, VendorCounterResponse, Cart } from '@rm/shared';
import { hashCart } from '@rm/guard';

export interface VendorItemListing {
  sku: string;
  name: string;
  category: string;
  base_price: number;
  stock: number;
}

export function generateStaticQuote(
  vendorId: string,
  listing: VendorItemListing,
  quantity: number
): VendorQuote {
  return {
    quote_id: `q-${vendorId}-${listing.sku}-${Date.now()}`,
    vendor_id: vendorId,
    sku: listing.sku,
    quantity,
    unit_price: listing.base_price,
    currency: 'USD',
    valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function evaluateCounterOffer(
  quote: VendorQuote,
  targetPrice: number,
  round: number,
  minMarginFloor: number = quote.unit_price * 0.90
): VendorCounterResponse {
  const valid_until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  if (round > 3) {
    return {
      decision: 'rejected',
      quote_id: quote.quote_id,
      unit_price: quote.unit_price,
      valid_until,
    };
  }

  if (targetPrice >= quote.unit_price * 0.95) {
    return {
      decision: 'accepted',
      quote_id: quote.quote_id,
      unit_price: targetPrice,
      valid_until,
    };
  }

  const compromisePrice = Math.max(targetPrice, minMarginFloor);
  return {
    decision: 'revised',
    quote_id: quote.quote_id,
    unit_price: Math.round(compromisePrice),
    valid_until,
  };
}

export function verifyVendorCart(cart: Cart, expectedHash: string): boolean {
  return hashCart(cart) === expectedHash;
}

