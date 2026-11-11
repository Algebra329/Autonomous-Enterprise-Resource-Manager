import type {
  CartMandate,
  DashboardApprovalsSource,
  DashboardBacktestSource,
  DashboardBlockedAttemptsSource,
  DashboardBreakerSource,
  DashboardMandateUsageSource,
  DashboardSeatSavingsSource,
  DashboardSpendSource,
  IntentMandate,
  LedgerEntry,
  Policy,
  PolicyCompileResponse,
  ProofPack,
  Proposal,
  Signature,
} from '@rm/shared';
import type { BrowserSigner, Es256PublicJwk } from './crypto';

const API_OVERRIDE_KEY = 'aerm_api_url_override_v1';

export const DEFAULT_API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:4000'
).replace(/\/+$/, '');

export function getApiBaseUrl(): string {
  try {
    const override = localStorage.getItem(API_OVERRIDE_KEY)?.trim();
    if (override && /^https?:\/\//i.test(override)) {
      return override.replace(/\/+$/, '');
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_API_URL;
}

export function setApiBaseUrlOverride(url: string | null): void {
  if (!url || !url.trim()) {
    localStorage.removeItem(API_OVERRIDE_KEY);
    return;
  }
  localStorage.setItem(API_OVERRIDE_KEY, url.trim().replace(/\/+$/, ''));
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  rule?: string;
  failing_rules?: string[];

  constructor(params: {
    status: number;
    code: string;
    message: string;
    rule?: string;
    failing_rules?: string[];
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.status = params.status;
    this.code = params.code;
    this.rule = params.rule;
    this.failing_rules = params.failing_rules;
  }
}

interface RawApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    rule?: string;
    failing_rules?: string[];
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Network error reaching backend API';
    throw new ApiClientError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: `Cannot reach API at ${getApiBaseUrl()} (${message})`,
    });
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const errBody = (parsed || {}) as RawApiErrorBody;
    throw new ApiClientError({
      status: res.status,
      code: errBody.error?.code || `HTTP_${res.status}`,
      message: errBody.error?.message || `API request failed (${res.status})`,
      rule: errBody.error?.rule,
      failing_rules: errBody.error?.failing_rules,
    });
  }

  return parsed as T;
}

export interface HealthResponse {
  status: string;
  service: string;
  time: string;
}

export interface StoredMandateRecord extends Omit<IntentMandate, 'type'> {
  type: 'intent' | 'cart';
  id: string;
  status: string;
  created_at: string;
}

export interface RegisterIntentResponse {
  id: string;
  payload_hash: string;
  status: string;
}

export interface ApproveProposalResponse {
  status: string;
  order_id: string;
  paypal_order_id: string;
  ledger_seq: number;
  ledger_hash: string;
}

export interface RejectProposalResponse {
  id: string;
  status: string;
  reason: string;
}

export interface OrderSummary {
  id: string;
  proposal_id: string;
  vendor_id: string;
  sku: string;
  quantity: number;
  unit_price: number;
  amount: number;
  currency: string;
  paypal_order_id: string;
  status: string;
  created_at: string;
  issuer: string;
  mandate_type: 'intent' | 'cart';
}

export interface LedgerResponse {
  chain_status: 'VALID' | 'TAMPERED';
  total_entries: number;
  filtered_entries: number;
  entries: LedgerEntry[];
}

export interface BreakerStatusResponse {
  circuit_breaker: {
    state: 'open' | 'closed';
    last_tripped: string | null;
    rules: {
      max_orders_per_hour: number;
      max_spend_per_hour: number;
      over_benchmark_pct: number;
    };
    rolling_metrics: {
      orders_last_hour: number;
      spend_last_hour: number;
    };
  };
  kill_switch_active: boolean;
}

export interface KillSwitchResponse {
  status: string;
  kill_switch_active: boolean;
  circuit_breaker_open: boolean;
  revoked_mandates_count: number;
  message: string;
}

export interface SafetyResetResponse {
  status: string;
  kill_switch_active: boolean;
  circuit_breaker_open: boolean;
  message: string;
}

export interface RunSummary {
  id: string;
  trigger: string;
  status: string;
  mode: string;
  started_at: string;
  finished_at: string;
  proposals_generated: number;
  metrics?: {
    assets_scanned: number;
    overdue_assets_found: number;
    subscriptions_scanned: number;
    idle_subscriptions_found: number;
    proposals_generated: number;
    auto_approved_orders: number;
    awaiting_approval_proposals: number;
    total_spend_executed: number;
    projected_monthly_savings: number;
  };
}

export interface ArenaCategoryStat {
  safety_pass: string;
  rule_match: string;
  skipped: number;
}

export interface ArenaSummaryResponse {
  layer: string;
  generated_at: string;
  attacks_run: number;
  safety_pass: number;
  by_category: Record<string, ArenaCategoryStat>;
  control_false_block_rate: string;
  skipped: Array<{ id: string; why: string }>;
  failures: Array<Record<string, unknown>>;
  diagnostics: Array<Record<string, unknown>>;
}

export interface BacktestResponse {
  generated_for?: string;
  as_of?: string;
  synthetic?: boolean;
  backtest: {
    method: string;
    policy: Policy;
    summary: {
      n_purchases: number;
      counts: {
        auto_approved: number;
        escalated: number;
        blocked: number;
        observed: number;
      };
      realized_savings: number;
      potential_savings: number;
      realized_savings_pct_of_human_spend: number;
      human_spend_total_usd: number;
      spend_held_by_breaker_usd: number;
    };
    weekly: DashboardBacktestSource[];
  };
}

export const api = {
  getHealth: () => requestJson<HealthResponse>('/health'),

  compilePolicy: (text: string) =>
    requestJson<PolicyCompileResponse>('/v1/policies/compile', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  registerIntentMandate: (
    mandate: IntentMandate & { public_key?: Es256PublicJwk }
  ) =>
    requestJson<RegisterIntentResponse>('/v1/mandates/intent', {
      method: 'POST',
      body: JSON.stringify(mandate),
    }),

  listMandates: (status?: string) =>
    requestJson<StoredMandateRecord[]>(
      status ? `/v1/mandates?status=${encodeURIComponent(status)}` : '/v1/mandates'
    ),

  revokeMandate: (id: string, reason?: string) =>
    requestJson<{ id: string; status: string; reason: string }>(
      `/v1/mandates/${encodeURIComponent(id)}/revoke`,
      {
        method: 'POST',
        body: JSON.stringify(reason ? { reason } : {}),
      }
    ),

  getIssuerKey: (issuer: string) =>
    requestJson<{ issuer: string; algorithm: string; public_key: Es256PublicJwk }>(
      `/v1/keys/${encodeURIComponent(issuer)}`
    ),

  registerIssuerKey: (issuer: string, publicKey: Es256PublicJwk) =>
    requestJson<{ issuer: string; algorithm: string; public_key: Es256PublicJwk }>(
      `/v1/keys/${encodeURIComponent(issuer)}`,
      {
        method: 'POST',
        body: JSON.stringify({ public_key: publicKey }),
      }
    ),

  listProposals: (status?: string) =>
    requestJson<Proposal[]>(
      status
        ? `/v1/proposals?status=${encodeURIComponent(status)}`
        : '/v1/proposals'
    ),

  approveProposal: (
    id: string,
    payload: { cart_mandate: CartMandate; signature: Signature }
  ) =>
    requestJson<ApproveProposalResponse>(
      `/v1/proposals/${encodeURIComponent(id)}/approve`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  rejectProposal: (id: string, reason: string) =>
    requestJson<RejectProposalResponse>(
      `/v1/proposals/${encodeURIComponent(id)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    ),

  listOrders: () => requestJson<OrderSummary[]>('/v1/orders'),

  getProofPack: (orderId: string) =>
    requestJson<ProofPack>(`/v1/orders/${encodeURIComponent(orderId)}/proof-pack`),

  getLedger: (type?: string) =>
    requestJson<LedgerResponse>(
      type ? `/v1/ledger?type=${encodeURIComponent(type)}` : '/v1/ledger'
    ),

  getSpendSource: () => requestJson<DashboardSpendSource[]>('/v1/dashboard/spend'),
  getSeatSavingsSource: () =>
    requestJson<DashboardSeatSavingsSource[]>('/v1/dashboard/seat_savings'),
  getApprovalsSource: () =>
    requestJson<DashboardApprovalsSource[]>('/v1/dashboard/approvals'),
  getMandateUsageSource: () =>
    requestJson<DashboardMandateUsageSource[]>('/v1/dashboard/mandate_usage'),
  getBlockedAttemptsSource: () =>
    requestJson<DashboardBlockedAttemptsSource[]>('/v1/dashboard/blocked_attempts'),
  getBreakerSource: () =>
    requestJson<DashboardBreakerSource[]>('/v1/dashboard/breaker'),
  getBacktestSource: () =>
    requestJson<DashboardBacktestSource[]>('/v1/dashboard/backtest'),

  runBacktest: (policy?: Policy) =>
    requestJson<BacktestResponse>('/v1/backtests', {
      method: 'POST',
      body: JSON.stringify(policy ? { policy } : {}),
    }),

  getBreakerStatus: () => requestJson<BreakerStatusResponse>('/v1/safety/breaker'),

  triggerKillSwitch: () =>
    requestJson<KillSwitchResponse>('/v1/safety/kill-switch', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  resetSafetyBreaker: () =>
    requestJson<SafetyResetResponse>('/v1/safety/reset', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  triggerWorkflowRun: (body?: { trigger?: 'cron' | 'manual' | 'arena'; mode?: string; policy?: Policy }) =>
    requestJson<RunSummary>('/v1/runs', {
      method: 'POST',
      body: JSON.stringify(body || { trigger: 'manual' }),
    }),

  listRuns: () => requestJson<RunSummary[]>('/v1/runs'),

  getArenaSummary: () => requestJson<ArenaSummaryResponse>('/v1/arena/summary'),
};

/**
 * Ensures the browser signer's P-256 public JWK is registered on the API (TOFU).
 */
export async function ensureSignerRegistered(signer: BrowserSigner): Promise<void> {
  try {
    await api.getIssuerKey(signer.issuer);
    return;
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) {
      await api.registerIssuerKey(signer.issuer, signer.publicJwk);
      return;
    }
    throw err;
  }
}

