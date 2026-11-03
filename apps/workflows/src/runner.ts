import { randomUUID } from 'node:crypto';
import type { Policy, Proposal } from '@rm/shared';
import { GENESIS_PREV_HASH } from '@rm/ledger';
import { scanAssets } from './tasks/scanAssets.js';
import { scanSeats } from './tasks/scanSeats.js';
import { sourceAndNegotiate } from './tasks/sourceAndNegotiate.js';
import { verifyAndRoute } from './tasks/verifyAndRoute.js';
import { executePurchase, type ExecutedOrder } from './tasks/executeActions.js';

export interface WorkflowRunResult {
  run_id: string;
  trigger: 'cron' | 'manual';
  status: 'completed' | 'awaiting_approval';
  started_at: string;
  finished_at: string;
  metrics: {
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
  executed_orders: ExecutedOrder[];
  proposals: Proposal[];
  latest_ledger_hash: string;
}

/**
 * Executes a full end-to-end Autonomous Enterprise Resource Manager workflow run.
 */
export async function runWorkflow(options?: {
  policy?: Policy;
  trigger?: 'cron' | 'manual';
  asOfDate?: Date;
}): Promise<WorkflowRunResult> {
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const trigger = options?.trigger || 'manual';

  // Default active policy if none provided
  const policy: Policy = options?.policy || {
    categories: ['laptops', 'monitors', 'accessories'],
    max_unit_price: 1500,
    monthly_cap: 10000,
    currency: 'USD',
    approved_vendors: ['vendor_a', 'vendor_b'],
    max_over_benchmark_pct: 10,
    mode: 'auto_under_cap',
  };

  // 1. Scan Assets due for replacement
  const overdueAssets = await scanAssets(options?.asOfDate);

  // Group by SKU
  const skuCounts = new Map<string, { category: string; quantity: number }>();
  for (const a of overdueAssets.slice(0, 5)) {
    // Process top 5 to keep runs bounded
    const current = skuCounts.get(a.sku) || { category: a.category, quantity: 0 };
    current.quantity++;
    skuCounts.set(a.sku, current);
  }

  const itemsToSource = Array.from(skuCounts.entries()).map(([sku, info]) => ({
    sku,
    category: info.category,
    quantity: info.quantity,
  }));

  // 2. Scan SaaS seats for idle subscriptions
  const idleSubs = await scanSeats(30, options?.asOfDate);

  // 3. Source & Negotiate Pricing
  const sourcedItems = await sourceAndNegotiate(itemsToSource, policy.approved_vendors);

  // 4. Verify & Route via @rm/guard
  const routing = verifyAndRoute(sourcedItems, idleSubs.slice(0, 2), policy);

  // 5. Execute Auto-Approved Purchases
  const executedOrders: ExecutedOrder[] = [];
  let currentLedgerHash = GENESIS_PREV_HASH;
  let totalSpend = 0;

  for (const autoProposal of routing.autoApproved) {
    const { executedOrder, newHash } = executePurchase(autoProposal, currentLedgerHash);
    executedOrders.push(executedOrder);
    currentLedgerHash = newHash;
    totalSpend += executedOrder.amount;
  }

  // Calculate SaaS monthly savings
  const totalSaaSSavings = idleSubs
    .slice(0, 2)
    .reduce((acc, s) => acc + s.monthly_cost, 0);

  const allProposals = [...routing.autoApproved, ...routing.needsApproval, ...routing.blocked];

  return {
    run_id: runId,
    trigger,
    status: routing.needsApproval.length > 0 ? 'awaiting_approval' : 'completed',
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    metrics: {
      assets_scanned: overdueAssets.length,
      overdue_assets_found: overdueAssets.length,
      subscriptions_scanned: idleSubs.length,
      idle_subscriptions_found: idleSubs.length,
      proposals_generated: allProposals.length,
      auto_approved_orders: executedOrders.length,
      awaiting_approval_proposals: routing.needsApproval.length,
      total_spend_executed: totalSpend,
      projected_monthly_savings: totalSaaSSavings,
    },
    executed_orders: executedOrders,
    proposals: allProposals,
    latest_ledger_hash: currentLedgerHash,
  };
}

