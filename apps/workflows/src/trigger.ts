import { runWorkflow } from './runner.js';

async function main() {
  console.log('===========================================================');
  console.log('  Autonomous Enterprise Resource Manager - Workflow Trigger');
  console.log('===========================================================\n');

  console.log('Starting autonomous run...');
  const result = await runWorkflow({ trigger: 'manual' });

  console.log('\n--- WORKFLOW EXECUTION SUMMARY ---');
  console.log(`Run ID:            ${result.run_id}`);
  console.log(`Status:            ${result.status}`);
  console.log(`Overdue Assets:    ${result.metrics.overdue_assets_found}`);
  console.log(`Idle Subscriptions: ${result.metrics.idle_subscriptions_found}`);
  console.log(`Proposals Created: ${result.metrics.proposals_generated}`);
  console.log(`Orders Executed:   ${result.metrics.auto_approved_orders}`);
  console.log(`Awaiting Approval: ${result.metrics.awaiting_approval_proposals}`);
  console.log(`Total Spend:       $${result.metrics.total_spend_executed}`);
  console.log(`Projected Savings: $${result.metrics.projected_monthly_savings}/mo`);
  console.log(`Ledger Hash:       ${result.latest_ledger_hash.substring(0, 16)}...`);

  if (result.executed_orders.length > 0) {
    console.log('\nExecuted Orders:');
    result.executed_orders.forEach((o, i) => {
      console.log(`  ${i + 1}. Order ID: ${o.order_id}`);
      console.log(`     PayPal Order: ${o.paypal_order_id}`);
      console.log(`     Amount:       $${o.amount} ${o.currency}`);
    });
  }

  console.log('\nWorkflow run completed successfully.');
}

main().catch((err) => {
  console.error('Workflow trigger failed:', err);
  process.exit(1);
});

