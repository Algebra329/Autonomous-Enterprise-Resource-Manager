import { Channel3Client, defaultChannel3, CHANNEL3_ANCHOR_QUERIES } from '@rm/channel3';
import type { VendorQuote, VendorCounterResponse } from '@rm/shared';

// Simulated static vendor catalogs for unblocked local development and tests
export const VENDOR_CATALOG: Record<string, { price_a: number; price_b: number; title: string }> = {
  'LAP-13': { price_a: 1250, price_b: 1280, title: 'UltraLight 13 Laptop' },
  'LAP-14': { price_a: 1450, price_b: 1420, title: 'Business 14 Laptop' },
  'LAP-16': { price_a: 1950, price_b: 1900, title: 'Performance 16 Laptop' },
  'MON-24': { price_a: 230, price_b: 220, title: '24in FHD Monitor' },
  'MON-27': { price_a: 420, price_b: 410, title: '27in 4K Monitor' },
  'DOCK-TB': { price_a: 240, price_b: 250, title: 'Thunderbolt Dock' },
};

// Anchored benchmark search queries from seed/catalog.json (Spec E)
export const SKU_BENCHMARK_QUERIES: Record<string, string> = CHANNEL3_ANCHOR_QUERIES;

export class AgentTools {
  private channel3: Channel3Client;

  constructor(channel3Client?: Channel3Client) {
    this.channel3 = channel3Client || defaultChannel3;
  }

  /**
   * Tool 1: channel3_search - Query Channel3 price benchmarks.
   * Automatically resolves SKU names to official benchmark queries (Spec E).
   */
  async channel3_search(queryOrSku: string) {
    const query = SKU_BENCHMARK_QUERIES[queryOrSku.toUpperCase()] || queryOrSku;
    const res = await this.channel3.search(query);
    return {
      sku: res.sku || queryOrSku,
      title: res.title,
      market_price: res.medianPrice || res.bestPrice,
      currency: res.currency,
      checked_at: res.checked_at,
      source: res.source,
    };
  }

  /**
   * Tool 2: vendor_quote - Request price quote from a specific vendor
   */
  async vendor_quote(sku: string, quantity: number, vendor_id: 'vendor_a' | 'vendor_b'): Promise<VendorQuote> {
    const catalogItem = VENDOR_CATALOG[sku] || { price_a: 1450, price_b: 1450, title: sku };
    const unitPrice = vendor_id === 'vendor_a' ? catalogItem.price_a : catalogItem.price_b;
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return {
      quote_id: `q_${vendor_id}_${sku}_${Date.now()}`,
      vendor_id,
      sku,
      quantity,
      unit_price: unitPrice,
      currency: 'USD',
      valid_until: expires,
    };
  }

  /**
   * Tool 3: vendor_counter - Propose a negotiated counter-offer (max 3 rounds)
   */
  async vendor_counter(
    quote: VendorQuote,
    proposed_unit_price: number
  ): Promise<VendorCounterResponse> {
    const minAcceptable = quote.unit_price * 0.92; // Vendor margin threshold (up to 8% discount)

    if (proposed_unit_price >= quote.unit_price) {
      return {
        decision: 'accepted',
        quote_id: quote.quote_id,
        unit_price: quote.unit_price,
        valid_until: quote.valid_until,
      };
    }

    if (proposed_unit_price >= minAcceptable) {
      // Vendor accepts or splits difference
      const compromisePrice = Math.round((quote.unit_price + proposed_unit_price) / 2);
      return {
        decision: 'revised',
        quote_id: `q_rev_${Date.now()}`,
        unit_price: compromisePrice,
        valid_until: quote.valid_until,
      };
    }

    return {
      decision: 'rejected',
      quote_id: quote.quote_id,
      unit_price: quote.unit_price,
      valid_until: quote.valid_until,
    };
  }
}

