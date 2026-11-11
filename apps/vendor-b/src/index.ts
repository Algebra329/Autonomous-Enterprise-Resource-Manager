import { generateStaticQuote, evaluateCounterOffer, type VendorItemListing } from '@rm/vendor-kit';

export const VENDOR_B_ID = 'vendor_b';

export const VENDOR_B_CATALOG: Record<string, VendorItemListing> = {
  'LAP-14': { sku: 'LAP-14', name: 'DevPro 14 Laptop', category: 'laptops', base_price: 1390, stock: 40 },
  'LAP-16': { sku: 'LAP-16', name: 'DevPro 16 Laptop', category: 'laptops', base_price: 2150, stock: 20 },
  'MON-34': { sku: 'MON-34', name: 'Curved Ultrawide 34 Monitor', category: 'monitors', base_price: 680, stock: 30 },
};

export function getQuote(sku: string, quantity: number) {
  const item = VENDOR_B_CATALOG[sku] || { sku, name: sku, category: 'general', base_price: 450, stock: 10 };
  return generateStaticQuote(VENDOR_B_ID, item, quantity);
}

export function handleCounter(quoteId: string, sku: string, targetPrice: number, round: number) {
  const quote = getQuote(sku, 1);
  quote.quote_id = quoteId;
  return evaluateCounterOffer(quote, targetPrice, round);
}

console.log(`[${VENDOR_B_ID}] Service initialized with ${Object.keys(VENDOR_B_CATALOG).length} items`);

