import { Channel3Client, defaultChannel3 } from '@rm/channel3';
import { AgentTools } from '@rm/agent';
import type { VendorQuote } from '@rm/shared';

export interface SourcedItem {
  sku: string;
  category: string;
  quantity: number;
  market_price: number;
  benchmark_source: string;
  checked_at: string;
  best_quote: VendorQuote;
  negotiated: boolean;
  savings_vs_initial: number;
}

/**
 * Sources market pricing via Channel3 and executes multi-round negotiations with vendors.
 */
export async function sourceAndNegotiate(
  items: { sku: string; category: string; quantity: number }[],
  approvedVendors: string[] = ['vendor_a', 'vendor_b'],
  channel3: Channel3Client = defaultChannel3
): Promise<SourcedItem[]> {
  const tools = new AgentTools(channel3);
  const results: SourcedItem[] = [];

  for (const item of items) {
    // 1. Channel3 Price Benchmark
    const benchmark = await tools.channel3_search(item.sku);

    // 2. Query approved vendors
    const quotes: VendorQuote[] = [];
    for (const v of approvedVendors) {
      if (v === 'vendor_a' || v === 'vendor_b') {
        const q = await tools.vendor_quote(item.sku, item.quantity, v);
        quotes.push(q);
      }
    }

    if (quotes.length === 0) continue;

    // Pick best initial offer
    quotes.sort((a, b) => a.unit_price - b.unit_price);
    let bestQuote = quotes[0]!;
    const initialPrice = bestQuote.unit_price;
    let negotiated = false;

    // 3. Negotiate if price exceeds market benchmark
    if (bestQuote.unit_price > benchmark.market_price) {
      const counterRes = await tools.vendor_counter(bestQuote, benchmark.market_price);
      if (counterRes.decision === 'revised' || counterRes.decision === 'accepted') {
        bestQuote = {
          ...bestQuote,
          quote_id: counterRes.quote_id,
          unit_price: counterRes.unit_price,
        };
        negotiated = true;
      }
    }

    results.push({
      sku: item.sku,
      category: item.category,
      quantity: item.quantity,
      market_price: benchmark.market_price,
      benchmark_source: benchmark.source,
      checked_at: benchmark.checked_at,
      best_quote: bestQuote,
      negotiated,
      savings_vs_initial: (initialPrice - bestQuote.unit_price) * item.quantity,
    });
  }

  return results;
}

