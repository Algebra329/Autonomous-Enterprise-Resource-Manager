import type { CartMandate, IntentMandate, Signature } from '@rm/shared';

export interface Es256PublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

interface StoredKeyMaterial {
  issuer: string;
  publicJwk: Es256PublicJwk;
  privateJwk: JsonWebKey;
  fingerprint: string;
  createdAt: string;
}

export interface BrowserSigner {
  issuer: string;
  publicJwk: Es256PublicJwk;
  fingerprint: string;
  createdAt: string;
  signMandate: (mandate: IntentMandate | CartMandate) => Promise<{
    payloadHash: string;
    signature: Signature;
  }>;
}

const STORAGE_KEY = 'aerm_es256_signer_v1';

/**
 * RFC 8785 JSON Canonicalization Scheme (JCS), matching packages/guard/src/canonicalize.ts.
 */
export function canonicalize(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    const elements = val.map((item) => (item === undefined ? 'null' : canonicalize(item)));
    return `[${elements.join(',')}]`;
  }

  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];

  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined) {
      pairs.push(`${JSON.stringify(key)}:${canonicalize(value)}`);
    }
  }

  return `{${pairs.join(',')}}`;
}

export function isWebCryptoAvailable(): boolean {
  return typeof globalThis !== 'undefined' && Boolean(globalThis.crypto?.subtle);
}

export async function sha256Hex(input: string): Promise<string> {
  if (!isWebCryptoAvailable()) {
    throw new Error('WebCrypto API (crypto.subtle) requires HTTPS or localhost.');
  }
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Computes payload_hash = sha256(canonicalize(mandate without signature)).
 * Matches packages/guard/src/hash.ts.
 */
export async function hashMandatePayload(
  mandate: IntentMandate | CartMandate
): Promise<string> {
  const payloadWithoutSignature: Record<string, unknown> = { ...mandate };
  delete payloadWithoutSignature.signature;
  return sha256Hex(canonicalize(payloadWithoutSignature));
}

function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateStoredKeyMaterial(issuerOverride?: string): Promise<StoredKeyMaterial> {
  if (!isWebCryptoAvailable()) {
    throw new Error('WebCrypto API (crypto.subtle) is unavailable in this browser context.');
  }

  const kp = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const exportedPublic = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const exportedPrivate = await crypto.subtle.exportKey('jwk', kp.privateKey);

  if (
    exportedPublic.kty !== 'EC' ||
    exportedPublic.crv !== 'P-256' ||
    !exportedPublic.x ||
    !exportedPublic.y
  ) {
    throw new Error('Browser generated an unexpected non-P-256 JWK.');
  }

  const publicJwk: Es256PublicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: exportedPublic.x,
    y: exportedPublic.y,
  };

  const fullHash = await sha256Hex(canonicalize(publicJwk));
  const fingerprint = fullHash.slice(0, 12);
  const cleanIssuer = issuerOverride?.trim() || `manager-${fingerprint.slice(0, 6)}@aerm.local`;

  const stored: StoredKeyMaterial = {
    issuer: cleanIssuer,
    publicJwk,
    privateJwk: exportedPrivate,
    fingerprint,
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return stored;
}

function readStoredKeyMaterial(): StoredKeyMaterial | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredKeyMaterial>;
    if (
      parsed &&
      typeof parsed.issuer === 'string' &&
      parsed.publicJwk?.kty === 'EC' &&
      parsed.publicJwk?.crv === 'P-256' &&
      typeof parsed.publicJwk?.x === 'string' &&
      typeof parsed.publicJwk?.y === 'string' &&
      parsed.privateJwk
    ) {
      return {
        issuer: parsed.issuer,
        publicJwk: parsed.publicJwk,
        privateJwk: parsed.privateJwk,
        fingerprint: parsed.fingerprint || parsed.publicJwk.x.slice(0, 12),
        createdAt: parsed.createdAt || new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function materializeSigner(material: StoredKeyMaterial): Promise<BrowserSigner> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    material.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  return {
    issuer: material.issuer,
    publicJwk: material.publicJwk,
    fingerprint: material.fingerprint,
    createdAt: material.createdAt,
    signMandate: async (mandate: IntentMandate | CartMandate) => {
      const payloadHash = await hashMandatePayload(mandate);
      const rawSig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(payloadHash)
      );
      return {
        payloadHash,
        signature: {
          kind: 'es256',
          payload: toBase64Url(rawSig),
        },
      };
    },
  };
}

export async function getOrCreateBrowserSigner(): Promise<BrowserSigner> {
  const existing = readStoredKeyMaterial();
  if (existing) {
    try {
      return await materializeSigner(existing);
    } catch {
      // Regenerate if stored JWK cannot be imported
    }
  }
  const fresh = await generateStoredKeyMaterial();
  return materializeSigner(fresh);
}

export async function rotateBrowserSigner(customIssuer?: string): Promise<BrowserSigner> {
  const fresh = await generateStoredKeyMaterial(customIssuer);
  return materializeSigner(fresh);
}

