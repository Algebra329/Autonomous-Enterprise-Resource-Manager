/**
 * Property / fuzz tests for @rm/guard (task C7). Complements the hand-written Arena cases: instead of cases I thought of, it
 * generates thousands of random mandates, proposals and contexts (including nasty values) and checks invariants with an
 * INDEPENDENT oracle. The one property that matters: whenever the verifier says `auto_approved`, nothing may be wrong.
 *
 *   pnpm exec tsx arena/fuzz/guard.fuzz.ts [--n 5000] [--seed 1] [--no-fail]
 *
 * Output: failures grouped by what the oracle says was wrong, with a count and the smallest example (seed + iteration to replay).
 */
import { generateKeyPairSync, sign, verify, randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- ADAPTER (same idea as runner.ts): the only repo-specific imports ---------------------------------------------------
import { verifyMandate, hashMandatePayload, hashCart, canonicalize } from '@rm/guard';
// ------------------------------------------------------------------------------------------------------------------------

type J = any;
const arg = (k: string, d: number) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const N = arg('--n', 5000), SEED = arg('--seed', 1);
let s = SEED >>> 0;
const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const num = (lo: number, hi: number) => lo + rnd() * (hi - lo);

const NOW = Date.parse('2026-11-05T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const mgr = generateKeyPairSync('ec', { namedCurve: 'P-256' }), evil = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const registry: Record<string, any> = { mgr: mgr.publicKey, evil: evil.publicKey };
const signH = (h: string, k: any) => ({ kind: 'es256', payload: sign('sha256', Buffer.from(h), { key: k, dsaEncoding: 'ieee-p1363' }).toString('base64url') });
const realVerify = (h: string, sig: J, issuer: string) => {
  const pub = registry[issuer]; if (!pub || sig?.kind !== 'es256' || typeof sig.payload !== 'string') return false;
  try { return verify('sha256', Buffer.from(h), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig.payload, 'base64url')); } catch { return false; }
};

const VENDORS = ['vendor_a', 'vendor_b', 'vendor_c', '', 'vendor_\u0430', 'vendor_a\u200b'];
const CATS = ['laptops', 'monitors', 'accessories', 'phones'];
const BAD_DATES = ['never', '', 'tomorrow', '2026-13-45', '0', 'null'];
const RULES = new Set(['SIGNATURE_INVALID', 'ISSUER_UNKNOWN', 'REVOKED', 'EXPIRED', 'NOT_YET_VALID', 'NONCE_REUSED', 'CART_HASH_MISMATCH', 'PRICE_DRIFT', 'CATEGORY_NOT_ALLOWED', 'VENDOR_NOT_APPROVED', 'CURRENCY_MISMATCH', 'UNIT_PRICE_EXCEEDED', 'OVER_BENCHMARK', 'MONTHLY_CAP_EXCEEDED', 'BREAKER_OPEN', 'MODE_NOT_AUTO']);
const BLOCKING = new Set(['SIGNATURE_INVALID', 'ISSUER_UNKNOWN', 'REVOKED', 'EXPIRED', 'NOT_YET_VALID', 'NONCE_REUSED', 'CART_HASH_MISMATCH', 'BREAKER_OPEN']);

const findings = new Map<string, { count: number; example: J }>();
const note = (kind: string, iter: number, example: J) => { const f = findings.get(kind); if (f) f.count++; else findings.set(kind, { count: 1, example: { iter, ...example } }); };

// A spec is every random choice of one scenario. "near-valid" specs start fully legitimate and then break exactly ONE defence,
// which finds single-point bypasses far more reliably than fully random scenarios (those usually fail several checks at once).
function genSpec(near: boolean): J {
  if (!near) {
    return { fault: 'random', unit: chance(0.05) ? pick([1e-9, 1e9]) : num(100, 3000), qty: chance(0.05) ? pick([1e9, 1e15]) : Math.ceil(num(0, 12)),
      cat: pick(CATS), vendor: pick(VENDORS), market: chance(0.06) ? pick([0, -5]) : num(900, 2200), currency: chance(0.9) ? 'USD' : pick(['EUR', 'usd', '']),
      hasBench: chance(0.9), policy: { categories: chance(0.9) ? ['laptops', 'monitors'] : [], max_unit_price: num(500, 2500), monthly_cap: num(2000, 20000), currency: 'USD',
        approved_vendors: chance(0.9) ? ['vendor_a', 'vendor_b'] : [], max_over_benchmark_pct: num(0, 30), mode: chance(0.85) ? 'auto_under_cap' : pick(['suggest', 'shadow']) },
      isCart: chance(0.2), issuer: chance(0.9) ? 'mgr' : 'evil_issuer', notBefore: chance(0.08) ? pick(BAD_DATES) : iso(NOW + (chance(0.1) ? 3_600_000 : -86_400_000)),
      expires: chance(0.08) ? pick(BAD_DATES) : iso(NOW + (chance(0.1) ? -60_000 : 2_592_000_000)), sigMode: pick(['valid', 'valid', 'valid', 'valid', 'none', 'random', 'wrong_key']),
      tampered: chance(0.05), usedNonce: chance(0.05), revoked: chance(0.05), breaker: chance(0.04), kill: chance(0.03),
      remaining: chance(0.04) ? pick([NaN, Infinity, -1]) : num(0, 25000), withVerifier: chance(0.93), ctxMarket: chance(0.1) ? 'drift' : 'same', catSupplied: chance(0.93),
      cartMismatch: chance(0.15), cartTotalBad: chance(0.15) };
  }
  const unit = num(900, 1500);
  const sp: J = { fault: 'none', unit, qty: 1 + Math.floor(rnd() * 3), cat: 'laptops', vendor: pick(['vendor_a', 'vendor_b']), market: unit / (1 + num(0, 0.05)), currency: 'USD', hasBench: true,
    policy: { categories: ['laptops', 'monitors'], max_unit_price: 2000, monthly_cap: 20000, currency: 'USD', approved_vendors: ['vendor_a', 'vendor_b'], max_over_benchmark_pct: 10, mode: 'auto_under_cap' },
    isCart: chance(0.25), issuer: 'mgr', notBefore: iso(NOW - 86_400_000), expires: iso(NOW + 2_592_000_000), sigMode: 'valid', tampered: false, usedNonce: false, revoked: false,
    breaker: false, kill: false, remaining: 50000, withVerifier: true, ctxMarket: 'same', catSupplied: true, cartMismatch: false, cartTotalBad: false };
  const faults: Record<string, () => void> = {
    'benchmark market_price = 0': () => { sp.market = 0; }, 'benchmark market_price negative': () => { sp.market = -5; }, 'benchmark market_price Infinity': () => { sp.market = Infinity; },
    'benchmark missing': () => { sp.hasBench = false; }, 'current market price not supplied': () => { sp.ctxMarket = 'undefined'; }, 'current market price NaN': () => { sp.ctxMarket = 'nan'; },
    'current market price drifted 50%': () => { sp.ctxMarket = 'drift'; }, 'remaining budget NaN': () => { sp.remaining = NaN; }, 'remaining budget Infinity': () => { sp.remaining = Infinity; },
    'remaining budget too small': () => { sp.remaining = 10; }, 'category not supplied': () => { sp.catSupplied = false; }, 'category outside policy': () => { sp.cat = 'phones'; },
    'vendor homoglyph': () => { sp.vendor = 'vendor_\u0430'; }, 'vendor empty': () => { sp.vendor = ''; }, 'currency lowercase': () => { sp.currency = 'usd'; }, 'currency EUR': () => { sp.currency = 'EUR'; },
    'unit price over cap': () => { sp.unit = 2500; sp.market = 2500; }, 'price 30% over benchmark': () => { sp.market = sp.unit / 1.3; }, 'mode suggest': () => { sp.policy.mode = 'suggest'; },
    'expires unparseable': () => { sp.expires = pick(BAD_DATES); }, 'not_before unparseable': () => { sp.notBefore = pick(BAD_DATES); }, 'not_before empty string': () => { sp.notBefore = ''; },
    'expires empty string': () => { sp.expires = ''; }, 'expired by 1 minute': () => { sp.expires = iso(NOW - 60_000); }, 'not yet valid': () => { sp.notBefore = iso(NOW + 3_600_000); },
    'nonce reused': () => { sp.usedNonce = true; }, 'revoked': () => { sp.revoked = true; }, 'breaker open': () => { sp.breaker = true; }, 'kill switch': () => { sp.kill = true; },
    'unknown issuer': () => { sp.issuer = 'evil_issuer'; }, 'no signature': () => { sp.sigMode = 'none'; }, 'random signature': () => { sp.sigMode = 'random'; },
    'wrong-key signature': () => { sp.sigMode = 'wrong_key'; }, 'payload edited after signing': () => { sp.tampered = true; }, 'no verifySignature supplied': () => { sp.withVerifier = false; sp.sigMode = 'random'; },
    'cart does not match proposal': () => { sp.isCart = true; sp.cartMismatch = true; }, 'cart total inconsistent': () => { sp.isCart = true; sp.cartTotalBad = true; },
  };
  if (chance(0.15)) return sp;                                  // some pure controls: a legitimate purchase must be auto-approved
  sp.fault = pick(Object.keys(faults)); faults[sp.fault]();
  return sp;
}

function oneIteration(iter: number, near: boolean) {
  const sp = genSpec(near);
  const { unit, qty, cat, vendor, policy, isCart, issuer, sigMode, tampered, usedNonce, revoked, breaker, kill, remaining, withVerifier } = sp;
  const marketPrice = sp.market;
  const proposal: J = { id: 'p', kind: 'purchase', status: 'needs_approval', verdict: 'needs_approval', failing_rules: [],
    payload: { vendor_id: vendor, sku: 'S', quantity: qty, unit_price: unit, currency: sp.currency, quote_id: 'q' },
    benchmark: sp.hasBench ? { source: 'x', market_price: marketPrice, checked_at: iso(NOW) } : undefined };
  const nonce = randomBytes(6).toString('hex');
  let mandate: J; let cartMatches = true, totalOk = true;
  if (isCart) {
    const c: J = { vendor_id: vendor, sku: 'S', quantity: qty, unit_price: unit, total: qty * unit, currency: sp.currency };
    if (sp.cartMismatch) { c.quantity = qty + 1; cartMatches = false; }
    if (sp.cartTotalBad) { c.total = c.total + pick([1, -1, 1000]); totalOk = false; }
    mandate = { type: 'cart', issuer, parent: 'intent-1', cart: c, nonce, not_before: sp.notBefore, expires: sp.expires };
  } else mandate = { type: 'intent', issuer, source_text: 'fuzz', constraints: policy, not_before: sp.notBefore, expires: sp.expires, nonce };
  const h = hashMandatePayload(mandate);
  if (sigMode === 'valid') mandate.signature = signH(h, issuer === 'mgr' ? mgr.privateKey : evil.privateKey);
  else if (sigMode === 'wrong_key') mandate.signature = signH(h, evil.privateKey);
  else if (sigMode === 'random') mandate.signature = { kind: 'es256', payload: randomBytes(64).toString('base64url') };
  if (tampered && sigMode === 'valid') mandate.expires = iso(NOW + 9e9);                  // edited after signing
  const cm = sp.ctxMarket === 'drift' ? marketPrice * 1.5 : sp.ctxMarket === 'nan' ? NaN : sp.ctxMarket === 'undefined' ? undefined : marketPrice;
  const ctx: J = { currentTime: iso(NOW), knownIssuers: ['mgr'], revokedMandateIds: revoked ? [nonce] : [], usedNonces: usedNonce ? [nonce] : [],
    remainingMonthlyBudget: remaining, circuitBreakerOpen: breaker, killSwitchActive: kill, currentMarketPrice: cm, itemCategory: sp.catSupplied ? cat : undefined,
    ...(withVerifier ? { verifySignature: realVerify } : {}) };

  let v: J;
  try { v = verifyMandate(mandate, proposal, ctx); } catch (e) { note('CRASH: verifyMandate threw', iter, { error: String(e), fault: sp.fault }); return; }
  if (!['auto_approved', 'needs_approval', 'blocked'].includes(v.result)) note('result is not one of the three verdicts', iter, { v });
  if (!Array.isArray(v.failing_rules) || v.failing_rules.some((r: string) => !RULES.has(r))) note('failing_rules contains an unknown code', iter, { v });
  const hasBlock = v.failing_rules.some((r: string) => BLOCKING.has(r));
  if ((v.result === 'blocked') !== hasBlock) note('blocked verdict inconsistent with blocking rules', iter, { v });
  if ((v.result === 'auto_approved') !== (v.failing_rules.length === 0)) note('auto_approved inconsistent with empty failing_rules', iter, { v });
  if (near && sp.fault === 'none' && v.result !== 'auto_approved') note('CONTROL: a fully legitimate purchase was not auto-approved', iter, { v, isCart });
  if (v.result !== 'auto_approved') return;

  // ---- the property that matters: "auto_approved" must mean nothing is wrong (independent oracle) ----
  const wrong: string[] = [];
  const nb = Date.parse(mandate.not_before), ex = Date.parse(mandate.expires);
  if (Number.isNaN(ex)) wrong.push('expiry is not a valid date (never expires)'); else if (ex < NOW) wrong.push('mandate expired');
  if (mandate.not_before !== undefined && (Number.isNaN(nb) || nb > NOW)) wrong.push('not_before invalid or in the future');
  if (usedNonce) wrong.push('nonce already used (replay)');
  if (revoked) wrong.push('mandate revoked');
  if (breaker || kill) wrong.push('circuit breaker / kill switch active');
  if (issuer !== 'mgr') wrong.push('issuer unknown');
  if (!withVerifier && sigMode !== 'valid') wrong.push('signature not really verified (no verifySignature supplied)');
  if (withVerifier && (sigMode !== 'valid' || tampered)) wrong.push('signature invalid or payload edited after signing');
  if (isCart) {
    if (!cartMatches) wrong.push('cart does not match the proposal');
    if (!totalOk) wrong.push('cart total inconsistent with quantity x unit price');
  } else {
    if (!sp.catSupplied) wrong.push('item category not supplied (category rule skipped)');
    else if (!policy.categories.includes(cat)) wrong.push('category not allowed');
    if (!policy.approved_vendors.includes(vendor)) wrong.push('vendor not approved');
    if (proposal.payload.currency !== 'USD') wrong.push('currency mismatch');
    if (unit > policy.max_unit_price) wrong.push('unit price over cap');
    if (!proposal.benchmark) wrong.push('no benchmark (benchmark rules skipped)');
    else if (!(proposal.benchmark.market_price > 0) || !Number.isFinite(proposal.benchmark.market_price)) wrong.push('benchmark market_price <= 0 or Infinity (benchmark rules skipped)');
    else if ((unit / proposal.benchmark.market_price - 1) * 100 > policy.max_over_benchmark_pct) wrong.push('over benchmark');
    if (!Number.isFinite(remaining)) wrong.push('remaining budget is NaN or Infinity (cap rule skipped)');
    else if (qty * unit > remaining) wrong.push('monthly cap exceeded');
    if (policy.mode !== 'auto_under_cap') wrong.push('mode is not auto');
    if (proposal.benchmark && proposal.benchmark.market_price > 0) {
      if (cm === undefined || Number.isNaN(cm)) wrong.push('current market price missing or NaN (drift rule skipped)');
      else if (Math.abs((cm - proposal.benchmark.market_price) / proposal.benchmark.market_price) * 100 > 2) wrong.push('market price drifted');
    }
  }
  for (const w of wrong) note(`AUTO-APPROVED but: ${w}`, iter, { fault: sp.fault, mandate: { type: mandate.type, expires: mandate.expires, not_before: mandate.not_before }, unit, qty, remaining, marketPrice });
}

// ---- hash / canonicalization properties (these never depend on the verifier's judgment) ----------------------------------
function hashProps() {
  for (let i = 0; i < 300; i++) {
    const cart = { vendor_id: pick(VENDORS), sku: 'S' + i, quantity: 1 + (i % 9), unit_price: num(1, 5000), total: num(1, 9000), currency: 'USD' };
    const shuffled = Object.fromEntries(Object.entries(cart).sort(() => rnd() - 0.5));
    if (canonicalize(cart) !== canonicalize(shuffled)) note('canonicalize depends on key order', i, { cart });
    if (hashCart(cart as J) !== hashCart(shuffled as J)) note('hashCart depends on key order', i, { cart });
    for (const f of ['vendor_id', 'sku', 'quantity', 'unit_price', 'total', 'currency']) {
      const t: J = { ...cart }; t[f] = typeof t[f] === 'number' ? t[f] + 1 : t[f] + 'x';
      if (hashCart(t) === hashCart(cart as J)) note(`hashCart ignores a change to ${f}`, i, { cart });
    }
    const m: J = { type: 'intent', issuer: 'mgr', source_text: 't', constraints: {}, expires: 'x', nonce: String(i) };
    if (hashMandatePayload({ ...m, signature: { kind: 'es256', payload: 'A' } }) !== hashMandatePayload({ ...m, signature: { kind: 'es256', payload: 'B' } })) note('mandate hash depends on the signature', i, {});
    if (canonicalize({ n: -0 }) !== canonicalize({ n: 0 })) note('canonicalize distinguishes -0 from 0', i, {});
  }
}

for (let i = 0; i < N; i++) oneIteration(i, chance(0.65));   // 65% near-valid single-fault, 35% fully random
hashProps();

const rows = [...findings.entries()].sort((a, b) => b[1].count - a[1].count);
console.log(`\nGuard fuzz: ${N} random verifications + 300 hash/canonicalization checks (seed ${SEED})`);
if (!rows.length) console.log('No invariant violations found.');
else {
  console.log(`${rows.length} kind(s) of violation:\n`);
  for (const [k, f] of rows) console.log(`  x${String(f.count).padEnd(5)} ${k}\n         first at iteration ${f.example.iter}: ${JSON.stringify(f.example).slice(0, 230)}`);
}
const resDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'results'); mkdirSync(resDir, { recursive: true });
writeFileSync(path.join(resDir, 'fuzz.json'), JSON.stringify({ n: N, seed: SEED, hash_checks: 300, violations: rows.map(([k, f]) => ({ kind: k, count: f.count })) }, null, 2) + '\n');
if (rows.length && !process.argv.includes('--no-fail')) process.exit(1);
