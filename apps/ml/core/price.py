"""/score/price: robust fair price from market offers.

Why robust: scraped offers contain bait prices (far too low) and gouging (far too high).
A plain mean is dragged by them. Median + MAD (modified z-score) ignores them.
"""
import statistics

from .common import InputError, MAX_OFFERS, need

Z_THRESH = 3.5        # Iglewicz-Hoaglin modified z-score cut-off
MIN_REL_SCALE = 0.02  # floor the spread at 2% of the median so tight clusters do not flag normal variation


def fair_price(prices, z_thresh=Z_THRESH):
    n = len(prices)
    if n == 0:
        return None, []
    med = statistics.median(prices)
    if n < 3:
        return med, [False] * n          # too few points to call anything an outlier
    mad = statistics.median([abs(p - med) for p in prices]) * 1.4826
    scale = max(mad, MIN_REL_SCALE * med)
    flags = [abs(p - med) / scale > z_thresh for p in prices]
    inliers = [p for p, f in zip(prices, flags) if not f]
    return (statistics.median(inliers) if inliers else med), flags


def baseline_fair_price(prices):
    """Fallback the TypeScript client reimplements: plain median of usable offers."""
    return statistics.median(prices) if prices else None


def score_price(payload, fallback=False):
    offers = need(payload, "offers", "price")
    if not isinstance(offers, list) or len(offers) > MAX_OFFERS:
        raise InputError(f"offers must be a list of at most {MAX_OFFERS}")
    threshold = float(payload.get("threshold_pct", 10))
    used, excluded = [], 0
    for i, o in enumerate(offers):
        try:
            price = float(o["price"])
        except (KeyError, TypeError, ValueError):
            excluded += 1
            continue
        if price <= 0 or o.get("in_stock") is False or (o.get("currency") or "USD") != "USD":
            excluded += 1
            continue
        used.append((i, o.get("merchant"), price))
    prices = [p for _, _, p in used]
    if fallback:
        fair, flags = baseline_fair_price(prices), [False] * len(prices)
    else:
        fair, flags = fair_price(prices)
    n = len(prices)
    outliers = []
    for (i, m, p), f in zip(used, flags):
        if f:
            outliers.append({"index": i, "merchant": m, "price": p, "direction": "low" if p < fair else "high",
                             "ratio_to_fair": round(p / fair, 3)})
    inl = [p for p, f in zip(prices, flags) if not f]
    out = {
        "advisory": True,
        "method": "baseline_median" if fallback else "robust_median_mad",
        "is_fallback": fallback,
        "n_offers": len(offers), "n_used": n, "n_excluded": excluded,
        "fair_price": round(fair, 2) if fair else None,
        "price_low": min(inl) if inl else None, "price_high": max(inl) if inl else None,
        "confidence": "none" if n == 0 else "low" if n < 3 else "medium" if n < 5 else "high",
        "outliers": outliers, "threshold_pct": threshold, "candidate": None,
    }
    cp = payload.get("candidate_price")
    if cp is not None and fair:
        pct = (float(cp) / fair - 1) * 100
        hint = "high" if pct > threshold else "suspiciously_low" if float(cp) < 0.7 * fair else "ok"
        out["candidate"] = {"price": float(cp), "pct_over_fair": round(pct, 1), "hint": hint}
    return out
