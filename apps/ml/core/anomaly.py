"""/score/anomaly: which purchases look unusual? Isolation forest over engineered features.

The model is unsupervised: it never sees labels, only what "normal" purchasing looks like.
Features are computed per batch (the batch is the recent purchase history).
"""
import numpy as np

from .common import InputError, MAX_PURCHASES, need, parse_ts

FEATURES = ["ratio", "ratio_rel", "non_usd", "qty_z", "vendor_known", "vendor_share", "burst_60m", "duplicate_24h"]
DEFAULT_APPROVED = ("vendor_a", "vendor_b")
NAIVE_RATIO_THRESHOLD = 1.25


def purchase_features(batch, approved=DEFAULT_APPROVED):
    n = len(batch)
    if n == 0:
        return np.zeros((0, len(FEATURES)))
    t = np.array([parse_ts(need(b, "ordered_at", "purchase")).timestamp() for b in batch])
    unit = np.array([float(need(b, "unit_price", "purchase")) for b in batch])
    bench = np.array([float(b.get("benchmark_price") or 0) or np.nan for b in batch])
    ratio = np.where(np.isnan(bench), 1.0, unit / np.where(np.isnan(bench), 1.0, bench))
    qty = np.array([max(1.0, float(b.get("quantity", 1))) for b in batch])
    vendors = [b.get("vendor_id") for b in batch]
    cats = [b.get("category") for b in batch]
    reqs = [b.get("requested_by") for b in batch]
    glob_med = float(np.median(ratio))
    ratio_rel = np.empty(n)
    for i in range(n):
        idx = [j for j in range(n) if vendors[j] == vendors[i] and cats[j] == cats[i]]
        ratio_rel[i] = ratio[i] / (float(np.median(ratio[idx])) if len(idx) >= 3 else glob_med)
    qty_z = np.zeros(n)
    for c in set(cats):
        idx = [j for j in range(n) if cats[j] == c]
        lq = np.log(qty[idx])
        med = np.median(lq)
        scale = max(1.4826 * np.median(np.abs(lq - med)), 0.35)
        qty_z[idx] = np.maximum((lq - med) / scale, 0)
    share = np.array([vendors.count(v) / n for v in vendors])
    burst, dup = np.zeros(n), np.zeros(n)
    for i in range(n):
        burst[i] = sum(1 for j in range(n) if reqs[j] == reqs[i] and abs(t[j] - t[i]) <= 1800)
        dup[i] = float(any(j != i and vendors[j] == vendors[i] and batch[j].get("sku") == batch[i].get("sku")
                           and qty[j] == qty[i] and 0 < t[i] - t[j] <= 86400 for j in range(n)))
    X = np.column_stack([ratio, ratio_rel, [float((b.get("currency") or "USD") != "USD") for b in batch], qty_z,
                         [float(v in approved) for v in vendors], share, burst, dup])
    return X


def reasons(x, batch_row):
    f = dict(zip(FEATURES, x))
    r = []
    if f["ratio"] > NAIVE_RATIO_THRESHOLD:
        r.append(f"price is {int((f['ratio'] - 1) * 100)}% above benchmark")
    elif f["ratio_rel"] > 1.12:
        r.append("price is high compared with this vendor's usual prices")
    elif f["ratio_rel"] < 0.8:
        r.append("price is far below this vendor's usual prices")
    if f["non_usd"]:
        r.append(f"currency is {batch_row.get('currency')}, not USD")
    if f["qty_z"] > 3:
        r.append(f"quantity {int(batch_row.get('quantity', 0))} is far above typical for {batch_row.get('category')}")
    if not f["vendor_known"]:
        r.append("vendor is not on the approved list")
    if f["burst_60m"] >= 4:
        r.append(f"{int(f['burst_60m'])} orders by the same requester within an hour")
    if f["duplicate_24h"]:
        r.append("same vendor, item and quantity ordered within the previous 24 hours")
    return r


def score_purchases(payload, bundle, fallback=False):
    batch = need(payload, "purchases", "anomaly")
    if not isinstance(batch, list) or len(batch) > MAX_PURCHASES:
        raise InputError(f"purchases must be a list of at most {MAX_PURCHASES}")
    approved = tuple(payload.get("approved_vendors") or DEFAULT_APPROVED)
    X = purchase_features(batch, approved)
    if fallback or bundle is None:
        res = [{"id": b.get("id"), "anomaly_score": round(min(1.0, float(x[0]) / 2.0), 3), "is_anomaly": bool(x[0] > NAIVE_RATIO_THRESHOLD),
                "reasons": [f"price is {int((x[0] - 1) * 100)}% above benchmark"] if x[0] > NAIVE_RATIO_THRESHOLD else []}
               for b, x in zip(batch, X)]
        return {"advisory": True, "method": "baseline_price_ratio_rule", "is_fallback": True, "results": res}
    raw = -bundle["model"].decision_function(X) if len(X) else np.array([])
    score = np.searchsorted(bundle["train_scores"], raw, side="right") / len(bundle["train_scores"])
    tau = bundle["tau"]
    res = [{"id": b.get("id"), "anomaly_score": round(float(s), 3), "is_anomaly": bool(s >= tau), "reasons": reasons(x, b)}
           for b, x, s in zip(batch, X, score)]
    return {"advisory": True, "method": "isolation_forest", "is_fallback": False, "model_version": bundle["version"],
            "threshold": round(float(tau), 3), "results": res}
