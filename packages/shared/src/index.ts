import { z } from 'zod';

// ============================================================================
// 1. RULE CODES (All 16 deterministic guard rule codes from Spec 8)
// ============================================================================

export const RuleCodeSchema = z.enum([
  'SIGNATURE_INVALID',
  'ISSUER_UNKNOWN',
  'REVOKED',
  'EXPIRED',
  'NOT_YET_VALID',
  'NONCE_REUSED',
  'CART_HASH_MISMATCH',
  'PRICE_DRIFT',
  'CATEGORY_NOT_ALLOWED',
  'VENDOR_NOT_APPROVED',
  'CURRENCY_MISMATCH',
  'UNIT_PRICE_EXCEEDED',
  'OVER_BENCHMARK',
  'MONTHLY_CAP_EXCEEDED',
  'BREAKER_OPEN',
  'MODE_NOT_AUTO',
]);
export type RuleCode = z.infer<typeof RuleCodeSchema>;

// ============================================================================
// 2. POLICY DEFINITION (Spec 8)
// ============================================================================

export const PolicyModeSchema = z.enum(['shadow', 'suggest', 'auto_under_cap']);
export type PolicyMode = z.infer<typeof PolicyModeSchema>;

export const PolicySchema = z.object({
  categories: z.array(z.string()),
  max_unit_price: z.number().positive(),
  monthly_cap: z.number().positive(),
  currency: z.string().default('USD'),
  approved_vendors: z.array(z.string()),
  max_over_benchmark_pct: z.number().min(0).default(10),
  mode: PolicyModeSchema.default('auto_under_cap'),
});
export type Policy = z.infer<typeof PolicySchema>;

// ============================================================================
// 3. SIGNATURES & MANDATES (Spec 8)
// ============================================================================

export const SignatureKindSchema = z.enum(['webauthn', 'es256']);
export type SignatureKind = z.infer<typeof SignatureKindSchema>;

export const SignatureSchema = z.object({
  kind: SignatureKindSchema,
  payload: z.union([z.string(), z.record(z.unknown())]),
});
export type Signature = z.infer<typeof SignatureSchema>;

export const IntentMandateSchema = z.object({
  type: z.literal('intent'),
  issuer: z.string(),
  source_text: z.string(),
  constraints: PolicySchema,
  not_before: z.string().datetime({ offset: true }).optional(),
  expires: z.string().datetime({ offset: true }),
  nonce: z.string(),
  signature: SignatureSchema.optional(),
});
export type IntentMandate = z.infer<typeof IntentMandateSchema>;

export const CartItemSchema = z.object({
  vendor_id: z.string(),
  sku: z.string(),
  quantity: z.number().int().positive(),
  unit_price: z.number().positive(),
  total: z.number().positive(),
  currency: z.string().default('USD'),
  quote_id: z.string().optional(),
});
export type CartItem = z.infer<typeof CartItemSchema>;

export const CartSchema = z.object({
  vendor_id: z.string(),
  sku: z.string(),
  quantity: z.number().int().positive(),
  unit_price: z.number().positive(),
  total: z.number().positive(),
  currency: z.string().default('USD'),
  quote_id: z.string().optional(),
  items: z.array(CartItemSchema).optional(),
});
export type Cart = z.infer<typeof CartSchema>;

export const CartMandateSchema = z.object({
  type: z.literal('cart'),
  issuer: z.string(),
  parent: z.string().optional(), // parent intent mandate id
  cart: CartSchema,
  nonce: z.string(),
  not_before: z.string().datetime({ offset: true }).optional(),
  expires: z.string().datetime({ offset: true }),
  signature: SignatureSchema.optional(),
});
export type CartMandate = z.infer<typeof CartMandateSchema>;

export const MandateStatusSchema = z.enum(['active', 'revoked', 'expired', 'used']);
export type MandateStatus = z.infer<typeof MandateStatusSchema>;

// ============================================================================
// 4. VERDICT & PROPOSAL (Spec 7.1, Spec 8)
// ============================================================================

export const VerdictResultSchema = z.enum(['auto_approved', 'needs_approval', 'blocked']);
export type VerdictResult = z.infer<typeof VerdictResultSchema>;

export const VerdictSchema = z.object({
  result: VerdictResultSchema,
  failing_rules: z.array(RuleCodeSchema),
  checked_at: z.string(),
  reason: z.string().optional(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

export const ProposalKindSchema = z.enum(['purchase', 'cancel']);
export type ProposalKind = z.infer<typeof ProposalKindSchema>;

export const ProposalStatusSchema = z.enum([
  'needs_approval',
  'auto_approved',
  'blocked',
  'executed',
  'rejected',
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const ProposalPayloadSchema = z.object({
  vendor_id: z.string(),
  sku: z.string(),
  quantity: z.number().int().positive(),
  unit_price: z.number().positive(),
  currency: z.string(),
  quote_id: z.string(),
  app: z.string().optional(),
  subscription_id: z.string().optional(),
  savings_monthly: z.number().optional(),
});
export type ProposalPayload = z.infer<typeof ProposalPayloadSchema>;

export const ProposalBenchmarkSchema = z.object({
  source: z.string(),
  market_price: z.number().positive(),
  checked_at: z.string(),
  title: z.string().optional(),
});
export type ProposalBenchmark = z.infer<typeof ProposalBenchmarkSchema>;

export const ProposalSchema = z.object({
  id: z.string().uuid(),
  run_id: z.string().uuid().optional(),
  kind: ProposalKindSchema,
  status: ProposalStatusSchema,
  payload: ProposalPayloadSchema,
  benchmark: ProposalBenchmarkSchema.optional(),
  verdict: VerdictResultSchema,
  failing_rules: z.array(RuleCodeSchema),
  reason: z.string().optional(),
  created_at: z.string().optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

// ============================================================================
// 5. VENDOR INTERFACE (Spec 7.2)
// ============================================================================

export const VendorQuoteSchema = z.object({
  quote_id: z.string(),
  vendor_id: z.string(),
  sku: z.string(),
  quantity: z.number().int().positive(),
  unit_price: z.number().positive(),
  currency: z.string().default('USD'),
  valid_until: z.string(),
});
export type VendorQuote = z.infer<typeof VendorQuoteSchema>;

export const VendorCounterRequestSchema = z.object({
  quote_id: z.string(),
  proposed_unit_price: z.number().positive(),
});
export type VendorCounterRequest = z.infer<typeof VendorCounterRequestSchema>;

export const VendorCounterDecisionSchema = z.enum(['accepted', 'revised', 'rejected']);
export type VendorCounterDecision = z.infer<typeof VendorCounterDecisionSchema>;

export const VendorCounterResponseSchema = z.object({
  decision: VendorCounterDecisionSchema,
  quote_id: z.string(),
  unit_price: z.number().positive(),
  valid_until: z.string(),
});
export type VendorCounterResponse = z.infer<typeof VendorCounterResponseSchema>;
export type VendorCounter = VendorCounterResponse;

export const VendorOrderRequestSchema = z.object({
  quote_id: z.string(),
  cart_hash: z.string(),
  mandate_ref: z.string(),
});
export type VendorOrderRequest = z.infer<typeof VendorOrderRequestSchema>;

export const VendorOrderStatusSchema = z.enum(['CREATED', 'APPROVED', 'COMPLETED', 'FAILED']);
export type VendorOrderStatus = z.infer<typeof VendorOrderStatusSchema>;

export const VendorOrderResponseSchema = z.object({
  paypal_order_id: z.string(),
  status: VendorOrderStatusSchema,
  approval_url: z.string().nullable(),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
});
export type VendorOrderResponse = z.infer<typeof VendorOrderResponseSchema>;

export const VendorCancelRequestSchema = z.object({
  subscription_id: z.string(),
  reason: z.string().optional(),
});
export type VendorCancelRequest = z.infer<typeof VendorCancelRequestSchema>;

export const VendorCancelResponseSchema = z.object({
  status: z.enum(['CANCELLED', 'FAILED']),
  subscription_id: z.string(),
  message: z.string().optional(),
});
export type VendorCancelResponse = z.infer<typeof VendorCancelResponseSchema>;

// ============================================================================
// 6. DASHBOARD DATA SOURCES (Spec 13 for AG Studio)
// ============================================================================

export const DashboardSpendSourceSchema = z.object({
  date: z.string(),
  vendor: z.string(),
  category: z.string(),
  amount: z.number(),
  benchmark_price: z.number(),
  savings_vs_benchmark: z.number(),
});
export type DashboardSpendSource = z.infer<typeof DashboardSpendSourceSchema>;

export const DashboardSeatSavingsSourceSchema = z.object({
  date: z.string(),
  app: z.string(),
  monthly_saving: z.number(),
  cumulative_saving: z.number(),
});
export type DashboardSeatSavingsSource = z.infer<typeof DashboardSeatSavingsSourceSchema>;

export const DashboardApprovalsSourceSchema = z.object({
  proposal_id: z.string(),
  kind: z.string(),
  status: z.string(),
  age_hours: z.number(),
  amount: z.number(),
});
export type DashboardApprovalsSource = z.infer<typeof DashboardApprovalsSourceSchema>;

export const DashboardMandateUsageSourceSchema = z.object({
  mandate_id: z.string(),
  cap: z.number(),
  used: z.number(),
  remaining: z.number(),
  expires: z.string(),
});
export type DashboardMandateUsageSource = z.infer<typeof DashboardMandateUsageSourceSchema>;

export const DashboardBlockedAttemptsSourceSchema = z.object({
  date: z.string(),
  source: z.enum(['agent', 'arena']),
  rule: z.string(),
  count: z.number(),
});
export type DashboardBlockedAttemptsSource = z.infer<typeof DashboardBlockedAttemptsSourceSchema>;

export const DashboardBreakerSourceSchema = z.object({
  rule: z.string(),
  state: z.enum(['closed', 'open', 'tripped']),
  last_tripped: z.string().nullable(),
});
export type DashboardBreakerSource = z.infer<typeof DashboardBreakerSourceSchema>;

export const DashboardBacktestSourceSchema = z.object({
  week: z.union([z.string(), z.number()]),
  projected_savings: z.number(),
  auto_approved: z.number(),
  escalated: z.number(),
  blocked: z.number(),
});
export type DashboardBacktestSource = z.infer<typeof DashboardBacktestSourceSchema>;

// ============================================================================
// 7. API REQUEST & RESPONSE CONTRACTS (Spec 7.1)
// ============================================================================

export const PolicyCompileRequestSchema = z.object({
  text: z.string().min(1),
});
export type PolicyCompileRequest = z.infer<typeof PolicyCompileRequestSchema>;

export const PolicyCompileResponseSchema = z.object({
  policy: PolicySchema.nullable(),
  warnings: z.array(z.string()),
  questions: z.array(z.string()),
  path: z.enum(['llm', 'fallback']).optional(),
});
export type PolicyCompileResponse = z.infer<typeof PolicyCompileResponseSchema>;

export const ProposalApproveRequestSchema = z.object({
  cart_mandate: CartMandateSchema,
  signature: SignatureSchema,
});
export type ProposalApproveRequest = z.infer<typeof ProposalApproveRequestSchema>;

export const ProposalRejectRequestSchema = z.object({
  reason: z.string().min(1),
});
export type ProposalRejectRequest = z.infer<typeof ProposalRejectRequestSchema>;

export const ProofPackSchema = z.object({
  proposal_id: z.string(),
  order_id: z.string(),
  mandate: z.union([IntentMandateSchema, CartMandateSchema]),
  mandate_hash: z.string(),
  signature: SignatureSchema,
  cart_hash: z.string(),
  vendor_quote: VendorQuoteSchema,
  ledger_hash: z.string(),
  prev_hash: z.string(),
  paypal_order_id: z.string(),
  verified_at: z.string(),
});
export type ProofPack = z.infer<typeof ProofPackSchema>;

export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    rule: RuleCodeSchema.optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

// ============================================================================
// 8. DATABASE ENTITY TYPES (Spec 6)
// ============================================================================

export const AssetEntitySchema = z.object({
  id: z.string().uuid(),
  asset_tag: z.string().optional(),
  name: z.string(),
  category: z.string(),
  sku: z.string().optional(),
  purchased_at: z.string(),
  replace_after_months: z.number().int(),
  status: z.string(),
  assigned_to: z.string().optional(),
  purchase_price: z.number().optional(),
});
export type AssetEntity = z.infer<typeof AssetEntitySchema>;

export const SaasSubscriptionEntitySchema = z.object({
  id: z.string().uuid(),
  app: z.string(),
  vendor_id: z.string(),
  paypal_enabled: z.boolean().default(false),
  paypal_subscription_id: z.string().nullable().optional(),
  seat_price: z.number().optional(),
  seat_count: z.number().int().optional(),
  monthly_cost: z.number(),
  status: z.string(),
});
export type SaasSubscriptionEntity = z.infer<typeof SaasSubscriptionEntitySchema>;

export const SeatEntitySchema = z.object({
  id: z.string().uuid(),
  subscription_id: z.string().uuid(),
  user_email: z.string(),
  last_active_at: z.string(),
});
export type SeatEntity = z.infer<typeof SeatEntitySchema>;

export const RunEntitySchema = z.object({
  id: z.string().uuid(),
  trigger: z.enum(['cron', 'manual', 'arena']),
  status: z.enum(['queued', 'running', 'awaiting_approval', 'completed', 'failed', 'halted']),
  started_at: z.string(),
  finished_at: z.string().nullable().optional(),
  mode: PolicyModeSchema.optional(),
});
export type RunEntity = z.infer<typeof RunEntitySchema>;

export const LedgerEntrySchema = z.object({
  seq: z.number().int().optional(),
  type: z.string(),
  ref_id: z.string().uuid().nullable().optional(),
  data: z.record(z.unknown()),
  prev_hash: z.string(),
  hash: z.string(),
  created_at: z.string().optional(),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const BreakerEventSchema = z.object({
  id: z.string().uuid(),
  rule: z.string(),
  details: z.record(z.unknown()),
  created_at: z.string().optional(),
});
export type BreakerEvent = z.infer<typeof BreakerEventSchema>;

