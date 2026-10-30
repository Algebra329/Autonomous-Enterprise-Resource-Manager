"""/forecast/replacement: DETERMINISTIC projection. No ML claim: we have no failure data."""
from datetime import timedelta

from .common import InputError, MAX_ASSETS, need, parse_ts

DAYS_PER_MONTH = 30.44   # matches seed/generate.py


def forecast(payload):
    assets = need(payload, "assets", "forecast")
    if not isinstance(assets, list) or len(assets) > MAX_ASSETS:
        raise InputError(f"assets must be a list of at most {MAX_ASSETS}")
    as_of = parse_ts(payload["as_of"]).date() if payload.get("as_of") else __import__("datetime").date.today()
    prices = payload.get("unit_prices") or {}
    buckets = {k: {"count": 0, "est_cost": 0.0, "n_unpriced": 0} for k in ("overdue", "d1_30", "d31_60", "d61_90")}
    items = []
    for a in assets:
        due = parse_ts(need(a, "purchased_at", "asset")).date() + timedelta(days=round(float(need(a, "replace_after_months", "asset")) * DAYS_PER_MONTH))
        days = (due - as_of).days
        b = "overdue" if days <= 0 else "d1_30" if days <= 30 else "d31_60" if days <= 60 else "d61_90" if days <= 90 else "later"
        price = prices.get(a.get("sku")) or prices.get(a.get("category"))
        items.append({"id": a.get("id"), "due_date": due.isoformat(), "days_until_due": days, "bucket": b})
        if b != "later":
            s = buckets[b]
            s["count"] += 1
            if price:
                s["est_cost"] += float(price)
            else:
                s["n_unpriced"] += 1
    for s in buckets.values():
        s["est_cost"] = round(s["est_cost"], 2)
    items.sort(key=lambda x: x["days_until_due"])
    cum = {"count": sum(s["count"] for s in buckets.values()), "est_cost": round(sum(s["est_cost"] for s in buckets.values()), 2)}
    return {"advisory": True, "method": "calendar_rule", "is_fallback": False, "as_of": as_of.isoformat(),
            "buckets": buckets, "cumulative_90d_incl_overdue": cum, "items": items}
