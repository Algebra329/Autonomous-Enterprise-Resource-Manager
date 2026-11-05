# Backend / AI Engineer (BAI) Task Tracker
**Project:** Autonomous Enterprise Resource Manager (PayPal AI Hackathon 2026)  
**Role:** Backend / AI Engineer (BAI)  
**Status:** In Progress — Phase 1: Foundation  
**Last Updated:** 2026-11-01  

---

## Architecture & Ownership Summary

BAI owns the money-guarding verifier, backend API, schemas, ledger, autonomous agent planning, and workflows:
- **`packages/shared`**: Canonical Zod schemas and TypeScript types (Policy, Mandates, Verdicts, Rule Codes, Vendor API shapes).
- **`packages/guard`**: Pure TypeScript verifier. Hashes, canonicalizes, and verifies all 16 rule codes. Zero DB / network dependencies.
- **`apps/api`**: Fastify REST API for policy compilation, mandate management, approvals, ledger audit, and dashboard sources.
- **`packages/ledger`**: Append-only hash-chained ledger and cryptographically verifiable proof packs.
- **`packages/agent` & `packages/channel3`**: Read-only AI agent tools, prompt defense, and structured proposal generation.
- **`apps/workflows`**: End-to-end task chains (`scanAssets`, `scanSeats`, `sourceItem`, `negotiate`, `verifyAndRoute`, `executePurchase`).

---

## Master Task Board

| Task ID | Phase | Component | Description | Status | Deliverables / Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **B1** | Foundation | `packages/shared`, `db/` | Schemas v0, DB migrations, seed loader | **COMPLETED** | <ul><li>[x] Zod schemas & types for Policy, Mandates, Verdict, Rule Codes</li><li>[x] DB migration scripts for 12 Postgres tables</li><li>[x] Seed data loader for `seed/*.json`</li></ul> |
| **B2** | Foundation | `packages/paypal`, `docs/` | PayPal Spike 1 (payee behavior, unattended capture) | **COMPLETED** | <ul><li>[x] Research unattended capture (Vaulted Rail A vs Orders Rail B vs Payouts Rail C)</li><li>[x] `docs/spike-paypal.md` written with hybrid Rail A + B decision</li></ul> |
| **B3** | Core P0 | `packages/guard` | Verifier with all 16 rule codes | **COMPLETED** | <ul><li>[x] Pure TS canonicalize & SHA-256 payload/cart hasher</li><li>[x] Verifier logic enforcing the 16 rule codes in order</li><li>[x] 100% branch coverage unit tests (Vitest) for every rule code (pass + fail)</li></ul> |
| **B4** | Core P0 | `apps/api` | Fastify API core & Policy Compiler integration | **COMPLETED** | <ul><li>[x] `/v1/policies/compile`, `/v1/mandates/intent`, `/v1/proposals`</li><li>[x] ES256 & WebAuthn signature verification & CartMandate approval</li><li>[x] AG Studio dashboard source arrays (Spec 13)</li><li>[x] Safety kill switch and circuit breaker routes</li><li>[x] Comprehensive API integration test suite</li></ul> |
| **B5** | Core P0 | `packages/ledger`, `webhooks` | Hash chain, proof pack, PayPal webhook handler | **COMPLETED** | <ul><li>[x] Append-only ledger with `sha256(prev_hash \|\| canonical(data))`</li><li>[x] Tamper-evident proof pack builder & validator</li><li>[x] PayPal webhook idempotency handler (wired in API)</li></ul> |
| **B6** | Core P0 | `packages/agent`, `packages/channel3` | Planner agent tools & proposal generation | **COMPLETED** | <ul><li>[x] Channel3 search & detail client with cache and fixture fallback</li><li>[x] Read-only tools for vendor quote/counter, hardware, and SaaS</li><li>[x] Structured proposal generator validated to `Proposal[]`</li><li>[x] Prompt injection sanitization defense</li></ul> |
| **B7** | Core P0 | `apps/workflows` | Autonomous workflow pipeline | **COMPLETED** | <ul><li>[x] `scanAssets`, `scanSeats`, `sourceItem`, `negotiate`, `verifyAndRoute`</li><li>[x] Idempotent `executePurchase` & `executeCancel`</li><li>[x] End-to-end autonomous run runner and CLI trigger</li></ul> |
| **B8** | Milestone | Golden Path v0 | In-policy auto-execution & out-of-policy approval | **COMPLETED** | <ul><li>[x] End-to-end flow operating against sandbox, Channel3, and fixtures</li><li>[x] In-policy purchases auto-executed and recorded in ledger</li><li>[x] Out-of-policy and SaaS cancellations routed to Approval Queue</li></ul> |
| **B9** | Hardening | Circuit Breaker & Safety | Velocity checks, spend limits, kill switch | **COMPLETED** | <ul><li>[x] Breaker and kill switch endpoints in `apps/api`</li><li>[x] ML advisory client with 2s timeout and deterministic fallback</li></ul> |
| **B10** | Hardening | Arena Defenses & Security | Prompt injection defense & rate limits | **NOT STARTED** | <ul><li>[ ] Arena isolation & rate limiting</li><li>[ ] CI integration for 50+ abuse cases</li></ul> |
| **B11** | Polish | Demo scripts | `demo:reset` and rehearsal runbook | **COMPLETED** | <ul><li>[x] `< 90s` end-to-end reset and golden path pipeline script (`pnpm demo:reset`)</li><li>[x] Ingests fresh synthetic datasets and populates ledger & approval queue</li></ul> |
| **B12** | Stretch (P1) | Vendor Verification | Vendor-side mandate verification | **NOT STARTED** | <ul><li>[ ] Vendor validates cart hash and mandate signature against `/v1/keys/:issuer`</li></ul> |

---

## Dependency Graph & Unblocking Flow

```
[MLE: Seed Data C3] ──> [BAI: Task B1 Schemas & DB] ──> [SWE: Task A3 Web Mocks & Types]
                                   │
                                   ├──> [BAI: Task B3 packages/guard Verifier]
                                   │           │
                                   └──> [BAI: Task B4 apps/api Core] ──> [SWE: Task A4/A5 Policy & Approval UI]
```
