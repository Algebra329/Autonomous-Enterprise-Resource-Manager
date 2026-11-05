import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/client.js';
import { state } from '../services/state.js';
import { runWorkflow } from '@rm/workflows';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function demoReset() {
  const startTime = Date.now();
  console.log('===========================================================');
  console.log('  Autonomous Enterprise Resource Manager - Demo Reset');
  console.log('===========================================================');
  console.log('Starting full demo environment reset...\n');

  const seedDir = path.resolve(__dirname, '../../../../seed');

  // 1. Reset In-Memory State
  console.log('[reset] 1. Resetting in-memory state, nonces, and safety breakers...');
  state.mandates.clear();
  state.proposals.clear();
  state.orders.clear();
  state.ledger = [];
  state.usedNonces.clear();
  state.revokedMandateIds.clear();
  state.circuitBreakerOpen = false;
  state.killSwitchActive = false;
  state.lastBreakerTripped = null;
  state.runs.clear();

  // 2. Reset Database (if PostgreSQL is running)
  console.log('[reset] 2. Checking PostgreSQL database connection...');
  let hasPostgres = false;
  try {
    const client = await pool.connect();
    hasPostgres = true;
    try {
      console.log('[reset] PostgreSQL connected. Truncating transactional tables...');
      await client.query('BEGIN');
      const tables = [
        'orders',
        'cancellations',
        'proposals',
        'ledger',
        'breaker_events',
        'arena_runs',
        'runs',
        'revocations',
        'mandates',
        'seats',
        'saas_subscriptions',
        'assets',
      ];
      for (const tbl of tables) {
        try {
          await client.query(`TRUNCATE TABLE ${tbl} CASCADE`);
        } catch {
          // Table may not exist yet
        }
      }
      await client.query('COMMIT');

      // Seed fresh assets
      const assetsFile = path.join(seedDir, 'assets.json');
      if (fs.existsSync(assetsFile)) {
        const assets = JSON.parse(fs.readFileSync(assetsFile, 'utf8'));
        for (const a of assets) {
          await client.query(
            `INSERT INTO assets (id, asset_tag, name, category, sku, purchased_at, replace_after_months, status, assigned_to, purchase_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO NOTHING`,
            [a.id, a.asset_tag || null, a.name, a.category, a.sku || null, a.purchased_at, a.replace_after_months || 36, a.status || 'active', a.assigned_to || null, a.purchase_price || null]
          );
        }
      }

      // Seed fresh SaaS
      const saasFile = path.join(seedDir, 'saas.json');
      if (fs.existsSync(saasFile)) {
        const saas = JSON.parse(fs.readFileSync(saasFile, 'utf8'));
        for (const s of saas) {
          await client.query(
            `INSERT INTO saas_subscriptions (id, app, vendor_id, paypal_enabled, paypal_subscription_id, seat_price, seat_count, monthly_cost, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO NOTHING`,
            [s.id, s.app, s.vendor_id, s.paypal_enabled ?? false, s.paypal_subscription_id || null, s.seat_price || null, s.seat_count || 0, s.monthly_cost, s.status || 'active']
          );
        }
      }
      console.log('[reset] PostgreSQL tables truncated and re-seeded cleanly.');
    } finally {
      client.release();
    }
  } catch {
    console.log('[reset] Notice: Local Postgres not running (operating in in-memory / fixture mode).');
  }

  // 3. Trigger 1 Golden-Path Autonomous Workflow Run
  console.log('[reset] 3. Executing Golden-Path autonomous workflow run...');
  const runResult = await runWorkflow({
    policy: {
      categories: ['laptops', 'monitors', 'accessories'],
      max_unit_price: 1500,
      monthly_cap: 8000,
      currency: 'USD',
      approved_vendors: ['vendor_a', 'vendor_b'],
      max_over_benchmark_pct: 10,
      mode: 'auto_under_cap',
    },
    trigger: 'manual',
  });

  // Populate in-memory state with freshly generated run results
  for (const proposal of runResult.proposals) {
    state.proposals.set(proposal.id, proposal);
  }
  for (const order of runResult.executed_orders) {
    state.orders.set(order.order_id, {
      id: order.order_id,
      proposal_id: order.proposal_id,
      mandate: order.proof_pack.mandate as any,
      vendor_id: order.proof_pack.vendor_quote.vendor_id,
      sku: order.proof_pack.vendor_quote.sku,
      quantity: order.proof_pack.vendor_quote.quantity,
      unit_price: order.proof_pack.vendor_quote.unit_price,
      amount: order.amount,
      currency: order.currency,
      paypal_order_id: order.paypal_order_id,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    });
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n===========================================================');
  console.log(`  DEMO RESET COMPLETE IN ${durationSec}s (< 90s target)`);
  console.log('===========================================================');
  console.log(`Run ID:                 ${runResult.run_id}`);
  console.log(`Workflow Status:        ${runResult.status}`);
  console.log(`Hardware Scanned:       ${runResult.metrics.assets_scanned}`);
  console.log(`Overdue Assets Found:   ${runResult.metrics.overdue_assets_found}`);
  console.log(`Idle Subscriptions:     ${runResult.metrics.idle_subscriptions_found}`);
  console.log(`Proposals Created:      ${runResult.metrics.proposals_generated}`);
  console.log(`Orders Auto-Executed:   ${runResult.metrics.auto_approved_orders} (Spend: $${runResult.metrics.total_spend_executed})`);
  console.log(`Awaiting Approval:      ${runResult.metrics.awaiting_approval_proposals}`);
  console.log(`Projected Savings:      $${runResult.metrics.projected_monthly_savings}/mo`);
  console.log(`Latest Ledger Hash:     ${runResult.latest_ledger_hash.substring(0, 16)}...`);
  console.log('===========================================================');
  console.log('Environment is primed and ready for demo recording / UI testing.\n');

  process.exit(0);
}

demoReset().catch((err) => {
  console.error('[reset] Fatal error during demo reset:', err);
  process.exit(1);
});
