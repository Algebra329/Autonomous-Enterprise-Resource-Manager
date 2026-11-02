import json, tempfile, unittest
from pathlib import Path

import data
from core import handlers
from core.common import InputError


class Price(unittest.TestCase):
    OFFERS = [{"price": p, "merchant": f"m{i}"} for i, p in enumerate([1440, 1452, 1461, 1449, 880, 2900, 1455])]

    def test_flags_bait_and_gouge(self):
        r = handlers.handle_price({"offers": self.OFFERS, "candidate_price": 1700})
        self.assertAlmostEqual(r["fair_price"], 1452, delta=5)
        self.assertEqual({o["direction"] for o in r["outliers"]}, {"low", "high"})
        self.assertEqual(r["candidate"]["hint"], "high")

    def test_excludes_unusable_offers(self):
        r = handlers.handle_price({"offers": [{"price": 100}, {"price": 100, "in_stock": False}, {"price": 100, "currency": "EUR"}, {"price": "x"}, {"price": -5}]})
        self.assertEqual((r["n_used"], r["n_excluded"]), (1, 4))

    def test_few_and_no_offers(self):
        self.assertEqual(handlers.handle_price({"offers": self.OFFERS[:2]})["confidence"], "low")
        self.assertIsNone(handlers.handle_price({"offers": []})["fair_price"])

    def test_limits_and_fallback(self):
        with self.assertRaises(InputError):
            handlers.handle_price({"offers": [{"price": 1}] * 501})
        self.assertTrue(handlers.handle_price({"offers": self.OFFERS, "force_fallback": True})["is_fallback"])


class Forecast(unittest.TestCase):
    def test_buckets(self):
        a = [{"id": "x", "sku": "LAP-14", "purchased_at": "2023-10-28", "replace_after_months": 36},   # due ~2026-10-28 -> overdue/today
             {"id": "y", "sku": "LAP-14", "purchased_at": "2023-11-20", "replace_after_months": 36},   # due in ~23 days
             {"id": "z", "sku": "MON-27", "purchased_at": "2025-01-01", "replace_after_months": 60}]   # far off
        r = handlers.handle_forecast({"assets": a, "as_of": "2026-10-28", "unit_prices": {"LAP-14": 1450}})
        b = r["buckets"]
        self.assertEqual((b["overdue"]["count"], b["d1_30"]["count"]), (1, 1))
        self.assertEqual(r["cumulative_90d_incl_overdue"]["est_cost"], 2900.0)
        self.assertEqual(r["items"][-1]["bucket"], "later")


class Seats(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        d = data.G.build(data.AS_OF.date(), data.G.SEED)
        cls.seats, cls.gt = d["seats.json"], d["ground_truth.json"]["seats"]

    def run_seats(self, **kw):
        return handlers.handle_seats({"seats": self.seats, "as_of": data.AS_OF.isoformat(), **kw})

    def test_model_beats_obvious_mistakes(self):
        r = self.run_seats()
        self.assertEqual(r["method"], "gradient_boosting")
        by = {x["seat_id"]: x for x in r["results"]}
        periodic = [s for s in self.seats if self.gt[s["id"]]["class"] == "periodic"]
        kept = sum(1 for s in periodic if not by[s["id"]]["suggest_prune"])
        self.assertGreaterEqual(kept / len(periodic), 0.8)      # the 30-day rule would keep 0 of these
        idle = [s for s in self.seats if self.gt[s["id"]]["class"] == "idle"]
        self.assertGreaterEqual(sum(by[s["id"]]["suggest_prune"] for s in idle) / len(idle), 0.95)

    def test_fallback_when_model_missing(self):
        old_dir, old_cache = handlers.MODELS_DIR, dict(handlers._cache)
        try:
            handlers.MODELS_DIR, handlers._cache = Path(tempfile.mkdtemp()), {}
            r = self.run_seats()
            self.assertTrue(r["is_fallback"])
            self.assertIn("fallback_reason", r)
            self.assertEqual(handlers.health()["fallbacks_active"], ["seat_idle", "anomaly"])
        finally:
            handlers.MODELS_DIR, handlers._cache = old_dir, old_cache

    def test_hr_flag_and_limits(self):
        s = dict(self.seats[0], offboarded=True)
        r = handlers.handle_seats({"seats": [s], "as_of": data.AS_OF.isoformat()})
        self.assertIn("offboarded", r["results"][0]["reason"])
        with self.assertRaises(InputError):
            handlers.handle_seats({"seats": [{"last_active_at": "not a date"}]})


class Anomaly(unittest.TestCase):
    def test_flags_planted_anomalies_with_reasons(self):
        d = data.G.build(data.AS_OF.date(), data.G.SEED)
        gt = d["ground_truth.json"]["history"]
        r = handlers.handle_anomaly({"purchases": d["history-90d.json"]})
        flagged = {x["id"]: x for x in r["results"] if x["is_anomaly"]}
        inflated = [i for i, t in gt.items() if "price_inflation" in t["types"]]
        self.assertTrue(all(i in flagged for i in inflated))
        self.assertTrue(all(flagged[i]["reasons"] for i in inflated))
        self.assertTrue(handlers.handle_anomaly({"purchases": d["history-90d.json"], "force_fallback": True})["is_fallback"])



POL = {"categories": ["laptops", "monitors"], "max_unit_price": 1500, "monthly_cap": 8000, "currency": "USD",
       "approved_vendors": ["vendor_a", "vendor_b"], "max_over_benchmark_pct": 10, "mode": "auto_under_cap"}


def P(i, ts, sku="LAP-14", cat="laptops", qty=1, unit=1800.0, bench=1450.0, cur="USD", vendor="vendor_a"):
    return {"id": i, "ordered_at": ts, "vendor_id": vendor, "sku": sku, "category": cat, "quantity": qty,
            "unit_price": unit, "benchmark_price": bench, "currency": cur}


class Backtest(unittest.TestCase):
    def rep(self, purchases, policy=None, **kw):
        from core.backtest import replay
        return replay(policy or POL, purchases, details=True, **kw)

    def test_negotiation_arithmetic_and_savings(self):
        # vendor_b LAP-14: list 1479.00, floor 1450, concedes 10% of the gap to the 1450 counter per round, 3 rounds:
        # 1476.10 -> 1473.49 -> 1471.141 ; vendor_a (40%) reaches only 1481.32, so vendor_b wins.
        r = self.rep([P("a", "2026-07-06T10:00:00Z")])
        x = r["purchases"][0]
        self.assertEqual((x["verdict"], x["agent_vendor"], x["agent_unit_price"]), ("auto_approved", "vendor_b", 1471.14))
        self.assertEqual(x["saving"], 328.86)
        self.assertEqual(r["summary"]["realized_savings"], 328.86)

    def test_cap_escalates_and_resets_next_month(self):
        ps = [P(f"c{i}", d, qty=3) for i, d in enumerate(["2026-07-06T10:00:00Z", "2026-07-13T10:00:00Z", "2026-07-20T10:00:00Z", "2026-08-03T10:00:00Z"])]
        v = [x["verdict"] for x in self.rep(ps)["purchases"]]
        self.assertEqual(v, ["auto_approved", "escalated", "escalated", "auto_approved"])
        self.assertIn("MONTHLY_CAP_EXCEEDED", self.rep(ps)["purchases"][1]["reasons"])

    def test_breaker_velocity_cooldown_and_recovery(self):
        ps = [P(f"b{i}", f"2026-07-06T10:{i:02d}:00Z", "MON-24", "monitors", 1, 240.0, 230.0) for i in range(12)]
        ps.append(P("late", "2026-07-06T12:30:00Z", "MON-24", "monitors", 1, 240.0, 230.0))
        v = [x["verdict"] for x in self.rep(ps)["purchases"]]
        self.assertEqual(v, ["auto_approved"] * 10 + ["blocked", "blocked", "auto_approved"])
        self.assertEqual(self.rep(ps)["purchases"][10]["reasons"], ["BREAKER_VELOCITY"])

    def test_spend_breaker(self):
        ps = [P(f"s{i}", f"2026-07-06T10:0{i}:00Z", qty=1) for i in range(4)]   # ~1471 each: 4th pushes the hour above 5000
        self.assertEqual([x["verdict"] for x in self.rep(ps, {**POL, "monthly_cap": 99999})["purchases"]][3], "blocked")

    def test_modes(self):
        s = self.rep([P("m", "2026-07-06T10:00:00Z")], {**POL, "mode": "suggest"})
        self.assertEqual(s["purchases"][0]["reasons"], ["MODE_NOT_AUTO"])
        self.assertEqual(s["summary"]["realized_savings"], 0)
        sh = self.rep([P("m", "2026-07-06T10:00:00Z")], {**POL, "mode": "shadow"})
        self.assertEqual((sh["purchases"][0]["verdict"], sh["purchases"][0]["saving"]), ("observed", None))

    def test_edge_cases(self):
        r = self.rep([P("u", "2026-07-06T10:00:00Z", cur="CAD"), P("n", "2026-07-07T10:00:00Z", "LAP-16", "laptops", 1, 2100.0, 1950.0)],
                     {**POL, "approved_vendors": ["vendor_b"]})
        self.assertEqual(r["summary"]["excluded_non_usd"], 1)
        n = r["purchases"][1]
        self.assertEqual((n["verdict"], n["saving"]), ("escalated", 0.0))            # vendor_b does not stock LAP-16: manager buys as before
        self.assertIn("NO_APPROVED_VENDOR", n["reasons"])
        self.assertIn("UNIT_PRICE_EXCEEDED", n["reasons"])                           # 2100 > the 1500 cap as well

    def test_weekly_shape_order_independence_and_validation(self):
        import random
        ps = [P(f"w{i}", d) for i, d in enumerate(["2026-07-06T10:00:00Z", "2026-07-27T10:00:00Z"])]
        r = self.rep(ps)
        self.assertEqual(len(r["weekly"]), 4)                          # empty weeks are kept so charts are continuous
        self.assertEqual(sum(w["auto_approved"] + w["escalated"] + w["blocked"] for w in r["weekly"]), 2)
        random.Random(1).shuffle(ps)
        self.assertEqual(self.rep(ps)["summary"], r["summary"])
        with self.assertRaises(InputError):
            self.rep(ps, {**POL, "currency": "EUR"})
        with self.assertRaises(InputError):
            self.rep(ps, {"categories": ["laptops"]})

    def test_vendor_defaults_match_the_seed_generator(self):
        from core.backtest import DEFAULT_VENDORS
        for k, c in data.G.VENDORS.items():
            for f in ("list_multiplier", "floor_multiplier", "concession_rate", "max_rounds", "skus"):
                self.assertEqual(DEFAULT_VENDORS[k][f], c[f], f"{k}.{f} drifted from generate.py")

    def test_handler_and_decomposition(self):
        r = handlers.handle_backtest({"policy": POL, "purchases": [P("h", "2026-07-06T10:00:00Z")]})
        self.assertIn("savings_decomposition", r)
        self.assertEqual(len(r["sensitivity"]["policy_grid"]), 15)


if __name__ == "__main__":
    unittest.main()
