import { describe, it, expect } from 'vitest';
import { getQuote, handleCounter, VENDOR_B_ID } from '../src/index.js';

describe('apps/vendor-b', () => {
  it('returns valid quote for known SKU', () => {
    const q = getQuote('LAP-14', 1);
    expect(q.vendor_id).toBe(VENDOR_B_ID);
    expect(q.unit_price).toBe(1390);
  });

  it('handles counter negotiation', () => {
    const res = handleCounter('q-2', 'LAP-14', 1350, 1);
    expect(res.quote_id).toBe('q-2');
  });
});

