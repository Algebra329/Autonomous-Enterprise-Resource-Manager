import { sha256, canonicalize } from '@rm/guard';
import type { LedgerEntry } from '@rm/shared';

export const GENESIS_PREV_HASH = '0'.repeat(64);

/**
 * Computes the deterministic hash for a ledger entry:
 * hash = sha256(prev_hash || canonicalize(data))
 */
export function computeLedgerHash(prevHash: string, data: Record<string, unknown>): string {
  const canonicalData = canonicalize(data);
  return sha256(prevHash + canonicalData);
}

/**
 * Creates a new cryptographically bound ledger entry.
 */
export function createLedgerEntry(params: {
  seq?: number;
  type: string;
  ref_id?: string | null;
  data: Record<string, unknown>;
  prev_hash: string;
  created_at?: string;
}): LedgerEntry {
  const hash = computeLedgerHash(params.prev_hash, params.data);
  return {
    seq: params.seq,
    type: params.type,
    ref_id: params.ref_id,
    data: params.data,
    prev_hash: params.prev_hash,
    hash,
    created_at: params.created_at || new Date().toISOString(),
  };
}

/**
 * Validates whether a single entry's hash matches its prev_hash + data.
 */
export function verifySingleEntry(entry: LedgerEntry): boolean {
  const expectedHash = computeLedgerHash(entry.prev_hash, entry.data);
  return entry.hash === expectedHash;
}

export interface ChainVerificationResult {
  valid: boolean;
  errorIndex?: number;
  reason?: string;
}

/**
 * Validates the cryptographic integrity of an entire sequence of ledger entries.
 * Ensures:
 * 1. The first entry links to genesisPrevHash (if provided).
 * 2. Every entry's hash matches sha256(prev_hash + canonicalize(data)).
 * 3. Every subsequent entry's prev_hash exactly equals the preceding entry's hash.
 */
export function verifyLedgerChain(
  entries: LedgerEntry[],
  expectedInitialPrevHash: string = GENESIS_PREV_HASH
): ChainVerificationResult {
  if (entries.length === 0) {
    return { valid: true };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;

    // Check link to previous entry or genesis
    if (i === 0) {
      if (entry.prev_hash !== expectedInitialPrevHash) {
        return {
          valid: false,
          errorIndex: 0,
          reason: `Initial entry prev_hash ${entry.prev_hash} does not match expected ${expectedInitialPrevHash}`,
        };
      }
    } else {
      const prevEntry = entries[i - 1]!;
      if (entry.prev_hash !== prevEntry.hash) {
        return {
          valid: false,
          errorIndex: i,
          reason: `Entry at index ${i} has broken chain link: prev_hash ${entry.prev_hash} != previous entry hash ${prevEntry.hash}`,
        };
      }
    }

    // Verify self-hash integrity
    if (!verifySingleEntry(entry)) {
      return {
        valid: false,
        errorIndex: i,
        reason: `Entry at index ${i} has tampered data or invalid self-hash`,
      };
    }
  }

  return { valid: true };
}

