import { GENESIS_PREV_HASH, createLedgerEntry } from '@rm/ledger';
import type {
  IntentMandate,
  CartMandate,
  Proposal,
  LedgerEntry,
} from '@rm/shared';

export interface OrderRecord {
  id: string;
  proposal_id: string;
  mandate: CartMandate;
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
    source: 'channel3',
    market_price: 1400,
    checked_at: new Date().toISOString(),
    title: 'Business 14 Laptop',
  },
  verdict: 'needs_approval',
  failing_rules: ['UNIT_PRICE_EXCEEDED'],
  reason: 'Above per-unit cap of $1400',
  created_at: new Date().toISOString(),
};
state.proposals.set(sampleProposal.id, sampleProposal);

