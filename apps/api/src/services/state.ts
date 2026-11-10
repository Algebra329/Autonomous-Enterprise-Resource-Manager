import { GENESIS_PREV_HASH, createLedgerEntry } from '@rm/ledger';
import type { Jwk } from '@rm/guard';
import type {
  IntentMandate,
  CartMandate,
  Proposal,
  LedgerEntry,
} from '@rm/shared';

export interface OrderRecord {
  id: string;
  proposal_id: string;
  mandate: IntentMandate | CartMandate;
  vendor_id: string;
  sku: string;
  quantity: number;
  unit_price: number;
  amount: number;
  currency: string;
  paypal_order_id: string;
  status: string;
  created_at: string;
}

export interface AppState {
  mandates: Map<string, (IntentMandate | CartMandate) & { id: string; status: string; created_at: string }>;
  issuerKeys: Map<string, Jwk>;
  proposals: Map<string, Proposal>;
  orders: Map<string, OrderRecord>;
  ledger: LedgerEntry[];
  usedNonces: Set<string>;
  revokedMandateIds: Set<string>;
  circuitBreakerOpen: boolean;
  killSwitchActive: boolean;
  lastBreakerTripped: string | null;
  runs: Map<string, Record<string, unknown>>;
}

export const state: AppState = {
  mandates: new Map(),
  issuerKeys: new Map(),
  proposals: new Map(),
  orders: new Map(),
  ledger: [],
  usedNonces: new Set(),
  revokedMandateIds: new Set(),
  circuitBreakerOpen: false,
  killSwitchActive: false,
  lastBreakerTripped: null,
  runs: new Map(),
};

export function isValidP256Jwk(obj: unknown): obj is Jwk {
  if (!obj || typeof obj !== 'object') return false;
  const k = obj as Record<string, unknown>;
  return (
    k.kty === 'EC' &&
    k.crv === 'P-256' &&
    typeof k.x === 'string' &&
    k.x.length > 0 &&
    typeof k.y === 'string' &&
    k.y.length > 0
  );
}

export function registerIssuerKey(
  issuer: string,
  jwk: Jwk
): { ok: true } | { ok: false; reason: string } {
  const existing = state.issuerKeys.get(issuer);
  if (existing) {
    if (existing.x === jwk.x && existing.y === jwk.y) {
      return { ok: true };
    }
    return { ok: false, reason: `Issuer "${issuer}" already registered with a different public key` };
  }
  state.issuerKeys.set(issuer, { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y });
  return { ok: true };
}

export function getIssuerRegistry(): Record<string, Jwk> {
  return Object.fromEntries(state.issuerKeys.entries());
}

// Optional MANAGER_PUBLIC_JWK bootstrap for demo environments
const rawManagerJwk = process.env.MANAGER_PUBLIC_JWK?.trim();
if (rawManagerJwk) {
  try {
    const parsed = JSON.parse(rawManagerJwk) as Record<string, unknown>;
    if (isValidP256Jwk(parsed)) {
      const defaultIssuer = process.env.MANAGER_ISSUER?.trim() || 'manager';
      registerIssuerKey(defaultIssuer, parsed);
    } else if (parsed && typeof parsed === 'object') {
      if (typeof parsed.issuer === 'string' && isValidP256Jwk(parsed.public_key)) {
        registerIssuerKey(parsed.issuer, parsed.public_key);
      } else {
        for (const [issuer, val] of Object.entries(parsed)) {
          if (isValidP256Jwk(val)) {
            registerIssuerKey(issuer, val);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[state] Failed to parse MANAGER_PUBLIC_JWK env var:', err);
  }
}

/**
 * Appends an entry to the append-only ledger state.
 */
export function recordLedgerEntry(type: string, refId: string | null, data: Record<string, unknown>): LedgerEntry {
  const prevHash = state.ledger.length > 0 ? state.ledger[state.ledger.length - 1]!.hash : GENESIS_PREV_HASH;
  const entry = createLedgerEntry({
    seq: state.ledger.length + 1,
    type,
    ref_id: refId,
    data,
    prev_hash: prevHash,
  });
  state.ledger.push(entry);
  return entry;
}

// Seed with an initial sample proposal for the UI to display immediately
const sampleProposal: Proposal = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  kind: 'purchase',
  status: 'needs_approval',
  payload: {
    vendor_id: 'vendor_a',
    sku: 'LAP-14',
    quantity: 2,
    unit_price: 1450,
    currency: 'USD',
    quote_id: 'quote-sample-01',
  },
  benchmark: {
    source: 'fixture',
    market_price: 1587.99,
    checked_at: new Date().toISOString(),
    title: 'Lenovo ThinkPad T14 Gen 5 - AI PC',
  },
  verdict: 'needs_approval',
  failing_rules: ['UNIT_PRICE_EXCEEDED'],
  reason: 'Above per-unit cap of $1400',
  created_at: new Date().toISOString(),
};
state.proposals.set(sampleProposal.id, sampleProposal);

