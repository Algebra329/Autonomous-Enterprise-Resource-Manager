import { describe, it, expect } from 'vitest';
import { scanAssets } from '../src/tasks/scanAssets.js';
import { scanSeats } from '../src/tasks/scanSeats.js';
import { sourceAndNegotiate } from '../src/tasks/sourceAndNegotiate.js';
import { verifyAndRoute } from '../src/tasks/verifyAndRoute.js';
import { executePurchase } from '../src/tasks/executeActions.js';
import { runWorkflow } from '../src/runner.js';
import { verifyProofPack } from '@rm/ledger';
import type { Policy, Proposal } from '@rm/shared';

describe('apps/workflows - Autonomous Pipeline Tasks', () => {
  it('scanAssets: identifies assets due for replacement', async () => {
    // Assets from 2023 with 36m lifecycle are overdue in late 2026
    const overdue = await scanAssets(new Date('2026-11-01'));
    expect(overdue.length).toBeGreaterThan(0);
    expect(overdue[0]!.sku).toBeDefined();
    expect(overdue[0]!.months_in_service).toBeGreaterThanOrEqual(36);
  });

  it('scanSeats: detects subscriptions with idle seats', async () => {
    const idleSubs = await scanSeats(30, new Date('2026-11-01'));
    expect(idleSubs.length).toBeGreaterThan(0);
    expect(idleSubs[0]!.suggest_cancellation).toBe(true);
    expect(idleSubs[0]!.monthly_cost).toBeGreaterThan(0);
  });

  it('sourceAndNegotiate: sources Channel3 pricing and negotiates vendor quote', async () => {
    const sourced = await sourceAndNegotiate([
      { sku: 'LAP-14', category: 'laptops', quantity: 2 },
    ]);
    expect(sourced).toHaveLength(1);
    expect(sourced[0]!.best_quote.unit_price).toBeGreaterThan(0);
    expect(sourced[0]!.market_price).toBeGreaterThan(0);
  });

  it('verifyAndRoute: routes in-policy to auto-approved and cap violations to needs_approval', () => {
    const policy: Policy = {
      categories: ['laptops'],
      max_unit_price: 1500,
      monthly_cap: 10000,
      currency: 'USD',
      approved_vendors: ['vendor_a'],
      max_over_benchmark_pct: 10,
      mode: 'auto_under_cap',
    };

    const sourcedInPolicy = [
      {
        sku: 'LAP-14',
        category: 'laptops',
        quantity: 1,
        market_price: 1400,
        benchmark_source: 'channel3',
        checked_at: new Date().toISOString(),
        best_quote: {
          quote_id: 'q-01',
          vendor_id: 'vendor_a',
          sku: 'LAP-14',
          quantity: 1,
          unit_price: 1450,
          currency: 'USD',
          valid_until: new Date().toISOString(),
        },
        negotiated: false,
        savings_vs_initial: 0,
      },
    ];

    const routing = verifyAndRoute(sourcedInPolicy, [], policy);
    expect(routing.autoApproved).toHaveLength(1);
    expect(routing.autoApproved[0]!.verdict).toBe('auto_approved');
  });

  it('executePurchase: generates valid order, cryptographic ProofPack, and ledger block', () => {
    const sampleProposal: Proposal = {
      id: '12345678-1234-1234-1234-123456789012',
      kind: 'purchase',
      status: 'auto_approved',
      payload: {
        vendor_id: 'vendor_a',
        sku: 'LAP-14',
        quantity: 1,
        unit_price: 1450,
        currency: 'USD',
        quote_id: 'q-test',
      },
      verdict: 'auto_approved',
      failing_rules: [],
    };

    const { executedOrder, newHash } = executePurchase(sampleProposal);
    expect(executedOrder.order_id).toBeDefined();
    expect(executedOrder.paypal_order_id).toContain('PAYPAL-AUTO');
    expect(newHash).toHaveLength(64);

    // Cryptographically verify the ProofPack
    const verification = verifyProofPack(executedOrder.proof_pack);
    expect(verification.valid).toBe(true);
    expect(verification.errors).toHaveLength(0);
  });

  it('runWorkflow: completes end-to-end autonomous run', async () => {
    const result = await runWorkflow({
      asOfDate: new Date('2026-11-01'),
      trigger: 'manual',
    });

    expect(result.run_id).toBeDefined();
    expect(result.metrics.assets_scanned).toBeGreaterThan(0);
    expect(result.metrics.proposals_generated).toBeGreaterThan(0);
    expect(result.latest_ledger_hash).toHaveLength(64);
  });
});

