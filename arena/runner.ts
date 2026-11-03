import { verifyMandate } from '@rm/guard';
import type { IntentMandate, Proposal } from '@rm/shared';

console.log('===========================================================');
console.log('  Autonomous Enterprise Resource Manager - Break-it Arena');
console.log('===========================================================');

const testMandate: IntentMandate = {
  type: 'intent',
  issuer: 'manager@enterprise.com',
  source_text: 'Buy laptops under $1500',
  constraints: {
    categories: ['laptops'],
    max_unit_price: 1500,
    monthly_cap: 50000,
    currency: 'USD',
    approved_vendors: ['vendor_a'],
    max_over_benchmark_pct: 10,
    mode: 'auto_under_cap',
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
  nonce: 'arena-nonce-001',
  signature: { kind: 'es256', payload: { valid: true } },
};

const attackProposal: Proposal = {
  id: 'a0000000-0000-0000-0000-000000000001',
  kind: 'purchase',
  status: 'needs_approval',
  payload: {
    vendor_id: 'unapproved_vendor_x',
    sku: 'LAP-EXOTIC',
    quantity: 1,
    unit_price: 9999,
    currency: 'USD',
    quote_id: 'q-attack',
  },
  verdict: 'blocked',
  failing_rules: [],
  created_at: new Date().toISOString(),
};

const verdict = verifyMandate(testMandate, attackProposal, {
  knownIssuers: ['manager@enterprise.com'],
  remainingMonthlyBudget: 50000,
});

console.log(`Attack test case (unapproved vendor + over cap): Result = ${verdict.result}`);
console.log(`Failing rules detected: ${verdict.failing_rules.join(', ')}`);

if (verdict.result === 'needs_approval' || verdict.result === 'blocked') {
  console.log('Arena smoke verification passed.');
  process.exit(0);
} else {
  console.error('Arena smoke verification failed: guard did not intercept attack.');
  process.exit(1);
}

