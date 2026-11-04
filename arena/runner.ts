/**
 * Break-it Arena runner, GUARD layer (task C4). Drives the real verifier (`verifyMandate` from @rm/guard).
 *
 *   pnpm exec tsx arena/runner.ts              # prints the table, writes arena/results/summary.json, exit 1 on any failure
 *   pnpm exec tsx arena/runner.ts --verbose    # one line per case
 *   pnpm exec tsx arena/runner.ts --no-fail    # never fail the process (use while triaging)
 *
 * How a case is judged (see arena/FORMAT.md):
 *   safety pass = none of the case's `must_not` events happened. Events are computed by an INDEPENDENT oracle in this file
 *   (it re-derives policy violations and mandate validity from the scenario), not by trusting the verifier's own answer.
 *   rule match / outcome match are diagnostics. Controls pass only if the outcome is one of the expected ones.
 *   Cases that need layers we do not have here (breaker, execution, api, agent) are SKIPPED and never counted as passes.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { generateKeyPairSync, sign, verify, randomUUID, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- ADAPTER: the only repo-specific imports. Change these two lines if the package layout changes. -----------------
import { verifyMandate, hashMandatePayload } from '@rm/guard';
import { ProposalPayloadSchema } from '@rm/shared';
// ------------------------------------------------------------------------------------------------------------------------

type J = any;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const baseline: J = JSON.parse(readFileSync(path.join(HERE, 'baseline.json'), 'utf8'));
const NOW = new Date(baseline.now).getTime();
const CAPABILITIES = new Set(['guard']); // add 'breaker', 'execution', 'api' when those layers can be driven from here
const iso = (ms: number) => new Date(ms).toISOString();

// ---- keys: a manager the verifier knows, and an attacker it does not ----------------------------------------------------
const manager = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const attacker = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const registry: Record<string, any> = { arena_manager: manager.publicKey, unknown_signer: attacker.publicKey };
const signHash = (hash: string, key: any) =>
  ({ kind: 'es256', payload: sign('sha256', Buffer.from(hash), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url') });
const verifySignature = (hash: string, sig: J, issuer: string): boolean => {
  const pub = registry[issuer];
  if (!pub || sig?.kind !== 'es256' || typeof sig.payload !== 'string') return false;
  try { return verify('sha256', Buffer.from(hash), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig.payload, 'base64url')); }
  catch { return false; }
};
const setPath = (o: J, dotted: string, v: J) => { const ks = dotted.split('.'); let t = o; for (const k of ks.slice(0, -1)) t = t[k]; t[ks[ks.length - 1]] = v; };

// ---- load cases ---------------------------------------------------------------------------------------------------------
const cases: J[] = readdirSync(path.join(HERE, 'cases')).filter((f) => f.endsWith('.json')).sort()
  .flatMap((f) => JSON.parse(readFileSync(path.join(HERE, 'cases', f), 'utf8')));

type Result = { id: string; category: string; kind: string; title: string; status: 'PASS' | 'FAIL' | 'SKIP'; outcome?: string; rules?: string[];
  events?: string[]; outcomeMatch?: boolean; ruleMatch?: boolean | null; why?: string };

function runGuardCase(c: J): Result {
  const arr = c.arrange ?? {}, act = c.act ?? {}, o = arr.mandate_overrides ?? {};
  const state = { ...baseline.state, ...(arr.state ?? {}) };
  const pol = { ...baseline.mandate.constraints, mode: baseline.mandate.mode };
  const sub: J = act.raw_json ? JSON.parse(act.raw_json) : { ...baseline[act.proposal_base ?? 'proposal'], ...(act.proposal ?? {}) };
  for (const k of act.proposal_remove ?? []) delete sub[k];

  // ---- mandate under test -------------------------------------------------------------------------------------------
  let mandate: J; let revoked: string[] = []; let cartIssues: string[] = []; let signedTotalMismatch = false;
  const cm = arr.cart_mandate;
  if (cm) {
    const signed = { ...baseline.proposal, ...(cm.signed ?? {}) };
    const total = cm.signed?.total ?? Number((signed.quantity * signed.unit_price).toFixed(2));
    const issuer = cm.signature === 'unknown_issuer' ? 'unknown_signer' : baseline.mandate.issuer;
    mandate = { type: 'cart', issuer, parent: 'intent-arena', nonce: randomBytes(12).toString('hex'), expires: iso(NOW + 900_000),
      cart: { vendor_id: signed.vendor_id, sku: signed.sku, quantity: signed.quantity, unit_price: signed.unit_price, total, currency: signed.currency } };
    if (cm.approved_flag) mandate.approved = true;
    if (cm.signature === 'valid') mandate.signature = signHash(hashMandatePayload(mandate), manager.privateKey);
    else if (cm.signature === 'unknown_issuer') mandate.signature = signHash(hashMandatePayload(mandate), attacker.privateKey);
    else if (cm.signature === 'random') mandate.signature = { kind: 'es256', payload: randomBytes(64).toString('base64url') };
    if (cm.signature !== 'valid') cartIssues.push('bad_signature');
    const exec = { vendor_id: sub.vendor_id, sku: sub.sku, quantity: sub.quantity, unit_price: sub.unit_price };
    if (exec.vendor_id !== signed.vendor_id || exec.sku !== signed.sku || exec.quantity !== signed.quantity || exec.unit_price !== signed.unit_price) cartIssues.push('cart_mismatch');
    signedTotalMismatch = Math.abs(total - signed.quantity * signed.unit_price) > 0.01;
  } else {
    mandate = { type: 'intent', issuer: baseline.mandate.issuer, source_text: 'arena', constraints: pol,
      not_before: o.not_before ?? iso(NOW + (o.not_before_offset_s ?? baseline.mandate.not_before_offset_s) * 1000),
      expires: o.expires ?? iso(NOW + (o.expires_offset_s ?? baseline.mandate.expires_offset_s) * 1000),
      nonce: randomBytes(12).toString('hex') };
    mandate.signature = signHash(hashMandatePayload(mandate), manager.privateKey);
    for (const [p, v] of Object.entries(arr.mandate_tamper ?? {})) setPath(mandate, p, v);   // edited AFTER signing
    if (o.status === 'revoked') revoked = [mandate.nonce];                                   // the verifier checks revocation by nonce
  }

  // ---- scenario truth: why this mandate is (not) valid, independent of what the verifier says -------------------------
  const invalid: string[] = [];
  const notBefore = mandate.not_before === undefined ? NaN : Date.parse(mandate.not_before), expires = Date.parse(mandate.expires);
  if (Number.isNaN(expires)) invalid.push('bad_expiry'); else if (expires < NOW) invalid.push('expired');
  if (mandate.not_before !== undefined && (Number.isNaN(notBefore) || notBefore > NOW)) invalid.push('not_yet_valid');
  if (revoked.length) invalid.push('revoked');
  if (state.nonce_used) invalid.push('nonce_reused');
  if (state.kill_switch) invalid.push('kill_switch');
  if (state.breaker_open) invalid.push('breaker_open');
  if (Object.keys(arr.mandate_tamper ?? {}).length) invalid.push('tampered');

  const steps = act.sequence?.[0]?.repeat ?? 1, spread = (act.sequence?.[0]?.spread_s ?? 0) * 1000;
  let spent = state.spent_this_month, last: { outcome: string; rules: string[] } = { outcome: 'rejected_invalid', rules: [] };
  const events = new Set<string>();

  for (let i = 0; i < steps; i++) {
    const t = NOW + (steps > 1 ? (i * spread) / (steps - 1) : 0);
    const input: J = { ...sub }; delete input.category; delete input.benchmark_price; delete input.quote_price; input.quote_id ??= 'q-arena';
    let parsed: J;
    try { parsed = ProposalPayloadSchema.safeParse(input); } catch (e) { events.add('crash'); return fin(c, last, events, 'schema parse threw'); }
    if (!parsed.success) { last = { outcome: 'rejected_invalid', rules: [] }; continue; }
    if (Object.keys(parsed.data).some((k) => /payee|account|iban/i.test(k))) events.add('payee_changed');

    const proposal: J = { id: randomUUID(), kind: 'purchase', status: 'needs_approval', payload: parsed.data, verdict: 'needs_approval', failing_rules: [],
      benchmark: act.omit_benchmark ? undefined : { source: 'arena', market_price: sub.benchmark_price, checked_at: iso(NOW) } };
    const ctx: J = { currentTime: iso(t), knownIssuers: ['arena_manager'], revokedMandateIds: revoked,
      usedNonces: state.nonce_used ? [mandate.nonce] : [], remainingMonthlyBudget: pol.monthly_cap - spent,
      circuitBreakerOpen: state.breaker_open, killSwitchActive: state.kill_switch, currentMarketPrice: sub.benchmark_price,
      priceDriftTolerancePct: baseline.price_drift_tolerance_pct, itemCategory: act.omit_item_category ? undefined : sub.category, verifySignature,
      ...(arr.context ?? {}) };

    let verdict: J;
    try { verdict = verifyMandate(mandate, proposal, ctx); } catch (e) { events.add('crash'); return fin(c, last, events, `verifier threw: ${(e as Error).message}`); }
    last = { outcome: verdict.result, rules: verdict.failing_rules };

    if (verdict.result === 'auto_approved') {                                 // ---- independent oracle: was "yes" a mistake? ----
      const unit = Number(sub.unit_price), qty = Number(sub.quantity), truth = Number(sub.benchmark_price);
      const v: string[] = [];
      if (!pol.categories.includes(sub.category)) v.push('category');
      if (!pol.approved_vendors.includes(sub.vendor_id)) v.push('vendor');
      if ((sub.currency ?? 'USD') !== pol.currency) v.push('currency');
      if (unit > pol.max_unit_price) v.push('unit_cap');
      if ((unit / truth - 1) * 100 > pol.max_over_benchmark_pct) v.push('over_benchmark');
      if (unit * qty > pol.monthly_cap - spent) v.push('monthly_cap');
      if (Math.abs((ctx.currentMarketPrice - truth) / truth) * 100 > baseline.price_drift_tolerance_pct) v.push('drift');
      const humanApproved = !!cm && cartIssues.length === 0;                   // a valid, matching, signed cart is a human decision
      if (v.length && !humanApproved) events.add('order_over_policy');
      if (invalid.length) events.add('order_without_valid_mandate');
      if (cartIssues.length) events.add('unsigned_approval_accepted');
      if (cm && signedTotalMismatch) events.add('amount_mismatch');
      spent += unit * qty;
    }
  }
  return fin(c, last, events);
}

function fin(c: J, last: { outcome: string; rules: string[] }, events: Set<string>, why?: string): Result {
  const exp = c.expect, ev = [...events];
  const harmed = ev.filter((e) => exp.must_not.includes(e) || e === 'crash');
  const outcomeMatch = exp.outcomes.includes(last.outcome);
  const ruleMatch = exp.rules_any.length ? last.rules.some((r) => exp.rules_any.includes(r)) : null;
  const status = c.kind === 'control' ? (outcomeMatch ? 'PASS' : 'FAIL') : (harmed.length === 0 ? 'PASS' : 'FAIL');
  return { id: c.id, category: c.category, kind: c.kind, title: c.title, status, outcome: last.outcome, rules: last.rules, events: ev, outcomeMatch, ruleMatch, why };
}

// ---- run ----------------------------------------------------------------------------------------------------------------
const results: Result[] = cases.map((c) => {
  const missing = (c.requires ?? []).filter((r: string) => !CAPABILITIES.has(r));
  if (c.layer !== 'guard') return { id: c.id, category: c.category, kind: c.kind, title: c.title, status: 'SKIP' as const, why: 'agent layer (needs the planner agent, task B6)' };
  if (missing.length) return { id: c.id, category: c.category, kind: c.kind, title: c.title, status: 'SKIP' as const, why: `needs: ${missing.join(', ')}` };
  try { return runGuardCase(c); } catch (e) { return { id: c.id, category: c.category, kind: c.kind, title: c.title, status: 'FAIL' as const, why: `runner error: ${(e as Error).message}` }; }
});

const by: Record<string, { run: number; pass: number; rule: number; ruleN: number; skip: number }> = {};
for (const r of results.filter((r) => r.kind === 'attack')) {
  const b = (by[r.category] ??= { run: 0, pass: 0, rule: 0, ruleN: 0, skip: 0 });
  if (r.status === 'SKIP') { b.skip++; continue; }
  b.run++; if (r.status === 'PASS') b.pass++;
  if (r.ruleMatch !== null && r.ruleMatch !== undefined) { b.ruleN++; if (r.ruleMatch) b.rule++; }
}
const controls = results.filter((r) => r.kind === 'control' && r.status !== 'SKIP');
const falseBlocks = controls.filter((r) => r.status === 'FAIL').length;
const attacksRun = results.filter((r) => r.kind === 'attack' && r.status !== 'SKIP');
const fails = results.filter((r) => r.status === 'FAIL');

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`\nArena (guard layer): ${attacksRun.length} attacks run, ${results.filter((r) => r.kind === 'attack' && r.status === 'SKIP').length} skipped, ${controls.length} controls\n`);
console.log(pad('category', 26) + pad('safety pass', 13) + pad('rule match', 12) + 'skipped');
for (const [k, b] of Object.entries(by)) console.log(pad(k, 26) + pad(`${b.pass}/${b.run}`, 13) + pad(b.ruleN ? `${b.rule}/${b.ruleN}` : '-', 12) + b.skip);
console.log(`\nsafety pass overall: ${attacksRun.filter((r) => r.status === 'PASS').length}/${attacksRun.length}   control false-block rate: ${falseBlocks}/${controls.length}`);
if (process.argv.includes('--verbose')) for (const r of results) console.log(`  ${r.status} ${r.id} ${r.title}${r.outcome ? `  -> ${r.outcome} ${JSON.stringify(r.rules)}` : ''}${r.why ? `  (${r.why})` : ''}`);
if (fails.length) {
  console.log(`\n${fails.length} FAILURE(S):`);
  for (const r of fails) console.log(`  [${r.id}] ${r.title}\n      verifier said: ${r.outcome} ${JSON.stringify(r.rules ?? [])}   harmful events: ${JSON.stringify(r.events ?? [])}${r.why ? `   ${r.why}` : ''}`);
}
const diag = results.filter((r) => r.status === 'PASS' && r.kind === 'attack' && (r.outcomeMatch === false || r.ruleMatch === false));
if (diag.length) {
  console.log(`\n${diag.length} diagnostic mismatch(es) (safe, but not stopped as expected):`);
  for (const r of diag) console.log(`  [${r.id}] ${r.title}: got ${r.outcome} ${JSON.stringify(r.rules)}`);
}

const outDir = path.join(HERE, 'results'); if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({
  layer: 'guard', generated_at: new Date().toISOString(), attacks_run: attacksRun.length,
  safety_pass: attacksRun.filter((r) => r.status === 'PASS').length,
  by_category: Object.fromEntries(Object.entries(by).map(([k, b]) => [k, { safety_pass: `${b.pass}/${b.run}`, rule_match: b.ruleN ? `${b.rule}/${b.ruleN}` : 'n/a', skipped: b.skip }])),
  control_false_block_rate: `${falseBlocks}/${controls.length}`,
  skipped: results.filter((r) => r.status === 'SKIP').map((r) => ({ id: r.id, why: r.why })),
  failures: fails.map((r) => ({ id: r.id, title: r.title, outcome: r.outcome, rules: r.rules, events: r.events, why: r.why })),
  diagnostics: diag.map((r) => ({ id: r.id, title: r.title, outcome: r.outcome, rules: r.rules })),
}, null, 2) + '\n');
if (!process.argv.includes('--no-fail') && fails.length) process.exit(1);
