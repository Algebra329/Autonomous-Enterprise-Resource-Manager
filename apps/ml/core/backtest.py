"""C6 backtest: replay past purchasing under a policy and ask "what would the agent have done, and what would it have saved?"

What is replayed is the DEMAND (sku, quantity, date, benchmark price), not the human's choices. The agent then sources the
item the way it would live: negotiate with each approved vendor, take the cheapest, and run the verifier's constraint checks
on ITS proposal (not on the price the human happened to pay).

Verdicts (same vocabulary as the verifier):
  auto_approved  every check passed and mode is auto_under_cap
  escalated      a constraint failed (or mode is 'suggest'): a human decides. We ASSUME the manager approves it.
  blocked        the circuit breaker tripped (velocity or spend per hour): nothing is bought
  observed       mode is 'shadow': the agent only watches

Savings = (human unit price - agent unit price) x quantity, USD only.
  realized  = auto_approved purchases only (the headline)
  potential = escalated purchases (needs a human yes)
  blocked/observed purchases are never counted as savings.

ASSUMPTIONS (also returned in every result): vendor behaviour comes from our own simulated vendors (seed/vendors.json), so
the size of the savings depends on that configuration; the replay does not detect duplicate orders (the verifier has no such rule).
"""
from collections import Counter, defaultdict
from datetime import timedelta

from .common import InputError, MAX_PURCHASES, need, parse_ts

# Keep in sync with seed/vendors.json (tests/test_core.py checks this when the generator is importable).
DEFAULT_VENDORS = {
    "vendor_a": {"list_multiplier": {"laptops": 1.10, "monitors": 1.04, "accessories": 1.06},
                 "floor_multiplier": {"laptops": 1.00, "monitors": 0.98, "accessories": 1.00},
                 "concession_rate": 0.40, "max_rounds": 3, "skus": ["LAP-14", "LAP-16", "MON-24", "MON-27", "DOCK-TB"]},
    "vendor_b": {"list_multiplier": {"laptops": 1.02, "monitors": 0.95, "accessories": 0.97},
                 "floor_multiplier": {"laptops": 1.00, "monitors": 0.94, "accessories": 0.96},
                 "concession_rate": 0.10, "max_rounds": 3, "skus": ["LAP-14", "MON-24", "MON-27", "DOCK-TB"]},
}
DEFAULT_BREAKER = {"max_orders_per_hour": 10, "max_spend_per_hour": 5000, "cooldown_minutes": 60}
POLICY_FIELDS = ("categories", "max_unit_price", "monthly_cap", "currency", "approved_vendors", "max_over_benchmark_pct", "mode")
ASSUMPTIONS = [
    "Replays demand (sku, quantity, date, benchmark), not the human's vendor or price choices.",
    "The agent buys from the cheapest approved vendor after up to max_rounds of counters at the benchmark price.",
    "Vendor price lists and concession behaviour come from our simulated vendors, so savings depend on that configuration.",
    "Escalated purchases are assumed approved by the manager and count toward the monthly cap.",
    "Blocked purchases (circuit breaker) are not executed and never counted as savings.",
    "Non-USD purchases are excluded from savings (no FX data).",
    "Duplicate orders are not detected by any verifier rule, so a duplicate would be replayed as a second purchase.",
]


def validate_policy(policy):
    if not isinstance(policy, dict) or set(policy) != set(POLICY_FIELDS):
        raise InputError(f"policy must have exactly these fields: {', '.join(POLICY_FIELDS)}")
    if policy["currency"] != "USD":
        raise InputError("backtest supports USD policies only")
    if policy["mode"] not in ("shadow", "suggest", "auto_under_cap"):
        raise InputError("bad mode")
    for k in ("max_unit_price", "monthly_cap"):
        if not isinstance(policy[k], (int, float)) or policy[k] <= 0:
            raise InputError(f"{k} must be a positive number")
    return policy


def negotiate(cfg, category, market, rounds):
    """Buyer counters at the benchmark; the vendor moves `concession_rate` of the gap per round, never below its floor."""
    price = market * cfg["list_multiplier"][category]
    floor = market * cfg["floor_multiplier"][category]
    for _ in range(min(rounds, cfg["max_rounds"])):
        if price > market:
            price = max(floor, price - cfg["concession_rate"] * (price - market))
    return round(price, 2)


def best_quote(policy, vendors, sku, category, market, rounds):
    best = None
    for v in policy["approved_vendors"]:
        cfg = vendors.get(v)
        if cfg and sku in cfg["skus"] and category in cfg["list_multiplier"]:
            price = negotiate(cfg, category, market, rounds)
            if best is None or price < best[1]:
                best = (v, price)
    return best


def replay(policy, purchases, vendors=None, breaker=None, rounds=None, details=False):
    pol = validate_policy(policy)
    vendors = vendors or DEFAULT_VENDORS
    br = {**DEFAULT_BREAKER, **(breaker or {})}
    if len(purchases) > MAX_PURCHASES:
        raise InputError(f"at most {MAX_PURCHASES} purchases")
    rows = sorted(purchases, key=lambda p: parse_ts(need(p, "ordered_at", "purchase")))
    spent, window, blocked_until = defaultdict(float), [], None
    out = []
    for p in rows:
        t = parse_ts(p["ordered_at"])
        qty = int(need(p, "quantity", "purchase"))
        market = float(need(p, "benchmark_price", "purchase"))
        human_unit = float(need(p, "unit_price", "purchase"))
        if qty <= 0 or market <= 0 or human_unit <= 0:
            raise InputError(f"purchase {p.get('id')}: quantity, unit_price and benchmark_price must be positive")
        cat, sku = need(p, "category", "purchase"), need(p, "sku", "purchase")
        q = best_quote(pol, vendors, sku, cat, market, 99 if rounds is None else rounds)
        reasons = []
        vendor, agent_unit = q if q else (None, human_unit)
        if q is None:
            reasons.append("NO_APPROVED_VENDOR")
        total = agent_unit * qty
        window = [(wt, wa) for wt, wa in window if t - wt < timedelta(hours=1)]
        verdict = None
        if blocked_until and t < blocked_until:
            verdict, reasons = "blocked", ["BREAKER_OPEN"]
        elif len(window) + 1 > br["max_orders_per_hour"]:
            verdict, reasons = "blocked", ["BREAKER_VELOCITY"]
            blocked_until = t + timedelta(minutes=br["cooldown_minutes"])
        elif sum(a for _, a in window) + total > br["max_spend_per_hour"]:
            verdict, reasons = "blocked", ["BREAKER_SPEND"]
            blocked_until = t + timedelta(minutes=br["cooldown_minutes"])
        elif pol["mode"] == "shadow":
            verdict = "observed"
        else:
            if cat not in pol["categories"]:
                reasons.append("CATEGORY_NOT_ALLOWED")
            if agent_unit > pol["max_unit_price"]:
                reasons.append("UNIT_PRICE_EXCEEDED")
            if (agent_unit / market - 1) * 100 > pol["max_over_benchmark_pct"]:
                reasons.append("OVER_BENCHMARK")
            if spent[(t.year, t.month)] + total > pol["monthly_cap"]:
                reasons.append("MONTHLY_CAP_EXCEEDED")
            if pol["mode"] != "auto_under_cap":
                reasons.append("MODE_NOT_AUTO")
            verdict = "escalated" if reasons else "auto_approved"
        if verdict in ("auto_approved", "escalated"):
            spent[(t.year, t.month)] += total
            window.append((t, total))
        usd = (p.get("currency") or "USD") == "USD"
        saving = (human_unit - agent_unit) * qty if (usd and verdict in ("auto_approved", "escalated")) else None
        out.append({"id": p.get("id"), "ordered_at": p["ordered_at"], "sku": sku, "quantity": qty, "verdict": verdict, "reasons": reasons,
                    "agent_vendor": vendor, "agent_unit_price": round(agent_unit, 2), "human_vendor": p.get("vendor_id"),
                    "human_unit_price": human_unit, "currency": p.get("currency") or "USD",
                    "saving": None if saving is None else round(saving, 2), "human_total_usd": round(human_unit * qty, 2) if usd else None})
    return summarize(out, pol, details)


def _week(ts):
    t = parse_ts(ts)
    return (t - timedelta(days=t.weekday())).date()


def summarize(res, pol, details):
    n = len(res)
    cnt = Counter(r["verdict"] for r in res)
    realized = round(sum(r["saving"] for r in res if r["verdict"] == "auto_approved" and r["saving"] is not None), 2)
    potential = round(sum(r["saving"] for r in res if r["verdict"] == "escalated" and r["saving"] is not None), 2)
    auto_human = sum(r["human_total_usd"] for r in res if r["verdict"] == "auto_approved" and r["human_total_usd"])
    weeks = defaultdict(lambda: {"projected_savings": 0.0, "potential_savings": 0.0, "auto_approved": 0, "escalated": 0, "blocked": 0, "observed": 0})
    for r in res:
        w = weeks[_week(r["ordered_at"])]
        w[r["verdict"]] += 1
        if r["saving"] is not None:
            w["projected_savings" if r["verdict"] == "auto_approved" else "potential_savings"] += r["saving"]
    weekly = []
    if weeks:
        d, last = min(weeks), max(weeks)
        while d <= last:
            w = weeks.get(d, {"projected_savings": 0.0, "potential_savings": 0.0, "auto_approved": 0, "escalated": 0, "blocked": 0, "observed": 0})
            weekly.append({"week": d.isoformat(), **{k: (round(v, 2) if isinstance(v, float) else v) for k, v in w.items()}})
            d += timedelta(days=7)
    pos = sorted((r["saving"] for r in res if r["saving"] and r["saving"] > 0 and r["verdict"] in ("auto_approved", "escalated")), reverse=True)
    summary = {
        "n_purchases": n,
        "counts": {k: cnt.get(k, 0) for k in ("auto_approved", "escalated", "blocked", "observed")},
        "shares": {k: round(cnt.get(k, 0) / n, 3) if n else 0 for k in ("auto_approved", "escalated", "blocked", "observed")},
        "realized_savings": realized, "potential_savings": potential,
        "realized_savings_pct_of_human_spend": round(realized / auto_human * 100, 2) if auto_human else None,
        "human_spend_total_usd": round(sum(r["human_total_usd"] or 0 for r in res), 2),
        "spend_held_by_breaker_usd": round(sum(r["human_total_usd"] or 0 for r in res if r["verdict"] == "blocked"), 2),
        "escalation_reasons": dict(Counter(x for r in res if r["verdict"] == "escalated" for x in r["reasons"])),
        "negative_saving_purchases": sum(1 for r in res if r["saving"] is not None and r["saving"] < 0),
        "excluded_non_usd": sum(1 for r in res if r["human_total_usd"] is None),
        "top3_share_of_positive_savings": round(sum(pos[:3]) / sum(pos), 3) if pos else None,
    }
    out = {"method": "replay_v1", "policy": pol, "assumptions": ASSUMPTIONS, "summary": summary, "weekly": weekly}
    if details:
        out["purchases"] = res
    return out


def backtest(payload):
    pol = need(payload, "policy", "backtest")
    purchases = need(payload, "purchases", "backtest")
    if not isinstance(purchases, list):
        raise InputError("purchases must be a list")
    vendors, breaker = payload.get("vendors"), payload.get("breaker")
    res = replay(pol, purchases, vendors, breaker, details=bool(payload.get("include_details")))
    nego = replay(pol, purchases, vendors, breaker, rounds=0)
    res["savings_decomposition"] = {"realized_with_negotiation": res["summary"]["realized_savings"],
                                    "realized_list_price_only": nego["summary"]["realized_savings"],
                                    "note": "list_price_only = pick the cheaper approved vendor, no counter-offers"}
    if payload.get("include_sensitivity", True):
        res["sensitivity"] = sensitivity(pol, purchases, vendors, breaker)
    return res


def sensitivity(pol, purchases, vendors=None, breaker=None):
    """How the verdict mix and realized savings move when the manager loosens or tightens the policy."""
    grid = []
    for cm in (0.5, 1.0, 1.5, 2.0, 3.0):
        for um in (1.0, 1.2, 1.5):
            p = {**pol, "monthly_cap": round(pol["monthly_cap"] * cm, 2), "max_unit_price": round(pol["max_unit_price"] * um, 2)}
            s = replay(p, purchases, vendors, breaker)["summary"]
            grid.append({"monthly_cap": p["monthly_cap"], "max_unit_price": p["max_unit_price"], "auto_share": s["shares"]["auto_approved"],
                         "escalated_share": s["shares"]["escalated"], "blocked_share": s["shares"]["blocked"], "realized_savings": s["realized_savings"]})
    v = vendors or DEFAULT_VENDORS
    flexible = {k: {**c, "concession_rate": min(1.0, c["concession_rate"] * 2)} for k, c in v.items()}
    scen = []
    for name, vv, rounds in (("list price only (no negotiation)", v, 0), ("as configured", v, None), ("vendors twice as flexible", flexible, None)):
        s = replay(pol, purchases, vv, breaker, rounds=rounds)["summary"]
        scen.append({"scenario": name, "realized_savings": s["realized_savings"], "potential_savings": s["potential_savings"]})
    return {"policy_grid": grid, "negotiation_scenarios": scen}
