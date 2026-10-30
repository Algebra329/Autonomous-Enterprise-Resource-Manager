# ML service contract (advisory only)

Owner: MLE. Consumer: BAI's ML client (task B9). Real request/response examples: `contract_examples.json`
(generated from actual service output by `python make_examples.py`).

## Rules that never change
1. **Advisory only.** Nothing here may influence `packages/guard`. Scores appear in the UI (Approval Queue, dashboard) as hints.
2. Every response has `advisory: true`, `method`, `is_fallback`.
3. Client timeout **2 s**, one retry max. On timeout, 5xx, 401 or connection error: use the TypeScript fallback below and set `is_fallback: true` in what the UI receives. The API must keep working with the service switched off.
4. The service never receives secrets, PayPal IDs or mandates. Only the fields listed below.
5. Auth: if `SERVICE_TOKEN` is set, send `Authorization: Bearer <token>`. `/health` is open.
6. Errors: bad or oversized input returns **422** with `{"detail": "..."}`. Treat 422 as a bug in the caller, not as "service down".

## Endpoints
| Route | Request (required fields) | Response highlights | Limit |
| --- | --- | --- | --- |
| `GET /health` | none | `status`, `models`, `fallbacks_active` (non-empty means a model failed to load) | |
| `POST /score/price` | `offers[]` {`price`, `merchant?`, `in_stock?`, `currency?`}, `candidate_price?`, `threshold_pct?` (default 10) | `fair_price`, `confidence` (none/low/medium/high), `outliers[]`, `candidate.hint` (`ok`/`high`/`suspiciously_low`) | 500 offers |
| `POST /score/seat-idle` | `seats[]` {`seat_id`, `last_active_at`, `weekly_sessions_13w` (13 ints, oldest first), `offboarded?`}, `as_of?`, `threshold_days?` | per seat `idle_score` 0-1, `suggest_prune`, `reason` | 5000 seats |
| `POST /score/anomaly` | `purchases[]` (shape of `seed/history-90d.json`), `approved_vendors?` | per purchase `anomaly_score` 0-1, `is_anomaly`, `reasons[]` | 5000 purchases |
| `POST /forecast/replacement` | `assets[]` {`id`, `purchased_at`, `replace_after_months`, `sku?`, `category?`}, `as_of?`, `unit_prices?` | `buckets` (overdue, d1_30, d31_60, d61_90) with counts and `est_cost`, `items[]` | 10000 assets |

Notes:
- `offboarded` on a seat is optional. Send it only if an HR feed really exists; omit it otherwise (omitted is NOT the same as false).
- Anomaly scoring is per batch: send the recent purchase history (about 90 days), not one purchase at a time. Burst and duplicate detection need neighbours.
- `force_fallback: true` on any score route makes the service answer with its baseline (use it in your tests of the fallback path).

## TypeScript fallbacks (what the client does when the service is unavailable)
Keep them this simple on purpose. They must be easy to reimplement and review.
- **price:** `fair_price` = median of offers where `price > 0`, `in_stock !== false`, currency USD or missing. No outlier flags. `confidence` = none / low (<3) / medium (<5) / high.
  Candidate hint: `high` if `candidate / fair - 1 > threshold_pct / 100`, else `ok`.
- **seat-idle:** `suggest_prune = daysSince(last_active_at) >= threshold_days` (default 30); `idle_score = min(1, days / (2 * threshold_days))`.
- **anomaly:** `is_anomaly = unit_price / benchmark_price > 1.25`; no other reasons.
- **forecast:** `due = purchased_at + round(replace_after_months * 30.44) days`; bucket by `due - as_of`. This one is already deterministic, so the fallback equals the service.

## Versioning
Responses carry `model_version` (seat, anomaly). Breaking changes to field names bump the route (`/v2/...`). Adding fields is non-breaking: ignore unknown fields.

## Deploy (Render web service)
Root directory `apps/ml`. Build: `pip install -r requirements.txt`. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
Models are committed in `models/` (about 3 MB). They are pickles: keep `numpy` and `scikit-learn` pinned to the versions in `requirements.txt`, or retrain with `python train.py`.
Env: `SERVICE_TOKEN` (shared secret with the API), optional `MODELS_DIR`.
