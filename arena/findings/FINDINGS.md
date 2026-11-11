# Production-wiring findings (from BAI's audit, Nov 5, plus our checks)

BAI's audit confirms the verifier fixes and that every caller supplies `verifySignature`. Reading it against our tests:

| # | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| **P1 (critical)** | Three production callers pass `(_h, sig) => Boolean(sig)` (`verifyAndRoute.ts`, `planner.ts`) or `Boolean(sig && typeof sig === 'object')` (`routes/proposals.ts`). That is not verification: any non-empty signature passes. The approve endpoint takes the manager's signature from the request body, so this is external input, not "internally generated". The Arena is green because `runner.ts` supplies real ES256; production does not | `arena/reference/es256.test.ts` section 3: the real guard returns AUTO_APPROVED for a mandate whose signature payload is the string "garbage" | Use `makeEs256Verifier` (`arena/reference/es256.ts`) in all three callers. Signing spec is in its header. Needs a registry issuer -> public JWK (store the manager's key when the first policy is signed, or `MANAGER_PUBLIC_JWK` for the demo) |
| P2 | `verifySignature?` is still optional in `VerificationContext` | audit, line 22 | remove the `?` so callers fail to compile |
| P3 | The four fuzz fixes may not be in: the audit lists the original five only | `guard-fail-open-delta.patch` | apply it, then run `arena/fuzz/guard.fuzz.ts`: it must print "No invariant violations found" |
| P4 | Deployed breaker is 3 orders/hour and 3000 USD/hour. Two ThinkPads in one hour cost 3222 USD and trip it. Replaying our 90-day history: 11 of 35 purchases blocked (5 with 10 and 5000), 40.5k USD held | `python apps/ml/run_backtest.py --breaker-orders 3 --breaker-spend 3000` | decide: raise to about 5 orders and 5000 USD, or accept that routine paired purchases trip the breaker. The demo script's breaker moment is deliberate, but the golden path must not trip it by accident |
| P5 | Compiler default model is `deepseek-flash` and its LLM timeout is 4 s, then it silently falls back to the regex parser. Our measured accuracy (18/18 clear, 0 guesses on 14 hard) is for `deepseek-chat`, prompt only | `compiler.ts` per the audit | set `LLM_MODEL=deepseek-chat` or re-run the exam on the model that is deployed; report which path answered (`llm` or `fallback`) in the API response; score the production path with `run_eval.py --provider api --url http://localhost:4000` |
| P6 | Channel3 client: 10 s timeout and 5 min cache. Our probe measured p50 8.7 s and p95 19.5 s, so roughly four in ten live calls will time out and fall back | `packages/channel3/src/client.ts` | prefetch the five anchor queries at startup with a 25 s timeout, cache for hours, and record `benchmark.source` as `channel3-live` or `fixture` |
| P7 | The audit does not say whether the planner searches with `benchmark_query` from `seed/catalog.json` | not confirmed | confirm in `planner.ts` |
| P8 | `executePurchase` "generates a PayPal order reference". Unclear whether it calls the vendor service and PayPal sandbox | audit | confirm before the honesty statement says "real PayPal sandbox orders" |
| P9 | The planner makes no LLM calls (deterministic tool logic); the LLM is used only for policy compilation | audit, Ask 7 | fine, but claims must match: say "deterministic planner, LLM policy compiler", not "LLM agent resisted prompt injection". The 15 agent-layer Arena attacks become structured-data injection tests |

# Arena findings on `packages/guard` (first run, guard layer)

Run: `pnpm exec tsx arena/runner.ts`. Result on BAI's verifier as merged: **40/45 attacks safe, 0/3 controls falsely blocked**.
With `guard-fail-open.patch` applied: **45/45 safe, 0/3 false blocks**. The patch applies cleanly (`git apply arena/findings/guard-fail-open.patch`).
Each failure is a case where the verifier said `auto_approved` and an independent check says the order violates the policy or the mandate is invalid.

## Fixed by the patch (all are "a check is silently skipped", so the verifier fails open)
| Case | What happens today | Why | Fix |
| --- | --- | --- | --- |
| exp-007 / exp-008 | A mandate whose `expires` or `not_before` is not a real date (e.g. `"never"`) never expires | `new Date("never")` is Invalid Date and every comparison with it is false | treat an unparseable date as EXPIRED / NOT_YET_VALID. Also make the Zod fields `.datetime()` |
| prc-007 | A proposal with no `benchmark` skips OVER_BENCHMARK and PRICE_DRIFT entirely | `benchmark` is optional in `ProposalSchema`, and the rules sit inside `if (proposal.benchmark)` | no benchmark means OVER_BENCHMARK (needs a human). This is reachable by a prompt-injected agent that omits it |
| qty-007 | A signed cart with `total: 100` for 5 x 1479 passes | the cart is compared with the proposal on vendor, sku, quantity and unit price, never `total` | check `total == quantity * unit_price` |
| ven-006 | If the caller does not pass `itemCategory`, CATEGORY_NOT_ALLOWED never fires | `ProposalPayload` has no `category`; the rule is `if (category && ...)` | missing category means CATEGORY_NOT_ALLOWED, and the API must derive the category from the SKU server-side |

The patch may break existing guard tests that omit `benchmark` or `itemCategory`; those tests should pass them.

## Added by the fuzzer (`arena/fuzz/guard.fuzz.ts`, 20,000 random verifications): four more, now in the patch
| Weakness | Fix in `guard-fail-open.patch` |
| --- | --- |
| `benchmark.market_price` of 0, negative or Infinity skips OVER_BENCHMARK (`if (benchmarkPrice > 0)`); the Zod field is an unconstrained `z.number()` | unusable benchmark means OVER_BENCHMARK. Also add `.positive()` to the schema |
| `remainingMonthlyBudget` NaN or Infinity skips the cap rule (`total > NaN` is false) | `!Number.isFinite(budget) \|\| !(total <= budget)` |
| `currentMarketPrice` missing or NaN skips PRICE_DRIFT | missing price means PRICE_DRIFT (the workflow must re-fetch it, FR-10) |
| `not_before: ""` skips the check (empty string is falsy). My first patch missed this one | compare with `!== undefined` |

Result: original verifier, 9 kinds of violation; with `guard-fail-open.patch` + `guard-require-verifier.patch`, **none in 20,000 runs**, Arena 45/45, 0 false blocks. The fuzzer also checked 300 hash and canonicalization properties (key order, per-field sensitivity, signature excluded, -0): all clean. Replay any finding with `--seed` and the iteration shown.

## Two patches, apply in this order
1. `git apply arena/findings/guard-fail-open.patch` fixes every skipped check above.
2. `git apply arena/findings/guard-require-verifier.patch` removes the default signature simulation (item 1 below). It is separate because existing guard tests may rely on the simulation (`payload: 'invalid'`); update them to pass a `verifySignature`.
If BAI already applied the earlier, shorter version of the first patch, apply `guard-fail-open-delta.patch` instead (it adds only the four fuzz fixes on top).
Also tighten the Zod schemas: `market_price: z.number().positive()`, and `.datetime()` on `expires` and `not_before`.

## Not fixed by the patch: please decide
1. **Signature check defaults to a simulation** (fixed by `guard-require-verifier.patch`; apply it). With no `verifySignature` in the context, a mandate passes unless its payload is literally `"invalid"`. If any route forgets to pass the real ES256 verifier, signatures are not checked. Make `verifySignature` a required field of `VerificationContext` (no default).
2. **Revocation keys differ.** An intent mandate is revoked by its `nonce`; a cart mandate's parent is checked by `parent` id. Confirm the revocations table and the kill switch write the identifiers the verifier actually looks up. The Arena only tests the nonce path.
3. **Vendor quote re-fetch is not compared with the proposal.** PRICE_DRIFT compares the benchmark at proposal time with the market price now. If the vendor's re-fetched price differs from `unit_price`, nothing in the guard notices; the workflow must use the re-fetched price. Case pay-003 (skipped) needs the execution layer to test this.
4. **Missing `currency` silently becomes USD** (Zod `.default('USD')`). Safe today (cur-004 is a diagnostic), but a vendor reply without a currency would be read as USD.
5. **Velocity and spend-per-hour breakers are not in the guard** (it only reads `circuitBreakerOpen`). Where is that computed? Case bud-004 is skipped until it can be driven.

## Coverage today
45 guard attacks run, 20 skipped (15 agent layer waiting on the planner agent, 3 API body-size limits, 1 breaker, 1 execution). Skips are listed in `arena/results/summary.json` and are never counted as passes.
