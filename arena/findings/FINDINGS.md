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

## Not fixed by the patch: please decide
1. **Signature check defaults to a simulation.** With no `verifySignature` in the context, a mandate passes unless its payload is literally `"invalid"`. If any route forgets to pass the real ES256 verifier, signatures are not checked. Make `verifySignature` a required field of `VerificationContext` (no default).
2. **Revocation keys differ.** An intent mandate is revoked by its `nonce`; a cart mandate's parent is checked by `parent` id. Confirm the revocations table and the kill switch write the identifiers the verifier actually looks up. The Arena only tests the nonce path.
3. **Vendor quote re-fetch is not compared with the proposal.** PRICE_DRIFT compares the benchmark at proposal time with the market price now. If the vendor's re-fetched price differs from `unit_price`, nothing in the guard notices; the workflow must use the re-fetched price. Case pay-003 (skipped) needs the execution layer to test this.
4. **Missing `currency` silently becomes USD** (Zod `.default('USD')`). Safe today (cur-004 is a diagnostic), but a vendor reply without a currency would be read as USD.
5. **Velocity and spend-per-hour breakers are not in the guard** (it only reads `circuitBreakerOpen`). Where is that computed? Case bud-004 is skipped until it can be driven.

## Coverage today
45 guard attacks run, 20 skipped (15 agent layer waiting on the planner agent, 3 API body-size limits, 1 breaker, 1 execution). Skips are listed in `arena/results/summary.json` and are never counted as passes.
