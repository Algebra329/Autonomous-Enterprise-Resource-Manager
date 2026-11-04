import { describe, it, expect } from 'vitest';
import { canonicalize } from '../src/canonicalize.js';
import { hashCart } from '../src/hash.js';
import { verifyMandate } from '../src/verifier.js';
import type { IntentMandate, CartMandate, Proposal } from '@rm/shared';

describe('packages/guard - Canonicalize & Hashing', () => {
  it('canonicalizes JSON with deterministic key ordering', () => {
    const objA = { z: 1, a: 2, m: { b: 3, a: 4 } };
    const objB = { a: 2, m: { a: 4, b: 3 }, z: 1 };
    expect(canonicalize(objA)).toBe(canonicalize(objB));
    expect(canonicalize(objA)).toBe('{"a":2,"m":{"a":4,"b":3},"z":1}');
  });

  it('omits undefined properties during canonicalization', () => {
    const obj = { a: 1, b: undefined, c: 3 };
    expect(canonicalize(obj)).toBe('{"a":1,"c":3}');
  });

  it('produces stable payload and cart hashes', () => {
    const cart = {
      vendor_id: 'vendor_a',
      sku: 'LAP-14',
      quantity: 2,
      unit_price: 1400,
      total: 2800,
      currency: 'USD',
    };
    const hash1 = hashCart(cart);
    const hash2 = hashCart({ ...cart });
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});

describe('packages/guard - All 16 Rule Codes (Pass & Fail)', () => {
  const baseProposal: Proposal = {
    id: '11111111-1111-1111-1111-111111111111',
    kind: 'purchase',
    status: 'needs_approval',
    payload: {
      vendor_id: 'vendor_a',
      sku: 'LAP-14',
      quantity: 1,
      unit_price: 1400,
      currency: 'USD',
      quote_id: 'quote-001',
    },
    benchmark: {
      source: 'channel3',
      market_price: 1400,
      checked_at: '2026-11-01T12:00:00Z',
    },
    verdict: 'auto_approved',
    failing_rules: [],
  };

  const baseIntentMandate: IntentMandate = {
    type: 'intent',
    issuer: 'manager-alice',
    source_text: 'Laptops under $1500 from vendor_a',
    constraints: {
      categories: ['laptops'],
      max_unit_price: 1500,
      monthly_cap: 5000,
      currency: 'USD',
      approved_vendors: ['vendor_a', 'vendor_b'],
      max_over_benchmark_pct: 10,
      mode: 'auto_under_cap',
    },
    not_before: '2026-10-01T00:00:00Z',
    expires: '2026-12-31T23:59:59Z',
    nonce: 'nonce-12345',
    signature: { kind: 'es256', payload: { valid: true } },
  };

  const baseContext = {
    currentTime: '2026-11-01T12:00:00Z',
    knownIssuers: ['manager-alice'],
    remainingMonthlyBudget: 4000,
    itemCategory: 'laptops',
    verifySignature: (_hash: string, sig: unknown) => {
      const p = (sig as { payload?: unknown })?.payload;
      if (typeof p === 'object' && p !== null && 'valid' in p) {
        return (p as { valid: boolean }).valid === true;
      }
      return true;
    },
  };

  it('RULE 1: SIGNATURE_INVALID - fails when signature missing or invalid; passes when valid', () => {
    // Fail: missing signature
    const mandateNoSig = { ...baseIntentMandate, signature: undefined };
    const resNoSig = verifyMandate(mandateNoSig, baseProposal, baseContext);
    expect(resNoSig.failing_rules).toContain('SIGNATURE_INVALID');
    expect(resNoSig.result).toBe('blocked');

    // Fail: invalid signature
    const mandateBadSig = {
      ...baseIntentMandate,
      signature: { kind: 'es256' as const, payload: { valid: false } },
    };
    const resBadSig = verifyMandate(mandateBadSig, baseProposal, baseContext);
    expect(resBadSig.failing_rules).toContain('SIGNATURE_INVALID');
    expect(resBadSig.result).toBe('blocked');

    // Pass
    const resValid = verifyMandate(baseIntentMandate, baseProposal, baseContext);
    expect(resValid.failing_rules).not.toContain('SIGNATURE_INVALID');
    expect(resValid.result).toBe('auto_approved');
  });

  it('RULE 2: ISSUER_UNKNOWN - fails when issuer not in known list; passes when known', () => {
    const badIssuerMandate = { ...baseIntentMandate, issuer: 'unknown-intruder' };
    const resFail = verifyMandate(badIssuerMandate, baseProposal, baseContext);
    expect(resFail.failing_rules).toContain('ISSUER_UNKNOWN');
    expect(resFail.result).toBe('blocked');

    const resPass = verifyMandate(baseIntentMandate, baseProposal, baseContext);
    expect(resPass.failing_rules).not.toContain('ISSUER_UNKNOWN');
  });

  it('RULE 3: REVOKED - fails when mandate nonce or parent is in revocation list; passes otherwise', () => {
    const resFail = verifyMandate(baseIntentMandate, baseProposal, {
      ...baseContext,
      revokedMandateIds: ['nonce-12345'],
    });
    expect(resFail.failing_rules).toContain('REVOKED');
    expect(resFail.result).toBe('blocked');

    const resPass = verifyMandate(baseIntentMandate, baseProposal, baseContext);
    expect(resPass.failing_rules).not.toContain('REVOKED');
  });

  it('RULE 4: EXPIRED - fails when current time is past expiry; passes when within window', () => {
    const expiredMandate = { ...baseIntentMandate, expires: '2026-10-31T00:00:00Z' };
    const resFail = verifyMandate(expiredMandate, baseProposal, {
      ...baseContext,
      currentTime: '2026-11-01T00:00:00Z',
    });
    expect(resFail.failing_rules).toContain('EXPIRED');
    expect(resFail.result).toBe('blocked');

    const resPass = verifyMandate(baseIntentMandate, baseProposal, baseContext);
    expect(resPass.failing_rules).not.toContain('EXPIRED');
  });

  it('RULE 5: NOT_YET_VALID - fails when current time is before not_before; passes when after', () => {
    const futureMandate = { ...baseIntentMandate, not_before: '2026-11-15T00:00:00Z' };
    const resFail = verifyMandate(futureMandate, baseProposal, {
      ...baseContext,
      currentTime: '2026-11-01T00:00:00Z',
    });
    expect(resFail.failing_rules).toContain('NOT_YET_VALID');
    expect(resFail.result).toBe('blocked');

    const resPass = verifyMandate(baseIntentMandate, baseProposal, baseContext);
    expect(resPass.failing_rules).not.toContain('NOT_YET_VALID');
  });

  it('RULE 6: NONCE_REUSED - fails when nonce already used (replay attack); passes on fresh nonce', () => {
    const resFail = verifyMandate(baseIntentMandate, baseProposal, {
      ...baseContext,
      usedNonces: ['nonce-12345'],
    });
    expect(resFail.failing_rules).toContain('NONCE_REUSED');
    expect(resFail.result).toBe('blocked');

    const resPass = verifyMandate(baseIntentMandate, baseProposal, {
      ...baseContext,
      usedNonces: ['nonce-other'],
    });
    expect(resPass.failing_rules).not.toContain('NONCE_REUSED');
  });

  it('RULE 7: CART_HASH_MISMATCH - fails when cart content does not match proposal in CartMandate', () => {
    const cartMandate: CartMandate = {
      type: 'cart',
      issuer: 'manager-alice',
      cart: {
        vendor_id: 'vendor_a',
        sku: 'LAP-14',
        quantity: 1,
        unit_price: 1400,
        total: 1400,
        currency: 'USD',
      },
      nonce: 'cart-nonce-1',
      expires: '2026-12-31T00:00:00Z',
      signature: { kind: 'es256', payload: { valid: true } },
    };

    // Mismatched SKU
    const tamperedProposal: Proposal = {
      ...baseProposal,
      payload: { ...baseProposal.payload, sku: 'LAP-TAMPERED' },
    };
    const resFail = verifyMandate(cartMandate, tamperedProposal, baseContext);
    expect(resFail.failing_rules).toContain('CART_HASH_MISMATCH');
    expect(resFail.result).toBe('blocked');

    // Matching cart
    const resPass = verifyMandate(cartMandate, baseProposal, baseContext);
    expect(resPass.failing_rules).not.toContain('CART_HASH_MISMATCH');
    expect(resPass.result).toBe('auto_approved');
  });

  it('RULE 8: PRICE_DRIFT - fails when re-fetched market price drifts beyond tolerance', () => {
    // Benchmark market_price is 1400; if re-fetched price is 1550 (over 2% drift)
    const resFail = verifyMandate(baseIntentMandate, baseProposal, {
      ...baseContext,
      currentMarketPrice: 1550,
      priceDriftTolerancePct: 2,
    });
    expect(resFail.failing_rules).toContain('PRICE_DRIFT');
    expect(resFail.result).toBe('needs_approval');

    // Within tolerance (1410 is ~0.7% drift, well within 2%)
    const resPass = verifyMandate(baseIntentMandate, baseProposal, {
      ...baseContext,
      currentMarketPrice: 1410,
      priceDriftTolerancePct: 2,
    });
    expect(resPass.failing_rules).not.toContain('PRICE_DRIFT');
  });

  it('RULE 9: CATEGORY_NOT_ALLOWED - fails when category not in policy; passes when allowed', () => {
    const resFail = verifyMandate(baseIntentMandate, baseProposal, {
      ...baseContext,
      itemCategory: 'gaming-consoles',
    });
    expect(resFail.failing_rules).toContain('CATEGORY_NOT_ALLOWED');
    expect(resFail.result).toBe('needs_approval');

    const resPass = verifyMandate(baseIntentMandate, baseProposal, {
      ...baseContext,
      itemCategory: 'laptops',
    });
    expect(resPass.failing_rules).not.toContain('CATEGORY_NOT_ALLOWED');
  });

  it('RULE 10: VENDOR_NOT_APPROVED - fails when vendor is not whitelisted; passes when approved', () => {
    const unapprovedProposal: Proposal = {
      ...baseProposal,
      payload: { ...baseProposal.payload, vendor_id: 'sketchy_vendor_x' },
    };
    const resFail = verifyMandate(baseIntentMandate, unapprovedProposal, baseContext);
    expect(resFail.failing_rules).toContain('VENDOR_NOT_APPROVED');
    expect(resFail.result).toBe('needs_approval');

    const resPass = verifyMandate(baseIntentMandate, baseProposal, baseContext);
    expect(resPass.failing_rules).not.toContain('VENDOR_NOT_APPROVED');
  });

  it('RULE 11: CURRENCY_MISMATCH - fails when currency does not match policy; passes when identical', () => {
    const eurProposal: Proposal = {
      ...baseProposal,
      payload: { ...baseProposal.payload, currency: 'EUR' },
    };
    const resFail = verifyMandate(baseIntentMandate, eurProposal, baseContext);
    expect(resFail.failing_rules).toContain('CURRENCY_MISMATCH');
    expect(resFail.result).toBe('needs_approval');

    const resPass = verifyMandate(baseIntentMandate, baseProposal, baseContext);
    expect(resPass.failing_rules).not.toContain('CURRENCY_MISMATCH');
  });

  it('RULE 12: UNIT_PRICE_EXCEEDED - fails when unit price exceeds max cap; passes when under', () => {
    const expensiveProposal: Proposal = {
      ...baseProposal,
      payload: { ...baseProposal.payload, unit_price: 1800 },
    };
    const resFail = verifyMandate(baseIntentMandate, expensiveProposal, baseContext);
    expect(resFail.failing_rules).toContain('UNIT_PRICE_EXCEEDED');
    expect(resFail.result).toBe('needs_approval');

    const resPass = verifyMandate(baseIntentMandate, baseProposal, baseContext);
    expect(resPass.failing_rules).not.toContain('UNIT_PRICE_EXCEEDED');
  });

  it('RULE 13: OVER_BENCHMARK - fails when price is too far above market benchmark', () => {
    // Benchmark 1000, unit_price 1400 (40% over benchmark, policy allows max 10%)
    const overBenchmarkProposal: Proposal = {
      ...baseProposal,
      benchmark: {
        source: 'channel3',
        market_price: 1000,
        checked_at: '2026-11-01T12:00:00Z',
      },
    };
    const resFail = verifyMandate(baseIntentMandate, overBenchmarkProposal, baseContext);
    expect(resFail.failing_rules).toContain('OVER_BENCHMARK');
    expect(resFail.result).toBe('needs_approval');

    const resPass = verifyMandate(baseIntentMandate, baseProposal, baseContext);
    expect(resPass.failing_rules).not.toContain('OVER_BENCHMARK');
  });

  it('RULE 14: MONTHLY_CAP_EXCEEDED - fails when order total exceeds remaining monthly budget', () => {
    // Order total is 1400, budget is 500
    const resFail = verifyMandate(baseIntentMandate, baseProposal, {
      ...baseContext,
      remainingMonthlyBudget: 500,
    });
    expect(resFail.failing_rules).toContain('MONTHLY_CAP_EXCEEDED');
    expect(resFail.result).toBe('needs_approval');

    const resPass = verifyMandate(baseIntentMandate, baseProposal, {
      ...baseContext,
      remainingMonthlyBudget: 2000,
    });
    expect(resPass.failing_rules).not.toContain('MONTHLY_CAP_EXCEEDED');
  });

  it('RULE 15: BREAKER_OPEN - fails when breaker is open or kill switch active', () => {
    const resBreaker = verifyMandate(baseIntentMandate, baseProposal, {
      ...baseContext,
      circuitBreakerOpen: true,
    });
    expect(resBreaker.failing_rules).toContain('BREAKER_OPEN');
    expect(resBreaker.result).toBe('blocked');

    const resKillSwitch = verifyMandate(baseIntentMandate, baseProposal, {
      ...baseContext,
      killSwitchActive: true,
    });
    expect(resKillSwitch.failing_rules).toContain('BREAKER_OPEN');
    expect(resKillSwitch.result).toBe('blocked');

    const resPass = verifyMandate(baseIntentMandate, baseProposal, {
      ...baseContext,
      circuitBreakerOpen: false,
      killSwitchActive: false,
    });
    expect(resPass.failing_rules).not.toContain('BREAKER_OPEN');
  });

  it('RULE 16: MODE_NOT_AUTO - fails auto-execution when policy mode is shadow or suggest', () => {
    const suggestMandate: IntentMandate = {
      ...baseIntentMandate,
      constraints: { ...baseIntentMandate.constraints, mode: 'suggest' },
    };
    const resSuggest = verifyMandate(suggestMandate, baseProposal, baseContext);
    expect(resSuggest.failing_rules).toContain('MODE_NOT_AUTO');
    expect(resSuggest.result).toBe('needs_approval');

    const autoMandate: IntentMandate = {
      ...baseIntentMandate,
      constraints: { ...baseIntentMandate.constraints, mode: 'auto_under_cap' },
    };
    const resAuto = verifyMandate(autoMandate, baseProposal, baseContext);
    expect(resAuto.failing_rules).not.toContain('MODE_NOT_AUTO');
    expect(resAuto.result).toBe('auto_approved');
  });
});

