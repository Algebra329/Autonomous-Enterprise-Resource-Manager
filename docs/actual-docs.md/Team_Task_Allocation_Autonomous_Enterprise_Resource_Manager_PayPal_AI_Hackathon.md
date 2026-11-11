# Team Task Allocation: Autonomous Enterprise Resource Manager

PayPal AI Hackathon 2026 \| Companion to PRD v3.1 and Technical Specification v1.0 \| Roles: Software Engineer (SWE), Backend/AI Engineer (BAI), ML Engineer (MLE)

## 0. Date check and re-baseline

This plan assumes **today is Oct 24 and submission closes Nov 12**, so there are 19 days left. The PRD's "Oct 12-18 spikes" dates have passed. Mark any spike you already finished and skip its task.

| Phase              | Dates        | Goal                                                                              |
|--------------------|--------------|-----------------------------------------------------------------------------------|
| Foundation         | Oct 24-26    | repo bootstrap, sandbox accounts, contracts frozen, seed data, spikes             |
| Core P0            | Oct 27-Nov 2 | verifier, API, vendors, UI against mocks, agent run, ML service                   |
| Complete and prove | Nov 3-8      | dashboard, Arena, breaker, backtest, evaluation, polish. **Feature freeze Nov 6** |
| Ship               | Nov 9-11     | video, write-up, rehearsal, submit Nov 11 (one-day buffer)                        |

**Checkpoints:** contracts frozen Oct 26 EOD. Golden path v0 running end to end **Nov 1** (this replaces the PRD's Oct 26 checkpoint). Feature freeze Nov 6. Final rehearsal Nov 8 and Nov 10.

## 1. Principles

1.  **Contracts first.** Shared schemas, the Vendor Interface, dashboard source shapes, ML endpoints and seed file shapes are frozen by Oct 26. Everyone builds against mocks until real services land.

2.  **The verifier decides.** packages/guard is the only thing that can allow money to move. ML scores and LLM output are advisory inputs.

3.  **Every ML component has a baseline, a metric and a fallback.** If the ML service is down or slow, the API still works with deterministic rules.

4.  **Main is always deployable.** Small PRs, CODEOWNERS review within 12 hours.

## 2. Ownership map

| Area                                                                | Owner | Reviewer |
|---------------------------------------------------------------------|-------|----------|
| apps/web, AG Studio, signing and approval UI, Arena page            | SWE   | BAI      |
| apps/vendor-a, apps/vendor-b, packages/vendor-kit                   | SWE   | BAI      |
| render.yaml, CI, PayPal sandbox account setup, deployment           | SWE   | BAI      |
| packages/shared (schemas)                                           | BAI   | SWE, MLE |
| packages/guard (verifier)                                           | BAI   | MLE      |
| apps/api, apps/workflows, db/migrations                             | BAI   | SWE      |
| packages/agent, packages/paypal, packages/channel3, packages/ledger | BAI   | MLE      |
| apps/ml, ml/ (notebooks, evals, data)                               | MLE   | BAI      |
| arena/ (cases, runner, metrics)                                     | MLE   | BAI      |
| seed/ (synthetic data)                                              | MLE   | BAI      |
| docs/evaluation.md, Devpost numbers                                 | MLE   | all      |

## 3. Is the ML workload really light?

On the money path it is: the verifier is deterministic by design. That does not make ML irrelevant. MLE owns the three things that make this project credible and different:

- **The evidence:** the 50+ case abuse suite with measured pass rates, the 90-day backtest, and the policy compiler evaluation.

- **The data:** synthetic assets, SaaS usage and purchase history with seeded anomalies. The dashboard, the agent runs and the vendor price lists all need it, so it is on the critical path for Oct 27.

- **A small advisory scoring service** (fair price, idle seats, anomaly, replacement forecast) with real baselines and metrics.

Honest caution: do not add models for show. Judges reward measured results and a clean story. If time is short, cut MLE tasks C7 and the replacement forecast first. If MLE has spare capacity, absorb: vendor price list generation, guard fuzz testing with BAI, demo reset data, and QA of the golden path.

## 4. Interfaces to freeze by Oct 26 EOD

| Contract                                                                                        | Written by     | Consumed by |
|-------------------------------------------------------------------------------------------------|----------------|-------------|
| packages/shared zod schemas (Policy, IntentMandate, CartMandate, Proposal, Verdict, rule codes) | BAI            | all         |
| Vendor Interface (quote, counter, orders, cancel) as in Spec 7.2                                | SWE (with BAI) | BAI, SWE    |
| Internal API routes and response shapes (Spec 7.1)                                              | BAI            | SWE         |
| Dashboard source shapes (Spec 13)                                                               | BAI            | SWE, MLE    |
| ML service endpoints and JSON shapes                                                            | MLE            | BAI         |
| Seed files: assets.json, saas.json, seats.json, history-90d.json                                | MLE            | BAI, SWE    |

## 5. Software Engineer (SWE) tasks

| ID      | Dates        | Task                                                                                                                                                                  | Done when                                                          |
|---------|--------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| A1      | Oct 24-25    | Bootstrap repo from the root files zip; install deps; commit lockfile; CI green; create Render services from render.yaml; set env vars                                | push to main deploys api /health and web                           |
| A2      | Oct 24-26    | PayPal sandbox: Company, Vendor A, Vendor B business accounts and a Manager Payer personal account; REST apps; webhooks; vendor plans; about 6 subscriptions approved | credentials shared securely; BAI can fetch an OAuth token for each |
| A3      | Oct 25-27    | Web scaffold, typed API client from @rm/shared, mock API so the UI runs without the backend                                                                           | UI runs fully on fixtures                                          |
| A4      | Oct 27-31    | Policy editor: text, compiled preview, diff view, confirm, sign (ES256 WebCrypto first)                                                                               | signed Intent Mandate reaches the API                              |
| A5      | Oct 27-Nov 1 | Approval Queue and proposal detail: benchmark, reason, failing rules, sign or reject                                                                                  | Cart Mandate approval works against real API                       |
| A6      | Oct 27-Nov 2 | vendor-kit, vendor-a, vendor-b: quote (static price lists), counter (max 3 rounds), orders via PayPal as the vendor, cancel, health                                   | BAI's workflow can buy and cancel through both vendors in sandbox  |
| A7      | Nov 2-5      | AG Studio dashboard: licence, 7 data sources, kill switch button, breaker panel                                                                                       | dashboard renders real data; watermark gone                        |
| A8      | Nov 3-6      | Arena page: attack templates, free text, live counters, run detail with failing rule                                                                                  | judges can attack and see blocked reasons                          |
| A9 (P1) | Nov 5-7      | Audit view, proof pack download, WebAuthn passkey signing                                                                                                             | proof pack opens for any order                                     |
| A10     | Nov 6-8      | Polish: loading, empty and error states, mobile layout, demo reset button, paid plans for demo week                                                                   | clean run from reset in under 90 seconds                           |
| A11     | Nov 9-11     | Record and edit the video; collect screenshots for Devpost                                                                                                            | video uploaded                                                     |

## 6. Backend/AI Engineer (BAI) tasks

| ID       | Dates        | Task                                                                                                                                                   | Done when                                                                         |
|----------|--------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------|
| B1       | Oct 24-26    | packages/shared schemas v0, DB migrations, seed loader                                                                                                 | contracts frozen and published in docs                                            |
| B2       | Oct 24-27    | PayPal Spike 1 using A2's accounts: payee behavior, rails A/B/C, unattended capture, subscription cancel, list_transactions; decide toolkit vs REST    | docs/spike-paypal.md with a decision                                              |
| B3       | Oct 24-28    | packages/guard: canonicalize, hash, mandate types, verifier with all 16 rule codes                                                                     | every rule code has pass and fail tests                                           |
| B4       | Oct 27-30    | apps/api core: policy compile (using MLE's prompt), mandate create and verify (ES256), revoke, proposals, approve and reject, dashboard arrays, health | SWE's UI works against real API                                                   |
| B5       | Oct 28-Nov 1 | packages/ledger (hash chain, proof pack), PayPal webhook handler                                                                                       | ledger verifies its own chain; webhook events stored                              |
| B6       | Oct 28-Nov 1 | packages/channel3 and packages/agent: planner tools, proposal schema, prompts, proposal generation                                                     | agent returns valid Proposal\[\] from seeded data                                 |
| B7       | Oct 30-Nov 3 | apps/workflows: cron entry, task chain, run states, executePurchase and executeCancel through the Vendor Interface, idempotency                        | a run completes end to end in sandbox                                             |
| B8       | Nov 1        | **Golden path v0 checkpoint.** Use fixture benchmarks if Channel3 coverage is weak                                                                     | policy signed, in-policy purchase auto-executes, out-of-policy waits for approval |
| B9       | Nov 2-5      | Circuit breaker, kill switch, trust modes; ML client with timeout and deterministic fallback                                                           | breaker trips in test; API works with ML service off                              |
| B10      | Nov 4-7      | Hardening: prompt-injection defences, input limits, Arena isolation and rate limits, wire arena suite into CI with MLE                                 | arena suite runs in CI                                                            |
| B11      | Nov 7-8      | demo:reset and a golden path script; bug bash                                                                                                          | one command resets and runs the demo                                              |
| B12 (P1) | Nov 3-7      | Vendor-side mandate verification, richer negotiation                                                                                                   | vendor rejects a tampered cart                                                    |

## 7. ML Engineer (MLE) tasks

| ID      | Dates        | Task                                                                                                                                                                                                   | Done when                                                                 |
|---------|--------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------|
| C1      | Oct 24-26    | **Spike 4:** policy compiler evaluation set (50 policies, at least 15 ambiguous), scoring script, prompt and few-shot v1                                                                               | accuracy and ambiguity detection reported; prompt handed to BAI by Oct 27 |
| C2      | Oct 24-26    | **Spike 2:** Channel3 coverage probe, 30 business-hardware queries                                                                                                                                     | coverage table and recommended demo categories posted                     |
| C3      | Oct 25-27    | Synthetic data generator (deterministic seed): assets, SaaS apps, seat activity time series, 90-day purchase history with injected anomalies                                                           | seed/\*.json committed; BAI and SWE unblocked by Oct 27                   |
| C4      | Oct 27-31    | Arena: attack taxonomy, 50+ cases, runner.ts, metrics output, CI step; LLM-assisted variants reviewed by hand                                                                                          | pnpm arena:run prints pass rate per category                              |
| C5      | Oct 28-Nov 3 | apps/ml service (FastAPI): /health, /score/price (robust fair price and outlier flags across offers), /score/seat-idle, /score/anomaly, /forecast/replacement; each with a naive baseline and a metric | deployed on Render; metrics table vs baselines; advisory only             |
| C6      | Nov 2-6      | Backtest engine: replay the 90-day history with and without the policy; sensitivity to caps                                                                                                            | backtest source feeds the dashboard                                       |
| C7 (P1) | Nov 3-7      | Fuzz and property tests for guard (with BAI); advisory injection detector with precision, recall and false-positive rate on benign listings                                                            | report added to evaluation doc                                            |
| C8      | Nov 6-8      | docs/evaluation.md: abuse pass rates, ML metrics vs baselines, backtest savings, limitations                                                                                                           | charts and tables ready for Devpost                                       |
| C9      | Nov 9-11     | Devpost write-up numbers and honesty statement; final seed freeze                                                                                                                                      | write-up reviewed by the team                                             |

## 8. Shared tasks

| When             | Task                                                         | Everyone |
|------------------|--------------------------------------------------------------|----------|
| Daily            | 15-minute sync: yesterday, today, blockers, contract changes | yes      |
| Oct 26           | Contract freeze review                                       | yes      |
| Oct 30 and Nov 5 | Integration days: merge, deploy, run end to end              | yes      |
| Nov 6            | Feature freeze; only bug fixes after this                    | yes      |
| Nov 8 and Nov 10 | Full demo rehearsals against the 3-minute script             | yes      |
| Nov 9-10         | Devpost text, screenshots, repo README, demo links           | yes      |
| Nov 11           | Submit                                                       | yes      |

## 9. Who unblocks whom

| Blocker                | Unblocks                              | Needed by |
|------------------------|---------------------------------------|-----------|
| C3 seed data           | B1 seed loader, B6 agent, A3 fixtures | Oct 27    |
| A2 sandbox credentials | B2 spike, A6 vendors                  | Oct 26    |
| B1 shared schemas      | everything                            | Oct 26    |
| B2 PayPal decision     | A6 order and cancel, B7 execution     | Oct 28    |
| C1 compiler prompt     | B4 policy compile                     | Oct 27    |
| B4 API routes          | A4, A5 real integration               | Oct 30    |
| C4 arena cases         | A8 Arena page, B10 CI                 | Nov 3     |
| C5 ML service contract | B9 ML client                          | Oct 29    |

## 10. Cut list if Golden path v0 is not running by Nov 1

Cut in this order: A9 (passkeys, audit view), B12, C7, replacement forecast in C5, C6 sensitivity analysis, second vendor negotiation rounds (keep static quotes). Never cut: the verifier, the signed policy flow, the Arena with published results, the kill switch, and the honesty statement.
