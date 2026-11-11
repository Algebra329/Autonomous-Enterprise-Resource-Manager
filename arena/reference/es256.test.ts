/** Interop + production-wiring test.   pnpm exec tsx arena/reference/es256.test.ts
 *  1) a signature made the way the BROWSER makes it (WebCrypto) verifies in the server verifier;
 *  2) forged / malformed signatures are rejected;
 *  3) shows what the current `Boolean(sig)` callers let through, using the real guard. */
import { verifyMandate, hashMandatePayload } from '@rm/guard';
import { makeEs256Verifier, type Jwk } from './es256.js';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };
const b64u = (b: ArrayBuffer | Uint8Array) => Buffer.from(b as any).toString('base64url');
const subtle = globalThis.crypto.subtle;

async function browserKey() {
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  return { priv: kp.privateKey, jwk: (await subtle.exportKey('jwk', kp.publicKey)) as unknown as Jwk };
}
const browserSign = async (priv: CryptoKey, hash: string) =>
  ({ kind: 'es256', payload: b64u(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new TextEncoder().encode(hash))) });

const NOW = Date.parse('2026-11-05T12:00:00Z');
const intent = () => ({ type: 'intent' as const, issuer: 'mgr', source_text: 't', nonce: 'n1', not_before: new Date(NOW - 864e5).toISOString(), expires: new Date(NOW + 864e6).toISOString(),
  constraints: { categories: ['laptops'], max_unit_price: 2000, monthly_cap: 20000, currency: 'USD', approved_vendors: ['vendor_b'], max_over_benchmark_pct: 10, mode: 'auto_under_cap' as const } });
const proposal: any = { id: 'p', kind: 'purchase', status: 'needs_approval', verdict: 'needs_approval', failing_rules: [],
  payload: { vendor_id: 'vendor_b', sku: 'LAP-14', quantity: 1, unit_price: 1611.15, currency: 'USD', quote_id: 'q' }, benchmark: { source: 'x', market_price: 1588, checked_at: new Date(NOW).toISOString() } };
const ctx = (verifySignature: any) => ({ currentTime: new Date(NOW).toISOString(), knownIssuers: ['mgr'], remainingMonthlyBudget: 20000, currentMarketPrice: 1588, itemCategory: 'laptops', verifySignature });

async function main() {
  const { priv, jwk } = await browserKey(), other = await browserKey();
  const verifyReal = makeEs256Verifier({ mgr: jwk });
  const m: any = intent();
  const hash = hashMandatePayload(m);

  console.log('1) browser-made signature vs server verifier');
  m.signature = await browserSign(priv, hash);
  check('WebCrypto signature verifies', verifyReal(hash, m.signature, 'mgr'));
  check('guard approves a legitimately signed mandate', verifyMandate(m, proposal, ctx(verifyReal) as any).result === 'auto_approved');

  console.log('2) forged and malformed signatures are rejected by the real verifier');
  const forged = [['garbage payload', { kind: 'es256', payload: 'garbage' }], ['64 random bytes', { kind: 'es256', payload: b64u(crypto.getRandomValues(new Uint8Array(64))) }],
    ['another key signed it', await browserSign(other.priv, hash)], ['signed a different hash', await browserSign(priv, hash.replace(/./, 'f'))],
    ['kind webauthn (unimplemented)', { kind: 'webauthn', payload: m.signature.payload }], ['payload is an object', { kind: 'es256', payload: { valid: true } }], ['empty object', {}]] as const;
  for (const [name, sig] of forged) check(`rejects: ${name}`, !verifyReal(hash, sig, 'mgr'));
  check('rejects: unknown issuer', !verifyReal(hash, m.signature, 'nobody'));
  for (const [name, sig] of forged) {
    const f: any = { ...intent(), signature: sig };
    check(`guard blocks a mandate with: ${name}`, verifyMandate(f, proposal, ctx(verifyReal) as any).result === 'blocked');
  }

  console.log('3) what the current production callers do: verifySignature = (_h, sig) => Boolean(sig)');
  const truthy = (_h: string, sig: unknown) => Boolean(sig);
  const attack: any = { ...intent(), signature: { kind: 'es256', payload: 'garbage' } };
  const v = verifyMandate(attack, proposal, ctx(truthy) as any);
  console.log(`     forged mandate with signature payload "garbage" -> ${v.result.toUpperCase()}${v.result === 'auto_approved' ? '   <-- ANY signature is accepted' : ''}`);
  check('truthy verifier rejects a forged signature (expected to FAIL today)', v.result === 'blocked');
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
