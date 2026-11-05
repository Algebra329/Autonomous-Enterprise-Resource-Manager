import { describe, it, expect } from 'vitest';
import { generateStaticQuote, evaluateCounterOffer, verifyVendorCart } from '../src/index.js';

describe('packages/vendor-kit', () => {
  const sampleListing = {
    sku: 'LAP-14',
    name: 'Workstation 14',
    category: 'laptops',
    base_price: 1500,
    stock: 10,
  };

  it('generates a valid static quote', () => {
    const quote = generateStaticQuote('vendor_a', sampleListing, 2);
    expect(quote.vendor_id).toBe('vendor_a');
    expect(quote.sku).toBe('LAP-14');
    expect(quote.quantity).toBe(2);
    expect(quote.unit_price).toBe(1500);
  });

  it('accepts counter offers within 5% discount', () => {
    const quote = generateStaticQuote('vendor_a', sampleListing, 1);
    const counter = evaluateCounterOffer(quote, 1450, 1);
    expect(counter.decision).toBe('accepted');
    expect(counter.unit_price).toBe(1450);
  });

  it('proposes compromise price for larger discounts', () => {
    const quote = generateStaticQuote('vendor_a', sampleListing, 1);
    const counter = evaluateCounterOffer(quote, 1200, 1);
    expect(counter.decision).toBe('revised');
    expect(counter.unit_price).toBe(1350); // 90% floor
  });

  it('stops negotiating after 3 rounds', () => {
    const quote = generateStaticQuote('vendor_a', sampleListing, 1);
    const counter = evaluateCounterOffer(quote, 1450, 4);
    expect(counter.decision).toBe('rejected');
  });

  it('verifies cart matching hash', () => {
    const cart = {
      vendor_id: 'vendor_a',
      sku: 'LAP-14',
      quantity: 1,
      unit_price: 1500,
      total: 1500,
      currency: 'USD',
    };
    expect(verifyVendorCart(cart, 'wrong-hash')).toBe(false);
  });
});

