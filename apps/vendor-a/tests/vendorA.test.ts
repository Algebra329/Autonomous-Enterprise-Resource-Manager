import { describe, it, expect } from 'vitest';
import { getQuote, handleCounter, VENDOR_A_ID } from '../src/index.js';

describe('apps/vendor-a', () => {
  it('returns valid quote for known SKU', () => {
    const q = getQuote('LAP-14', 1);
    expect(q.vendor_id).toBe(VENDOR_A_ID);
    expect(q.unit_price).toBe(1450);
  });

  it('handles counter negotiation', () => {
    const res = handleCounter('q-1', 'LAP-14', 1400, 1);
    expect(res.quote_id).toBe('q-1');
  });
});

