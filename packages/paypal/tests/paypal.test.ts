import { describe, it, expect } from 'vitest';
import { getPayPalBaseUrl } from '../src/index.js';
import { parseSubscriptionStatus } from '../src/planner.js';
import { formatCapturePayload } from '../src/vendor.js';

describe('packages/paypal', () => {
  it('returns sandbox url by default', () => {
    expect(getPayPalBaseUrl()).toContain('sandbox');
    expect(getPayPalBaseUrl('live')).toBe('https://api-m.paypal.com');
  });

  it('parses subscription status cleanly', () => {
    expect(parseSubscriptionStatus('active')).toBe('ACTIVE');
  });

  it('formats vendor capture payload with 2 decimal places', () => {
    const payload = formatCapturePayload({
      orderId: 'ord-123',
      amount: 1450,
      currency: 'USD',
    });
    expect(payload.order_id).toBe('ord-123');
    expect(payload.amount.value).toBe('1450.00');
  });
});

