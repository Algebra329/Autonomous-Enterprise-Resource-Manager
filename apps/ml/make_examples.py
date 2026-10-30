#!/usr/bin/env python3
"""Generates contract_examples.json from REAL handler output, so documented examples cannot drift from reality."""
import json
import data
from core import handlers

d = data.G.build(data.AS_OF.date(), data.G.SEED)
asof = data.AS_OF.isoformat()
gt_s, gt_h = d["ground_truth.json"]["seats"], d["ground_truth.json"]["history"]
pick = lambda cls: next(s for s in d["seats.json"] if gt_s[s["id"]]["class"] == cls)
seats = [dict(pick("idle"), seat_id=pick("idle")["id"]), dict(pick("periodic"), seat_id=pick("periodic")["id"])]
for s in seats:
    s.pop("id", None); s.pop("subscription_id", None); s.pop("user_email", None)
hist = d["history-90d.json"]
burst = [h for h in hist if "velocity_burst" in gt_h[h["id"]]["types"]][:3]
normal = [h for h in hist if not gt_h[h["id"]]["anomaly"]][:25]
infl = next(h for h in hist if "price_inflation" in gt_h[h["id"]]["types"])
ex = {}
req = {"offers": [{"merchant": "shop-a.example", "price": 1449.0, "in_stock": True}, {"merchant": "shop-b.example", "price": 1462.5},
                  {"merchant": "shop-c.example", "price": 1455.0}, {"merchant": "bait.example", "price": 880.0}], "candidate_price": 1595.0, "threshold_pct": 10}
ex["POST /score/price"] = {"request": req, "response": handlers.handle_price(req)}
req = {"seats": seats, "as_of": asof, "threshold_days": 30}
ex["POST /score/seat-idle"] = {"request": req, "response": handlers.handle_seats(req)}
req = {"purchases": normal + burst + [infl], "approved_vendors": ["vendor_a", "vendor_b"]}
resp = handlers.handle_anomaly(req)
resp["results"] = [r for r in resp["results"] if r["is_anomaly"]][:4]   # shortened for readability
ex["POST /score/anomaly"] = {"request": {"purchases": "[... 29 purchase objects, see seed/history-90d.json shape ...]", "approved_vendors": req["approved_vendors"]}, "response": resp}
req = {"assets": d["assets.json"][:3], "as_of": asof, "unit_prices": {"LAP-14": 1450, "LAP-13": 1250, "LAP-16": 1950, "MON-24": 230, "MON-27": 420}}
f = handlers.handle_forecast(req)
ex["POST /forecast/replacement"] = {"request": {"assets": "[... asset objects as in seed/assets.json ...]", "as_of": asof, "unit_prices": req["unit_prices"]}, "response": f}
ex["GET /health"] = {"response": handlers.health()}
ex["POST /score/price (forced fallback)"] = {"request": dict(req if False else {"offers": ex["POST /score/price"]["request"]["offers"], "force_fallback": True}), "response": handlers.handle_price({"offers": ex["POST /score/price"]["request"]["offers"], "force_fallback": True})}
json.dump(ex, open("contract_examples.json", "w"), indent=2)
print("wrote contract_examples.json:", list(ex))
