# Architecture & Guard Verifier Guidelines

These guidelines document key invariants and contract requirements across the repository to ensure consistent, secure behavior and prevent regressions during AI pair-programming and refactoring.

---

## 1. Guard Verifier Contract (`@rm/guard`)

The core verifier (`verifyMandate`) enforces 16 deterministic rule codes in strict priority order. Following security audit findings in `arena/findings/FINDINGS.md`, the verifier is strictly **fail-closed**.

### Required Verification Context
Every caller of `verifyMandate(mandate, proposal, context)` MUST provide all fields below. Omitting any field triggers an immediate, intentional security rejection:

| Context Field | Expected Type | Consequence if Missing |
| :--- | :--- | :--- |
| `verifySignature` | `(hash: string, signature: unknown, issuer: string) => boolean` | **`SIGNATURE_INVALID`** (blocks order) |
| `itemCategory` | `string` | **`CATEGORY_NOT_ALLOWED`** (needs approval) |
| `proposal.benchmark` | `Benchmark` object | **`OVER_BENCHMARK`** (needs approval) |
| `knownIssuers` | `string[]` | **`ISSUER_UNKNOWN`** (blocks order) |
| `remainingMonthlyBudget` | `number` | **`MONTHLY_CAP_EXCEEDED`** (needs approval) |

### Signature Verification Rule
- **Never default to simulation:** `verifyMandate` does NOT contain fallback mock signature checks. If `context.verifySignature` is omitted, the mandate signature is rejected.
- In automated pipelines (`apps/workflows` and `packages/agent`), pass:
  ```typescript
  verifySignature: (_h, sig) => Boolean(sig)
  ```
- In API human approval routes (`apps/api`), pass the cryptographic WebAuthn or ES256 public key verifier.

---

## 2. Rule Distinction & Verdict Logic

Rule failures fall into two distinct security categories:
1. **Critical Security / Cryptographic Violations (`BLOCKING_RULES`):**
   - `SIGNATURE_INVALID`, `ISSUER_UNKNOWN`, `REVOKED`, `EXPIRED`, `NOT_YET_VALID`, `NONCE_REUSED`, `CART_HASH_MISMATCH`, `BREAKER_OPEN`.
   - **Verdict:** Immediately `'blocked'` (HTTP 403 / halted). Cannot be overridden by humans without a new, valid mandate.
2. **Policy Threshold Exceeded:**
   - `CATEGORY_NOT_ALLOWED`, `VENDOR_NOT_APPROVED`, `CURRENCY_MISMATCH`, `UNIT_PRICE_EXCEEDED`, `OVER_BENCHMARK`, `MONTHLY_CAP_EXCEEDED`, `MODE_NOT_AUTO`, `PRICE_DRIFT`.
   - **Verdict:** `'needs_approval'` (routed to human Approval Queue in AG Studio).

---

## 3. Safe Refactoring Checklist for AI Assistants

When modifying core packages (`@rm/guard`, `@rm/shared`, `@rm/ledger`):
1. **Search All Callers:** Use repository-wide search to locate every usage of modified functions (e.g. `verifyMandate`, `ProposalPayloadSchema`) across all 14 monorepo packages.
2. **Multi-line Edit Integrity:** When replacing nested `if/else` control flow, always inspect surrounding lines to ensure no dangling closing braces (`}`) are left behind.
3. **Workspace-Wide Verification:** Always verify with:
   ```bash
   pnpm test
   pnpm arena:run
   ```

