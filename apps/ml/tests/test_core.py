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


if __name__ == "__main__":
    unittest.main()
