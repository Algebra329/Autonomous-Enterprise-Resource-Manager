import { randomUUID } from 'node:crypto';
import type { IntentMandate, Policy, Proposal } from '@rm/shared';
import {
  generateEs256KeyPair,
  hashMandatePayload,
  makeEs256Verifier,
  signMandateHashEs256,
  verifyMandate,
  type Jwk,
} from '@rm/guard';
import { AgentTools } from './tools.js';

const runtimePlannerKeys = generateEs256KeyPair();
const DEFAULT_PLANNER_ISSUER = 'manager-agent';

export interface HardwareNeed {
  sku: string;
  quantity: number;
  category: string;
  name?: string;
}

export interface IdleSaaSNeed {
  subscription_id: string;
  app: string;
  vendor_id: string;
  monthly_cost: number;
  reason?: string;
}

export interface ProposalGenerationParams {
  policy: Policy;
  hardwareNeeds?: HardwareNeed[];
  idleSubscriptions?: IdleSaaSNeed[];
  remainingMonthlyBudget?: number;
  signedIntentMandate?: IntentMandate;
  issuerKeys?: Record<string, Jwk>;
}

/**
 * Strips prompt-injection phrases from text fields.
 */
export function sanitizeUntrustedText(text: string): string {
  if (!text) return '';
  return text
    .replace(/(?:system|admin|override|ignore\s+rules|drop\s+limits):?[^\n]*/gi, '')
    .trim();
}

/**
 * Autonomous Planner Agent:
 * Sourcing, Benchmarking, Negotiating, and Generating Schema-Validated Proposals.
 */
export async function generateProposals(
  params: ProposalGenerationParams,
  tools: AgentTools = new AgentTools()
): Promise<Proposal[]> {
  const proposals: Proposal[] = [];
  const { policy, hardwareNeeds = [], idleSubscriptions = [], remainingMonthlyBudget = 50000 } = params;

  // 1. Process Hardware Purchasing Needs
  for (const item of hardwareNeeds) {
    // A. Query Channel3 for Price Benchmark
    const benchmark = await tools.channel3_search(item.sku);

    // B. Get quotes from approved vendors in policy
    const quotes = [];
    for (const vId of policy.approved_vendors) {
      if (vId === 'vendor_a' || vId === 'vendor_b') {
        const quote = await tools.vendor_quote(item.sku, item.quantity, vId);
        quotes.push(quote);
      }
    }

    if (quotes.length === 0) continue;

    // Pick best initial quote
    quotes.sort((a, b) => a.unit_price - b.unit_price);
    let bestQuote = quotes[0]!;

    // C. Negotiate if price exceeds market benchmark
    if (bestQuote.unit_price > benchmark.market_price) {
      const counterRes = await tools.vendor_counter(bestQuote, benchmark.market_price);
      if (counterRes.decision === 'revised' || counterRes.decision === 'accepted') {
        bestQuote = {
          ...bestQuote,
          quote_id: counterRes.quote_id,
          unit_price: counterRes.unit_price,
        };
      }
    }

    // D. Pre-evaluate with @rm/guard verifier to determine verdict
    const simulatedProposal: Proposal = {
      id: randomUUID(),
      kind: 'purchase',
      status: 'needs_approval',
      payload: {
        vendor_id: bestQuote.vendor_id,
        sku: bestQuote.sku,
        quantity: bestQuote.quantity,
        unit_price: bestQuote.unit_price,
        currency: bestQuote.currency,
        quote_id: bestQuote.quote_id,
      },
      benchmark: {
        source: benchmark.source,
        market_price: benchmark.market_price,
        checked_at: benchmark.checked_at,
        title: sanitizeUntrustedText(benchmark.title),
      },
      verdict: 'auto_approved',
      failing_rules: [],
    };

    const registry: Record<string, Jwk> = params.issuerKeys ?? {
      [DEFAULT_PLANNER_ISSUER]: runtimePlannerKeys.publicJwk,
    };
    const verifier = makeEs256Verifier(registry);

    let intentMandate: IntentMandate;
    if (params.signedIntentMandate) {
      intentMandate = params.signedIntentMandate;
    } else {
      const unsignedMandate: IntentMandate = {
        type: 'intent',
        issuer: DEFAULT_PLANNER_ISSUER,
        source_text: 'Autonomous policy planner',
        constraints: policy,
        expires: new Date(Date.now() + 3600000).toISOString(),
        nonce: `nonce-${Date.now()}-${randomUUID().substring(0, 6)}`,
      };
      intentMandate = {
        ...unsignedMandate,
        signature: signMandateHashEs256(
          hashMandatePayload(unsignedMandate),
          runtimePlannerKeys.privateKey
        ),
      };
    }

    // Evaluate with @rm/guard verifier using real ES256 key verification
    const verdict = verifyMandate(intentMandate, simulatedProposal, {
      knownIssuers: Object.keys(registry),
      remainingMonthlyBudget,
      currentMarketPrice: benchmark.market_price,
      itemCategory: item.category,
      verifySignature: verifier,
    });

    simulatedProposal.verdict = verdict.result;
    simulatedProposal.failing_rules = verdict.failing_rules;
    simulatedProposal.status =
      verdict.result === 'auto_approved'
        ? 'auto_approved'
        : verdict.result === 'blocked'
          ? 'blocked'
          : 'needs_approval';
    simulatedProposal.reason = verdict.reason;

    proposals.push(simulatedProposal);
  }

  // 2. Process Idle SaaS Cancellations
  for (const sub of idleSubscriptions) {
    const cancelProposal: Proposal = {
      id: randomUUID(),
      kind: 'cancel',
      status: 'needs_approval',
      payload: {
        vendor_id: sub.vendor_id,
        sku: sub.app,
        quantity: 1,
        unit_price: sub.monthly_cost,
        currency: 'USD',
        quote_id: `cancel-${sub.subscription_id}`,
        app: sub.app,
        subscription_id: sub.subscription_id,
        savings_monthly: sub.monthly_cost,
      },
      verdict: 'needs_approval',
      failing_rules: [],
      reason: sanitizeUntrustedText(
        sub.reason || `SaaS subscription ${sub.app} identified as idle. Monthly savings: $${sub.monthly_cost}`
      ),
      created_at: new Date().toISOString(),
    };

    proposals.push(cancelProposal);
  }

  return proposals;
}

