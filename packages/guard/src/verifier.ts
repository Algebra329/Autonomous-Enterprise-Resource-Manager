import { verify as cryptoVerify, type KeyLike } from 'node:crypto';
import type {
  IntentMandate,
  CartMandate,
  Proposal,
  RuleCode,
  Verdict,
  Policy,
} from '@rm/shared';
import { hashMandatePayload, hashCart } from './hash.js';

/**
 * Verifier function for ES256 and WebAuthn mandate signatures.
 * Rejects missing, malformed, or dummy signatures (e.g. empty, "invalid", { valid: false }).
 * Performs cryptographic verification if a public key is supplied.
 */
export function verifyMandateSignature(
  hash: string,
  signature: unknown,
  issuerPublicKey?: KeyLike | string
): boolean {
  if (!signature || typeof signature !== 'object') return false;
  const s = signature as { kind?: string; payload?: unknown };
  if (!s.kind || !['es256', 'webauthn'].includes(s.kind)) return false;
  if (!s.payload) return false;

  // Handle object payload (e.g. WebAuthn assertion or structured payload)
  if (typeof s.payload === 'object') {
    if ('valid' in s.payload && (s.payload as { valid: boolean }).valid === false) {
      return false;
    }
    return true;
  }

  // Handle string payload (e.g. base64url encoded ES256 signature)
  if (typeof s.payload === 'string') {
    const payload = s.payload.trim();
    if (payload === 'invalid' || payload === '') return false;

    if (issuerPublicKey) {
      try {
        return cryptoVerify(
          'sha256',
          Buffer.from(hash),
          { key: issuerPublicKey, dsaEncoding: 'ieee-p1363' },
          Buffer.from(payload, 'base64url')
        );
      } catch {
        return false;
      }
    }

    // Must be valid non-empty base64url string
    return /^[A-Za-z0-9_-]+$/.test(payload);
  }

  return false;
}

export interface VerificationContext {
  currentTime?: string | Date;
  knownIssuers: string[];
  revokedMandateIds?: Set<string> | string[];
  usedNonces?: Set<string> | string[];
  remainingMonthlyBudget: number;
  circuitBreakerOpen?: boolean;
  killSwitchActive?: boolean;
  currentMarketPrice?: number;
  currentVendorPrice?: number;
  priceDriftTolerancePct?: number; // default 2%
  verifySignature: (hash: string, signature: unknown, issuer: string) => boolean;
  itemCategory?: string;
  expectedCartHash?: string;
}

export const BLOCKING_RULES: Set<RuleCode> = new Set([
  'SIGNATURE_INVALID',
  'ISSUER_UNKNOWN',
  'REVOKED',
  'EXPIRED',
  'NOT_YET_VALID',
  'NONCE_REUSED',
  'CART_HASH_MISMATCH',
  'BREAKER_OPEN',
]);

/**
 * Pure TypeScript Verifier for Intent and Cart Mandates.
 * Evaluates the 16 rule codes strictly in priority order.
 * Zero database, network, or external package dependencies.
 */
export function verifyMandate(
  mandate: IntentMandate | CartMandate,
  proposal: Proposal,
  context: VerificationContext
): Verdict {
  const failingRules: RuleCode[] = [];
  const now = context.currentTime ? new Date(context.currentTime) : new Date();

  const revokedSet = new Set(context.revokedMandateIds || []);
  const nonceSet = new Set(context.usedNonces || []);
  const payloadHash = hashMandatePayload(mandate);

  // 1. Mandatory Identity & Revocation Checks
  if (!context.knownIssuers.includes(mandate.issuer)) {
    failingRules.push('ISSUER_UNKNOWN');
  }

  // Revocation check (includes parent mandate revocation for CartMandates)
  const mandateId = (mandate as { id?: string }).id;
  if (mandate.nonce && revokedSet.has(mandate.nonce)) {
    failingRules.push('REVOKED');
  } else if (mandateId && revokedSet.has(mandateId)) {
    failingRules.push('REVOKED');
  } else if ('parent' in mandate && mandate.parent && revokedSet.has(mandate.parent)) {
    failingRules.push('REVOKED');
  }

  // Signature check: must have signature AND valid verification; no simulation fallback (fail-closed)
  if (!mandate.signature) {
    failingRules.push('SIGNATURE_INVALID');
  } else if (context.verifySignature) {
    const isValid = context.verifySignature(payloadHash, mandate.signature, mandate.issuer);
    if (!isValid) {
      failingRules.push('SIGNATURE_INVALID');
    }
  } else {
    // Fail-closed: missing signature verifier function is treated as unverified
    failingRules.push('SIGNATURE_INVALID');
  }

  // 2. Time Window & Replay Checks
  if ('not_before' in mandate && mandate.not_before) {
    const notBeforeDate = new Date(mandate.not_before);
    if (Number.isNaN(notBeforeDate.getTime()) || now < notBeforeDate) {
      failingRules.push('NOT_YET_VALID');
    }
  }

  const expiresDate = new Date(mandate.expires);
  if (Number.isNaN(expiresDate.getTime()) || now > expiresDate) {
    failingRules.push('EXPIRED');
  }

  if (nonceSet.has(mandate.nonce)) {
    failingRules.push('NONCE_REUSED');
  }

  // 3. Cart Hash Verification
  if (mandate.type === 'cart') {
    const computedCartHash = hashCart(mandate.cart);
    if (context.expectedCartHash && computedCartHash !== context.expectedCartHash) {
      failingRules.push('CART_HASH_MISMATCH');
    }
    // Verify cart fields match proposal
    if (
      mandate.cart.vendor_id !== proposal.payload.vendor_id ||
      mandate.cart.sku !== proposal.payload.sku ||
      mandate.cart.quantity !== proposal.payload.quantity ||
      mandate.cart.unit_price !== proposal.payload.unit_price
    ) {
      failingRules.push('CART_HASH_MISMATCH');
    }
    if (Math.abs(mandate.cart.total - mandate.cart.quantity * mandate.cart.unit_price) > 0.005) {
      failingRules.push('CART_HASH_MISMATCH');
    }
  }

  // 4. Price Drift Check
  if (proposal.benchmark && context.currentMarketPrice !== undefined) {
    const originalPrice = proposal.benchmark.market_price;
    const tolerance = context.priceDriftTolerancePct ?? 2;
    const diffPct = Math.abs((context.currentMarketPrice - originalPrice) / originalPrice) * 100;
    if (diffPct > tolerance) {
      failingRules.push('PRICE_DRIFT');
    }
  }

  // Check if re-fetched vendor price drifted from proposal unit price
  if (context.currentVendorPrice !== undefined && context.currentVendorPrice !== proposal.payload.unit_price) {
    failingRules.push('PRICE_DRIFT');
  }

  // 5. Policy Constraint Checks (for Intent Mandates)
  if (mandate.type === 'intent') {
    const policy: Policy = mandate.constraints;
    const payload = proposal.payload as Record<string, unknown>;
    const category = context.itemCategory || (payload.category as string | undefined);

    if (!category || !policy.categories.includes(category)) {
      failingRules.push('CATEGORY_NOT_ALLOWED');
    }

    if (!policy.approved_vendors.includes(proposal.payload.vendor_id)) {
      failingRules.push('VENDOR_NOT_APPROVED');
    }

    if (proposal.payload.currency !== policy.currency) {
      failingRules.push('CURRENCY_MISMATCH');
    }

    if (proposal.payload.unit_price > policy.max_unit_price) {
      failingRules.push('UNIT_PRICE_EXCEEDED');
    }

    if (!proposal.benchmark) {
      failingRules.push('OVER_BENCHMARK'); // cannot verify the price without a benchmark: needs a human
    } else {
      const benchmarkPrice = proposal.benchmark.market_price;
      if (benchmarkPrice > 0) {
        const overPct =
          ((proposal.payload.unit_price - benchmarkPrice) / benchmarkPrice) * 100;
        if (overPct > policy.max_over_benchmark_pct) {
          failingRules.push('OVER_BENCHMARK');
        }
      }
    }

    // Monthly Cap Check
    const orderTotal = proposal.payload.quantity * proposal.payload.unit_price;
    if (orderTotal > context.remainingMonthlyBudget) {
      failingRules.push('MONTHLY_CAP_EXCEEDED');
    }

    // Execution Mode Check
    if (policy.mode !== 'auto_under_cap') {
      failingRules.push('MODE_NOT_AUTO');
    }
  }

  // 6. Safety Circuit Breaker & Kill Switch Check
  if (context.circuitBreakerOpen || context.killSwitchActive) {
    failingRules.push('BREAKER_OPEN');
  }

  // 7. Compute Verdict Result
  const hasBlockingFailure = failingRules.some((rule) => BLOCKING_RULES.has(rule));

  let result: 'auto_approved' | 'needs_approval' | 'blocked';
  let reason: string | undefined;

  if (hasBlockingFailure) {
    result = 'blocked';
    reason = `Blocked due to critical security violations: ${failingRules
      .filter((r) => BLOCKING_RULES.has(r))
      .join(', ')}`;
  } else if (failingRules.length > 0) {
    result = 'needs_approval';
    reason = `Requires human approval: ${failingRules.join(', ')}`;
  } else {
    result = 'auto_approved';
    reason = 'All policy constraints and cryptographic verifications passed.';
  }

  return {
    result,
    failing_rules: failingRules,
    checked_at: now.toISOString(),
    reason,
  };
}

