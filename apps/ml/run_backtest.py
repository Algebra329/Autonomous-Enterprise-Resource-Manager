#!/usr/bin/env python3
"""Writes seed/backtest-demo.json: the precomputed backtest for the demo policy (dashboard fixture AND the API's fallback
when the ML service is down), plus an EVAL-ONLY seat-pruning projection checked against ground truth.

    python run_backtest.py [--policy policy.json] [--out ../../seed/backtest-demo.json]
"""
import argparse, json
from pathlib import Path

import data
from core import handlers
from core.backtest import backtest

ROOT = Path(__file__).resolve().parents[2]
DEMO_POLICY = {"categories": ["laptops", "monitors"], "max_unit_price": 1800, "monthly_cap": 12000, "currency": "USD",
               "approved_vendors": ["vendor_a", "vendor_b"], "max_over_benchmark_pct": 10, "mode": "auto_under_cap"}


def seat_projection():
    seed = ROOT / "seed"
    seats = json.loads((seed / "seats.json").read_text())
    subs = {s["id"]: s for s in json.loads((seed / "saas.json").read_text())}
    gt = json.loads((seed / "ground_truth.json").read_text())["seats"]
    r = handlers.handle_seats({"seats": [{**s, "seat_id": s["id"]} for s in seats], "as_of": data.AS_OF.isoformat()})
    flagged = {x["seat_id"] for x in r["results"] if x["suggest_prune"]}
    price = {s["id"]: subs[s["subscription_id"]]["seat_price"] for s in seats}
    app = {s["id"]: subs[s["subscription_id"]]["app"] for s in seats}
    prunable = {i for i, t in gt.items() if t["should_prune"]}
    cost = lambda ids: round(sum(price[i] for i in ids), 2)
    by_app = {}
    for i in flagged:
        by_app[app[i]] = round(by_app.get(app[i], 0) + price[i], 2)
    return {
        "method": r["method"], "model_version": r.get("model_version"), "hr_feed_used": False,
        "monthly_saving_if_all_flagged_cancelled": cost(flagged), "seats_flagged": len(flagged), "total_seats": len(seats),
        "total_monthly_seat_spend": cost(price), "by_app": dict(sorted(by_app.items(), key=lambda kv: -kv[1])),
        "eval_only_ground_truth_check": {
            "truly_idle_monthly_waste": cost(prunable), "wrongly_flagged_seats": len(flagged - prunable),
            "wrongly_flagged_monthly_cost": cost(flagged - prunable), "missed_seats": len(prunable - flagged),
            "missed_monthly_cost": cost(prunable - flagged),
            "note": "Uses synthetic ground truth. Real deployments cannot compute this; cancellations above the cost/seat threshold still need approval (FR-14)."},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--policy")
    ap.add_argument("--out", default=str(ROOT / "seed" / "backtest-demo.json"))
    a = ap.parse_args()
    pol = json.loads(Path(a.policy).read_text()) if a.policy else DEMO_POLICY
    hist = json.loads((ROOT / "seed" / "history-90d.json").read_text())
    res = backtest({"policy": pol, "purchases": hist, "include_details": True})
    out = {"generated_for": "seed/history-90d.json", "as_of": data.AS_OF.date().isoformat(),
           "synthetic": True, "backtest": res, "seat_pruning": seat_projection()}
    Path(a.out).write_text(json.dumps(out, indent=2) + "\n")
    s, sp = res["summary"], out["seat_pruning"]
    print(f"purchases: {s['counts']} | realized ${s['realized_savings']:,.2f} ({s['realized_savings_pct_of_human_spend']}% of human spend on those) | potential ${s['potential_savings']:,.2f}")
    print(f"decomposition: {res['savings_decomposition']['realized_list_price_only']} list-price-only vs {res['savings_decomposition']['realized_with_negotiation']} with negotiation")
    print(f"seats: flag {sp['seats_flagged']}/{sp['total_seats']} = ${sp['monthly_saving_if_all_flagged_cancelled']:,.2f}/month of ${sp['total_monthly_seat_spend']:,.2f}; wrongly flagged ${sp['eval_only_ground_truth_check']['wrongly_flagged_monthly_cost']}")
    print("wrote", a.out)


if __name__ == "__main__":
    main()
