/**
 * Reference ES256 verifier for @rm/guard's `verifySignature` hook (copy into packages/guard/src/es256.ts).
 *
 * SIGNING SPEC (the browser signer and this verifier must agree on exactly this):
 *   payloadHash = hashMandatePayload(mandate)              // sha256 hex of canonicalize(mandate without signature)
 *   signature   = ECDSA P-256 / SHA-256 over the UTF-8 bytes of that hex string
 *   encoding    = raw r||s (64 bytes, IEEE P1363, which is what WebCrypto returns), base64url
 *   mandate.signature = { kind: 'es256', payload: <that base64url string> }
 *   public key  = JWK { kty:'EC', crv:'P-256', x, y }, registered per issuer
 * Browser:  crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(payloadHash))
 */
import { createPublicKey, verify, type KeyObject } from 'node:crypto';

export type Jwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string };

export function makeEs256Verifier(registry: Record<string, Jwk>) {
  const keys = new Map<string, KeyObject>();
  for (const [issuer, jwk] of Object.entries(registry)) keys.set(issuer, createPublicKey({ key: jwk as any, format: 'jwk' }));
  return (hash: string, signature: unknown, issuer: string): boolean => {
    const key = keys.get(issuer);
    const sig = signature as { kind?: string; payload?: unknown } | null;
    if (!key || !sig || sig.kind !== 'es256' || typeof sig.payload !== 'string') return false;   // webauthn is not implemented yet: fail closed
    const raw = Buffer.from(sig.payload, 'base64url');
    if (raw.length !== 64) return false;
    try { return verify('sha256', Buffer.from(hash, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }, raw); } catch { return false; }
  };
}
