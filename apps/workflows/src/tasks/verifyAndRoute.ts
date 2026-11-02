import { randomUUID } from 'node:crypto';
import type { Policy, Proposal } from '@rm/shared';
import { verifyMandate } from '@rm/guard';
import type { SourcedItem } from './sourceAndNegotiate.js';
import type { IdleSubscriptionSummary } from './scanSeats.js';

export interface WorkflowRoutingResult {
  autoApproved: Proposal[];
  needsApproval: Proposal[];
  blocked: Proposal[];
}

/**
 * Validates candidate procurement proposals against policy mandates using @rm/guard.
 */
export function verifyAndRoute(
  sourcedItems: SourcedItem[],
  idleSubscriptions: IdleSubscriptionSummary[],
  policy: Policy,
  remainingMonthlyBudget = 50000
): WorkflowRoutingResult {
  const autoApproved: Proposal[] = [];
  const needsApproval: Proposal[] = [];
  const blocked: Proposal[] = [];

  // 1. Route Hardware Proposals
  for (const item of sourcedItems) {
    const proposal: Proposal = {
      id: randomUUID(),
      kind: 'purchase',
      status: 'needs_approval',
      payload: {
        vendor_id: item.best_quote.vendor_id,
        sku: item.best_quote.sku,
        quantity: item.best_quote.quantity,
        unit_price: item.best_quote.unit_price,
        currency: item.best_quote.currency,
        quote_id: item.best_quote.quote_id,
      },
      benchmark: {
        source: item.benchmark_source,
        market_price: item.market_price,
        checked_at: item.checked_at,
        title: item.sku,
      },
      verdict: 'auto_approved',
      failing_rules: [],
      created_at: new Date().toISOString(),
    };

    const verdict = verifyMandate(
      {
        type: 'intent',
        issuer: 'workflow-scheduler',
        source_text: 'Autonomous Scheduled Run',
        constraints: policy,
        expires: new Date(Date.now() + 86400000).toISOString(),
        nonce: `nonce-${Date.now()}-${randomUUID().substring(0, 6)}`,
        signature: { kind: 'es256', payload: { valid: true } },
      },
      proposal,
      {
        knownIssuers: ['workflow-scheduler'],
        remainingMonthlyBudget,
        itemCategory: item.category,
      }
    );

    proposal.verdict = verdict.result;
    proposal.failing_rules = verdict.failing_rules;
    proposal.reason = verdict.reason;

    if (verdict.result === 'auto_approved') {
      proposal.status = 'auto_approved';
      autoApproved.push(proposal);
    } else if (verdict.result === 'needs_approval') {
      proposal.status = 'needs_approval';
      needsApproval.push(proposal);
    } else {
      proposal.status = 'blocked';
      blocked.push(proposal);
    }
  }

  // 2. Route SaaS Cancellations (always requires manager review by default)
  for (const sub of idleSubscriptions) {
    const proposal: Proposal = {
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
      reason: sub.reason,
      created_at: new Date().toISOString(),
    };

    needsApproval.push(proposal);
  }

  return {
    autoApproved,
    needsApproval,
    blocked,
  };
}

