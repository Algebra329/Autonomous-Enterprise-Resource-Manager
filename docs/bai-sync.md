# MLE <-> BAI sync (30 minutes)

Today is **Nov 3**. Feature freeze is **Nov 6**, rehearsals Nov 8 and Nov 10, submit Nov 11. Golden path v0 was due Nov 1.
Goal of this call: unblock the two things that stop MLE from finishing (the Arena runner and real LLM numbers) and agree five contract details.

## A. What MLE hands to BAI (already in the repo)
| Item | File | BAI task it feeds |
| --- | --- | --- |
| Policy compiler prompt (10 rules, 6 examples) | `ml/policy_eval/prompt_v1.txt` | B4 `POST /v1/policies/compile` must return exactly `{policy, warnings, questions}`; a tuned v2 follows after the first real run |
| ML service contract + fallbacks + examples | `apps/ml/CONTRACT.md`, `contract_examples.json` | B9 ML client: 2 s timeout, TS fallbacks, `is_fallback` |
| Backtest fallback snapshot | `seed/backtest-demo.json` | `POST /v1/backtests` calls ML `/backtest`; if down, serve this file's `.backtest` |
| Arena cases + runner contract | `arena/FORMAT.md`, `arena/cases/*.json` | B10 CI wiring |
| Vendor price lists and negotiation params | `seed/vendors.json` | A6 vendor-kit (backtest uses the same numbers) |
| Seed data | `seed/*.json` | B1 loader. **Never load `ground_truth.json` outside evaluation code.** Extra fields (`sku`, `assigned_to`, `weekly_sessions_13w`...) must be tolerated |

## B. What MLE needs FROM BAI (decisions, in priority order)
1. **Guard API for the Arena runner.** Give me the function signature of the verifier (inputs: proposal, mandate, state, cart mandate; output: outcome + list of failing rules + the execution request with payee and amount). I cannot write `arena/runner.ts` without it. *Needed today.*
2. **The 4 open Arena questions** (they change expected values): price-drift tolerance (cases assume 2%); breaker thresholds (assume 10 orders/hour and 5000 USD/hour); does the verifier return all failing rules or only the first; are unknown extra proposal fields stripped or rejected.
3. **Rule codes.** Confirm the 16 codes in `packages/shared` match the names used in `arena/tools/build_cases.py` (SIGNATURE_INVALID, ISSUER_UNKNOWN, REVOKED, EXPIRED, NOT_YET_VALID, NONCE_REUSED, CART_HASH_MISMATCH, PRICE_DRIFT, CATEGORY_NOT_ALLOWED, VENDOR_NOT_APPROVED, CURRENCY_MISMATCH, UNIT_PRICE_EXCEEDED, OVER_BENCHMARK, MONTHLY_CAP_EXCEEDED, BREAKER_OPEN, MODE_NOT_AUTO). Any rename is a one-line change on my side.
4. **LLM provider and model** for the policy compiler and the agent (one `LLM_MODEL` env var per the spec). My real accuracy numbers depend on it. MLE proposal: Gemini Flash-class on the free tier, because the AI SDK has a Google provider and a JSON-schema output mode; BAI may prefer another. Decide today.
5. **Where do `weekly_sessions_13w` live?** The ML seat scorer needs 13 weekly usage counts per seat. The spec's `seats` table has only `user_email` and `last_active_at`. Add a JSONB column (or a usage table) or the seat scorer will always fall back to the plain 30-day rule.

## C. Gaps and risks to raise
- **Duplicate orders**: no verifier rule catches them; the backtest replays a duplicate as a second purchase. Add a rule (same vendor, SKU, quantity within 24 h goes to approval) or rely on the advisory anomaly flag and say so in the write-up.
- **Policy defaults** decided with MLE: omitted benchmark margin defaults to 10, `$` alone means USD, omitted mode means `suggest`, all with a warning; quarterly and yearly caps convert to the stricter monthly figure; weekly or daily caps are refused with a question. The compile endpoint and the `warnings` field in the UI must show these.
- **The ML service is missing from the spec's deployment map.** It needs its own Render web service plus `ML_SERVICE_URL` and `SERVICE_TOKEN` env vars (see hosting notes).
- **Nightly agent-layer Arena run** costs LLM calls (15 cases x 3 repeats). Who owns the nightly job and the key?

## D. Dates to agree before hanging up
| Date | What |
| --- | --- |
| Nov 3 | Guard signature + 4 open answers + LLM decision (this call) |
| Nov 4 | MLE: `runner.ts` v0 against guard; first real policy-compiler dev run; Channel3 probe report |
| Nov 5 | Integration day: ML service live on Render, B9 client calling it |
| Nov 6 | Feature freeze. MLE: final policy test-split run, Arena numbers |
| Nov 7-8 | `docs/evaluation.md` final, Devpost numbers |
