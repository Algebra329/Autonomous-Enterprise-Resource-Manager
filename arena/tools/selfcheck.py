#!/usr/bin/env python3
"""Sanity-checks the ANSWER KEY (not the verifier): for constraint-style guard cases, recompute
which rules the spec's arithmetic should trip and confirm each case's rules_any contains one.
Signature/expiry/replay cases are out of scope here (they need real crypto: packages/guard tests)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
base = json.loads((ROOT / "baseline.json").read_text())
cons = base["mandate"]["constraints"]


def predicted(case):
    st = {**base["state"], **case.get("arrange", {}).get("state", {})}
    act = case["act"]
    p = {**base[act.get("proposal_base", "proposal")], **act.get("proposal", {})}
    for k in act.get("proposal_remove", []):
        p.pop(k, None)
    if "sequence" in act:
        return None
    try:
        unit, qty, quote, bench = float(p["unit_price"]), p["quantity"], float(p["quote_price"]), float(p["benchmark_price"])
    except (TypeError, ValueError, KeyError):
        return "INVALID"
    if not isinstance(qty, int) or qty <= 0 or unit <= 0:
        return "INVALID"
    r = set()
    if p.get("vendor_id") not in cons["approved_vendors"]: r.add("VENDOR_NOT_APPROVED")
    if p.get("category") not in cons["categories"]: r.add("CATEGORY_NOT_ALLOWED")
    if p.get("currency") != cons["currency"]: r.add("CURRENCY_MISMATCH")
    if unit > cons["max_unit_price"]: r.add("UNIT_PRICE_EXCEEDED")
    if (unit - bench) / bench * 100 > cons["max_over_benchmark_pct"]: r.add("OVER_BENCHMARK")
    if st["spent_this_month"] + unit * qty > cons["monthly_cap"]: r.add("MONTHLY_CAP_EXCEEDED")
    if abs(quote - unit) / unit * 100 > base["price_drift_tolerance_pct"]: r.add("PRICE_DRIFT")
    return r


bad, checked = [], 0
for f in sorted((ROOT / "cases").glob("*.json")):
    for c in json.loads(f.read_text()):
        if c["layer"] != "guard" or set(c.get("arrange", {})) - {"state"} or "raw_json" in c["act"]:
            continue
        if set(c.get("arrange", {}).get("state", {})) & {"breaker_open", "kill_switch", "nonce_used"}:
            continue  # state flags, not arithmetic: covered by packages/guard unit tests
        pr = predicted(c)
        if pr is None:
            continue
        checked += 1
        exp = c["expect"]
        if c["kind"] == "control" and "auto_approved" in exp["outcomes"]:
            ok = pr == set()
        elif pr == "INVALID":
            ok = "rejected_invalid" in exp["outcomes"]
        elif exp["rules_any"]:
            ok = bool(pr & set(exp["rules_any"]))
        else:
            ok = True
        if not ok:
            bad.append((c["id"], c["title"], pr, exp["rules_any"]))
print(f"checked {checked} constraint-style cases")
for b in bad:
    print("MISMATCH", b)
print("answer key consistent with the spec arithmetic" if not bad else f"{len(bad)} mismatches")
