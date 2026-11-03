import { generateStaticQuote, evaluateCounterOffer, type VendorItemListing } from '@rm/vendor-kit';

export const VENDOR_A_ID = 'vendor_a';

export const VENDOR_A_CATALOG: Record<string, VendorItemListing> = {
  'LAP-14': { sku: 'LAP-14', name: 'Workstation 14 Laptop', category: 'laptops', base_price: 1450, stock: 25 },
  'LAP-16': { sku: 'LAP-16', name: 'Workstation 16 Laptop', category: 'laptops', base_price: 2200, stock: 15 },
  'MON-27': { sku: 'MON-27', name: 'UltraSharp 27 Monitor', category: 'monitors', base_price: 420, stock: 50 },
};

export function getQuote(sku: string, quantity: number) {
  const item = VENDOR_A_CATALOG[sku] || { sku, name: sku, category: 'general', base_price: 500, stock: 10 };
  return generateStaticQuote(VENDOR_A_ID, item, quantity);
}

export function handleCounter(quoteId: string, sku: string, targetPrice: number, round: number) {
  const quote = getQuote(sku, 1);
  quote.quote_id = quoteId;
  return evaluateCounterOffer(quote, targetPrice, round);
}

console.log(`[${VENDOR_A_ID}] Service initialized with ${Object.keys(VENDOR_A_CATALOG).length} items`);

