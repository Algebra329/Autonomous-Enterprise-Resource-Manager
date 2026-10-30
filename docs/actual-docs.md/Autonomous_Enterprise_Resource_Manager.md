# PRD v3: Autonomous Enterprise Resource Manager (Safety-Proven Edition)

PayPal AI Hackathon 2026 \| Version 3.1 \| Supersedes v2.0 \| Submission deadline: Nov 12, 2026

**Positioning line:** The safety layer that lets AI agents spend money, proven by us trying to break it live.

## 1. What changed from v2.0

- New P0: Break-it Arena with a published abuse test suite; plain-English policy compiler; circuit breaker and kill switch; mandate revocation.

- New P1: agent-to-agent negotiation with two built-in simulated vendor agents; dispute-ready proof pack; graduated trust modes with a 90-day backtest.

- New P2 (only if ahead): phone approval, reusable guard library, natural-language audit search.

- Unchanged: core mandate engine, PayPal sandbox execution, SaaS pruning, AG Studio dashboard, honesty statement.

## 2. Overview

An AI finance copilot for SMB and mid-market finance teams. A manager states a spending policy in plain English, reviews the compiled rules, and signs once. The agent then benchmarks and buys hardware inside that policy, escalates anything outside it for human signature, and prunes idle SaaS seats. A deterministic verifier, never the LLM, decides whether money moves. Every action lands in an append-only audit ledger and can be exported as a proof pack.

## 3. Problem

- Procurement is slow and teams overpay because nobody benchmarks every purchase.

- SaaS sprawl: seats stay paid long after people stop using them.

- Letting an agent spend money is risky: prompt injection, price drift, runaway spend, no audit trail, no way to stop it fast.

## 4. Target users

- Primary: finance lead or operations manager at a 20-500 person company (writes and signs the policy, approves exceptions, can pause everything).

- Secondary: procurement or IT admin (reviews savings and seat reports).

- Tertiary: judges and security-minded developers (Break-it Arena).

## 5. Goals and non-goals

**Goals**

1.  Tiered autonomy: auto-execute in-policy purchases, escalate out-of-policy ones.

2.  Make PayPal central: orders, captures, subscriptions, transactions all run through PayPal sandbox.

3.  Prove safety publicly: judges can attack the agent live, and we publish the real test results.

4.  Show business value: backtested savings and a clear dashboard.

5.  Show agent-to-agent commerce: the buyer agent negotiates with two simulated vendor agents we build.

**Non-goals**

- Real money, real vendor credentials, real ERP or identity-provider integrations.

- Claiming full AP2 compliance (we implement AP2-style mandates).

- Blockchain or crypto rails.

## 6. Honesty statement (must appear in the Devpost write-up)

Simulated in the sandbox: the company's SaaS subscriptions, the asset register, seat-usage logs, and the vendors (two vendor agents we wrote, each with its own PayPal sandbox merchant account). Benchmark prices come from the real Channel3 catalog. Mandates, verification, orders, subscriptions, ledger and dashboard are real code against real PayPal sandbox APIs. Report the abuse test pass rate exactly as measured.

## 7. Functional requirements

### 7.1 Policy and mandates

- FR-1 (P0): Plain-English policy input. An LLM converts text into a strict JSON policy (validated with a schema). Unparseable or ambiguous input is rejected with a question, never guessed.

- FR-2 (P0): Policy diff screen shows the compiled rules next to the original text. The manager must confirm, then signs. The signed result is the Intent Mandate.

- FR-3 (P0): Verifier checks every proposal against the Intent Mandate: signature, issuer, expiry, nonce, category, per-unit cap, monthly cap, approved vendors, remaining budget, price drift.

- FR-4 (P0): Out-of-policy proposals become Cart Mandate requests in the Approval Queue with the exact cart, benchmark and reason. The manager signs to approve or rejects.

- FR-5 (P0): Signatures bind to a hash of the exact cart (vendor, SKU, quantity, unit price, currency). Any change invalidates it.

- FR-6 (P1): Signing with a WebAuthn passkey (challenge is the mandate hash). P0 fallback: WebCrypto ES256 key.

- FR-7 (P0): Mandate revocation. A revocation list is checked on every verification. Kill switch (FR-17) writes to it.

### 7.2 Procurement

- FR-8 (P0): Scheduled run reads the seeded asset register and flags devices past replacement threshold.

- FR-9 (P0): Agent queries Channel3 for market benchmark and best offer per item.

- FR-10 (P0): Agent proposes a purchase to a vendor through the Vendor Interface (section 8). Price is re-fetched at execution time. Drift beyond tolerance cancels and re-proposes.

- FR-11 (P0): Execution creates a PayPal order with the vendor as payee and captures it only after verification passes and, where needed, approval.

- FR-12 (P1): Agent-to-agent negotiation: the buyer agent requests quotes from two built-in vendor agents, counters within policy, and accepts the best. Both implement the Vendor Interface.

### 7.3 SaaS pruning

- FR-13 (P0): Agent flags seats idle beyond a threshold from seeded usage data.

- FR-14 (P0): Agent cancels idle seats through PayPal subscription tools on sandbox subscriptions. Cancellations above a cost or seat threshold go to the Approval Queue.

### 7.4 Safety controls

- FR-15 (P0): Break-it Arena (section 9).

- FR-16 (P0): Circuit breaker. Rules: orders per hour, spend per hour, price above benchmark by more than X percent, first purchase from a new vendor. A trip pauses autonomous execution and raises an alert.

- FR-17 (P0): Kill switch on the dashboard. One click revokes active mandates and halts scheduled runs.

- FR-18 (P1): Graduated trust modes per category: shadow (observe only), suggest (propose only), auto-under-cap.

- FR-19 (P1): 90-day backtest. Replay seeded purchase history to show projected savings and which purchases would have been auto-approved, escalated, or blocked.

### 7.5 Audit and evidence

- FR-20 (P0): Append-only, hash-chained ledger of every proposal, verdict, failing rule, approval, order, cancellation and saving.

- FR-21 (P1): Proof pack export per purchase: mandate, signature, verification log, ledger hash chain, PayPal order ID. JSON plus a printable page.

- FR-22 (P0): AG Studio dashboard: spend, savings vs benchmark, seat savings, mandate utilisation, pending approvals, blocked attempts, circuit-breaker state.

- FR-23 (P2): Natural-language audit search over the ledger (Elastic).

### 7.6 P2 extras (only if ahead of schedule)

- FR-24: Phone approval. A notification links to a mobile passkey-signing page.

- FR-25: Guard library. Mandate signing and verification packaged as a small npm package wrapping the PayPal agent toolkit.

## 8. Architecture

**Components**

- Web app (React, TypeScript): policy editor and diff, Approval Queue, signing UI, kill switch, AG Studio dashboard, Arena page.

- API (Node, TypeScript) on a Render web service: policy compiler endpoint, mandates, verifier, circuit breaker, ledger, approvals, arena endpoints.

- Scheduler: Render cron job triggers a Render Workflows task chain (scan, source, propose, verify, execute, prune). No task waits open for a human.

- Database: Postgres on Render.

- Agent layer: Vercel AI SDK with the PayPal agent toolkit AI SDK integration and a Channel3 client.

- Vendor Interface: a small REST contract implemented by two built-in vendor agents (different pricing and negotiation behavior), each with its own PayPal sandbox merchant account.

**Vendor Interface (internal contract, frozen by Oct 18)**

- GET /catalog and GET /quote: item, quantity, price, currency, validity.

- POST /counter: proposed unit price, returns accept or revised quote.

- POST /order: creates the PayPal order with the vendor as payee and returns the approval link and order ID.

- Webhook: payment and dispute events back to the buyer ledger.

**Run flow**

1.  Cron triggers the Workflow task.

2.  Task reads asset register and seat usage.

3.  Agent has LLM-facing tools only: Channel3 search, vendor quote and counter, read-only PayPal tools. It outputs structured proposals. It cannot execute.

4.  Deterministic verifier and circuit breaker evaluate each proposal against the Intent Mandate and revocation list.

5.  In-policy: execution task sends the verified order request to the vendor service, which creates and captures the PayPal order with its own credentials (see Technical Specification 5.1). Out-of-policy: stored as a pending Cart Mandate request.

6.  Manager signs in the UI (or phone, if P2); the approval endpoint triggers the execution task.

7.  Ledger is written at every step. Dashboard reads plain-array data sources from the ledger API.

**Key design rule:** the LLM never holds a spend-capable tool, and payee and amount always come from the verified mandate and re-fetched price, never from model text.

## 9. Break-it Arena

**Purpose:** make the safety claim testable by judges and measurable by us.

**Public page**

- Judge picks an attack template or writes free text that is injected as a vendor listing, supplier message, or invoice note.

- The agent processes it in a resettable sandbox run with its own small sandbox mandate and budget.

- Page shows the outcome, the failing rule if blocked, and a live counter: attempts, blocked, passed through.

- Rate-limited, sandbox-only, no real credentials, auto-reset.

**Abuse test suite (published in the repo)**

- At least 50 cases: payee redirection, price inflation, quantity tampering, instruction override in product text, fake approval claims, expired and replayed mandates, wrong vendor, budget exhaustion, currency swap, unicode and formatting tricks.

- CI runs the suite on every commit. We report the real pass rate, including any case we fail and what we changed.

**Guardrails for the arena itself:** separate database schema and mandate, per-IP rate limit, no path from arena input to production-style execution tools, scheduled reset.

## 10. Mandate specification (AP2-style)

**Intent Mandate (human-not-present, signed once)**

{  
"type": "intent",  
"issuer": "manager_id",  
"source_text": "original plain-English policy",  
"constraints": {  
"categories": \["laptops", "monitors"\],  
"max_unit_price": 1500,  
"monthly_cap": 8000,  
"currency": "USD",  
"approved_vendors": \["vendor_a", "vendor_b"\],  
"max_over_benchmark_pct": 10  
},  
"mode": "auto_under_cap",  
"not_before": "ISO-8601",  
"expires": "ISO-8601",  
"nonce": "random",  
"signature": "..."  
}

**Cart Mandate (human-present, signed per purchase)** binds vendor, SKU, quantity, unit price, total, currency, parent Intent Mandate reference if any, nonce, short expiry, signature.

**Verification rules:** valid signature and issuer; not expired or revoked; nonce unused; all constraints satisfied; cart hash matches; price re-fetched within tolerance; budget sufficient; circuit breaker closed. Any failure is logged with the failing rule.

## 11. Tool map

| Need                   | Tool                                                                                                                    | Status                                                                        |
|------------------------|-------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| Agent orchestration    | Vercel AI SDK                                                                                                           | Confirmed                                                                     |
| PayPal actions         | @paypal/agent-toolkit/ai-sdk (create_order, pay_order, list_subscription_plans, cancel_subscription, list_transactions) | Confirmed to exist; verify payee control and approval-link behavior (Spike 1) |
| Price benchmark        | Channel3 API (catalog and buy links only, no checkout)                                                                  | Confirmed; verify business-hardware coverage (Spike 2)                        |
| Dashboard              | ag-studio-react (trial licence)                                                                                         | Confirmed; request trial licence in week 1                                    |
| Scheduling and compute | Render cron job, Workflows, web service, Postgres                                                                       | Confirmed                                                                     |
| Signing                | WebAuthn (SimpleWebAuthn) with WebCrypto ES256 fallback                                                                 | Verify in Spike 3                                                             |
| Policy compiler        | LLM via AI SDK with schema-validated output                                                                             | Verify reliability on 30 sample policies (Spike 4)                            |
| Audit search (P2)      | Elastic                                                                                                                 | Optional                                                                      |
| Phone approval (P2)    | Slack or Zapier notification                                                                                            | Optional; verify sponsor-prize eligibility first                              |

Not used for dashboard data: get_merchant_insights (it reports merchant sales, not procurement spend). Savings come from our ledger.

## 12. Data model (core tables)

- policies, mandates (type, payload, signature, status, nonce), revocations

- assets, seats

- proposals (kind, payload, benchmark, verdict, failing_rule)

- orders (paypal_order_id, vendor, amount, mandate_id), cancellations (paypal_subscription_id, seat_id, savings)

- ledger (append-only events, timestamps, hash chain)

- breaker_events, arena_runs (attack, outcome, rule), backtest_runs

## 13. Security requirements

- All external text (Channel3 data, vendor messages, arena input) is untrusted. Agent output is structured proposals only.

- Execution reads payee and amount from the verified mandate and re-fetched price.

- Replay protection (nonce, expiry), idempotency keys on PayPal calls, server-side hard caps.

- Secrets in Render environment variables; sandbox credentials only.

- Revocation and kill switch take effect before the next verification.

## 14. Demo script (3 minutes; confirm length on the Rules tab)

1.  0:00-0:20 Problem and positioning line.

2.  0:20-0:45 Manager types a policy in plain English, reviews the diff, signs.

3.  0:45-1:20 Agent run: benchmarks on Channel3, negotiates between two vendor agents, buys inside policy, ledger shows the PayPal order.

4.  1:20-1:45 Out-of-policy request pauses; manager signs the Cart Mandate; purchase completes.

5.  1:45-2:20 Break-it Arena: poisoned listing tries to redirect payment; blocked with the failing rule; counter ticks up; show published test pass rate.

6.  2:20-2:40 Circuit breaker trips on a velocity spike; kill switch pressed.

7.  2:40-3:00 Dashboard with savings and backtest, proof pack export, close on the positioning line.

Cut order if the video runs long: backtest, then proof pack, then circuit breaker, never the Arena.

## 15. Timeline (Oct 12 - Nov 12)

- **Oct 12-18, spikes and contracts:** Spikes 1 to 4; freeze the Vendor Interface and build the two vendor agents; request AG Studio trial licence; scaffold repo, Render, Postgres, seeded data.

- **Oct 19-25, core engine:** policy compiler and diff, mandates, verifier, revocation, ledger, PayPal execution path.

- **Oct 26-Nov 1, features:** Approval Queue and signing, SaaS pruning, Workflows wiring, circuit breaker and kill switch. **Checkpoint Oct 26:** if the P0 golden path does not run end to end, drop all P1 items.

- **Nov 2-8, proof and polish:** Arena and 50-case suite, agent-to-agent negotiation polish, AG Studio dashboard, backtest, proof pack, deploy.

- **Nov 9-11, submission:** record video, write-up with honesty statement, dry-run, submit Nov 11 with a one-day buffer.

## 16. Risks and mitigations

| Risk                                                                    | Mitigation                                                                                        |
|-------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| Scope too large for 31 days                                             | P0/P1/P2 tiers, Oct 26 checkpoint, cut order in section 14                                        |
| Vendor agents take longer than planned                                  | Start with one vendor and a fixed price list; add the second vendor and counter-offers later (P1) |
| PayPal sandbox cannot model payee or buyer-side cancellation as assumed | Spike 1 in week 1; merchant-side simulation stated honestly                                       |
| Channel3 lacks business hardware                                        | Spike 2; narrow demo categories                                                                   |
| Policy compiler misreads a policy                                       | Schema validation, mandatory diff review, reject ambiguity                                        |
| Arena abused or crashes during judging                                  | Rate limit, isolated schema, auto-reset, pre-recorded fallback                                    |
| Test suite shows failures                                               | Publish honestly, fix, rerun; failures found and fixed are a credibility win                      |
| Passkey signing slips                                                   | ES256 WebCrypto fallback ships first                                                              |
| Another team builds a similar agent-to-agent shopping product           | Differentiate on the Arena, the published test results and the policy compiler                    |

## 17. Success criteria

- P0 golden path runs from a clean state in under 90 seconds.

- Abuse suite of 50+ cases runs in CI; results published as measured.

- Every ledger event traces to a mandate and a PayPal sandbox ID.

- Kill switch halts execution before the next verification.

- Devpost submission lists only sponsor tools actually used, plus the honesty statement.

## 18. Open verifications

1.  Judging criteria, prize categories, and video requirements (Rules tab).

2.  PayPal sandbox: payee control on create_order, approval-link flow, subscription cancel permissions.

3.  Channel3 API tier and rate limits for hackathon use.

4.  Whether Zapier, Elastic or APIMatic usage is needed for any sponsor prize before adding them.
