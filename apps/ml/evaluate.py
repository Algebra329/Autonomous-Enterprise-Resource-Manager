#!/usr/bin/env python3
"""Evaluates every endpoint against its baseline on HELD-OUT synthetic seeds. Writes metrics.json + metrics.md.
ALL numbers are on synthetic data from our own generator: treat them as upper bounds, never as field results."""
import json
import random
from collections import Counter, defaultdict
from datetime import timedelta

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import data
from core import anomaly as A
from core import price as P
from core import seats as S
from core.common import parse_ts

R = {}


def prf(y, pred):
    tp = int(((pred == 1) & (y == 1)).sum()); fp = int(((pred == 1) & (y == 0)).sum()); fn = int(((pred == 0) & (y == 1)).sum())
    p = tp / max(1, tp + fp); r = tp / max(1, tp + fn)
    return {"precision": round(p, 3), "recall": round(r, 3), "f1": round(2 * p * r / max(p + r, 1e-9), 3), "tp": tp, "fp": fp, "fn": fn}


# ------------------------------------------------------------------ seats
def eval_seats():
    seat = joblib.load("models/seat_gbm.joblib")
    Xs, ys = [], []
    for s in data.TRAIN_SEEDS:
        f, y, _ = data.seats_xy(s, "mixed"); Xs.append(S.matrix(f)); ys.append(y)
    X, y = np.vstack(Xs), np.concatenate(ys)
    lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(X, y)
    out = {}
    for mode in ("none", "all"):
        rows = defaultdict(lambda: {"y": [], "base": [], "lr": [], "gbm": [], "gbm_p": [], "cls": []})
        for sd in data.TEST_SEEDS:
            f, yy, cls = data.seats_xy(sd, mode)
            M = S.matrix(f)
            d = rows["pooled"]
            d["y"].append(yy); d["cls"].append(cls)
            d["base"].append(np.array([int(x["days_since"] >= 30) for x in f]))
            d["lr"].append((lr.predict_proba(M)[:, 1] >= 0.5).astype(int))
            p = seat["model"].predict_proba(M)[:, 1]
            d["gbm_p"].append(p); d["gbm"].append((p >= seat["tau"]).astype(int))
        d = rows["pooled"]
        y_, cls_ = np.concatenate(d["y"]), np.concatenate(d["cls"])
        res = {"n_seats": int(len(y_)), "n_should_prune": int(y_.sum())}
        for name in ("base", "lr", "gbm"):
            pred = np.concatenate(d[name])
            m = prf(y_, pred)
            m["recall_by_class"] = {c: round(float(pred[(cls_ == c)].mean()), 3) for c in ("idle", "drifting", "offboarded")}
            m["false_positives_by_class"] = {str(k): int(v) for k, v in Counter(cls_[(pred == 1) & (y_ == 0)]).items()}
            res[{"base": "baseline_30_day_rule", "lr": "logistic_regression", "gbm": "gradient_boosting"}[name]] = m
        res["gradient_boosting"]["average_precision"] = round(float(average_precision_score(y_, np.concatenate(d["gbm_p"]))), 3)
        out[f"hr_feed_{mode}"] = res
    return out


# ------------------------------------------------------------------ anomalies
def novel(batch, types, seed):
    rng = random.Random(f"novel:{seed}")
    t0 = parse_ts(batch[0]["ordered_at"])
    ts = sorted(parse_ts(b["ordered_at"]) for b in batch)
    for kind, mult, sku, cat, vendor in (("underpriced_known_vendor", 0.60, "LAP-14", "laptops", "vendor_b"),
                                        ("mild_inflation", 1.22, "MON-27", "monitors", "vendor_a")):
        for k in range(4):
            t = ts[rng.randrange(len(ts))] + timedelta(hours=rng.randint(1, 5), minutes=rng.randint(0, 59))
            bench = round(rng.uniform(0.98, 1.02) * (1450 if cat == "laptops" else 420), 2)
            unit = round(bench * mult * rng.uniform(0.99, 1.01), 2)
            q = rng.choice([1, 2])
            batch.append({"id": f"nov-{kind}-{seed}-{k}", "ordered_at": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "vendor_id": vendor, "sku": sku,
                          "category": cat, "quantity": q, "unit_price": unit, "total": round(unit * q, 2), "currency": "USD",
                          "benchmark_price": bench, "requested_by": rng.choice(["it.admin1@brightwave.example", "it.admin2@brightwave.example", "it.admin3@brightwave.example"])})
            types.append([kind])
    return batch, types


def eval_anomaly():
    bundle = joblib.load("models/anomaly_iforest.joblib")
    res = {}
    for label, extra in (("planted_types_only", None), ("with_novel_types", novel)):
        ys, types_all, naive, hand, iso, iso_s, naive_s = [], [], [], [], [], [], []
        for sd in data.TEST_SEEDS:
            batch, X, y, types = data.purchases_xy(sd, extra)
            raw = -bundle["model"].decision_function(X)
            sc = np.searchsorted(bundle["train_scores"], raw, side="right") / len(bundle["train_scores"])
            f = {k: X[:, i] for i, k in enumerate(A.FEATURES)}
            naive.append((f["ratio"] > A.NAIVE_RATIO_THRESHOLD).astype(int))
            hand.append(((f["ratio"] > 1.25) | (f["non_usd"] > 0) | (f["qty_z"] > 3) | (f["vendor_known"] == 0) | (f["burst_60m"] >= 4) | (f["duplicate_24h"] > 0)).astype(int))
            iso.append((sc >= bundle["tau"]).astype(int)); iso_s.append(sc); naive_s.append(f["ratio"])
            ys.append(y); types_all += types
        y_ = np.concatenate(ys)
        block = {"n_purchases": int(len(y_)), "n_anomalies": int(y_.sum()), "base_rate": round(float(y_.mean()), 3)}
        for name, pred in (("baseline_ratio_rule", naive), ("hand_written_rules", hand), ("isolation_forest", iso)):
            pr = np.concatenate(pred)
            m = prf(y_, pr)
            by = defaultdict(lambda: [0, 0])
            for p_, t in zip(pr, types_all):
                for k in t:
                    by[k][1] += 1; by[k][0] += int(p_)
            m["recall_by_type"] = {k: f"{a}/{b}" for k, (a, b) in sorted(by.items())}
            block[name] = m
        block["isolation_forest"]["auroc"] = round(float(roc_auc_score(y_, np.concatenate(iso_s))), 3)
        block["baseline_ratio_rule"]["auroc"] = round(float(roc_auc_score(y_, np.concatenate(naive_s))), 3)
        res[label] = block
    return res


# ------------------------------------------------------------------ price
def eval_price(trials=3000):
    rng = np.random.default_rng(0)
    skus = [1250, 1450, 1950, 230, 420, 240]
    err = defaultdict(lambda: defaultdict(list)); tp = fp = fn = 0
    for _ in range(trials):
        true = float(rng.choice(skus)) * rng.uniform(0.97, 1.03)
        n = int(rng.integers(3, 16))
        prices, is_out = [], []
        for _ in range(n):
            p = true * float(np.exp(rng.normal(0, 0.03))); o = False
            if rng.random() < 0.15:
                p *= rng.uniform(0.5, 0.7) if rng.random() < 0.5 else rng.uniform(1.6, 2.5); o = True
            prices.append(p); is_out.append(o)
        fair, flags = P.fair_price(prices)
        b = "n3-4" if n <= 4 else "n5-9" if n <= 9 else "n10-15"
        for bucket in (b, "all"):
            err[bucket]["mean"].append(abs(np.mean(prices) / true - 1) * 100)
            err[bucket]["median"].append(abs(float(np.median(prices)) / true - 1) * 100)
            err[bucket]["robust"].append(abs(fair / true - 1) * 100)
        if n >= 3:
            for f_, o in zip(flags, is_out):
                tp += f_ and o; fp += f_ and not o; fn += (not f_) and o
    out = {"trials": trials, "outlier_rate": 0.15}
    for b, d in err.items():
        out[b] = {k: {"median_abs_pct_error": round(float(np.median(v)), 2), "p90_abs_pct_error": round(float(np.percentile(v, 90)), 2)} for k, v in d.items()}
    out["outlier_detection"] = {"precision": round(tp / max(1, tp + fp), 3), "recall": round(tp / max(1, tp + fn), 3)}
    return out


def md(R):
    L = ["# ML service metrics (advisory endpoints)", "",
         "> **All numbers are on SYNTHETIC data from our own generator** (`ml/seedgen/generate.py`), on seeds the models never trained on.",
         "> Treat them as upper bounds. The generator creates cleanly separable classes, so a model can learn the generator's habits.", "",
         f"Seeds: train {data.TRAIN_SEEDS}, validation {data.VAL_SEEDS} (thresholds only), test {data.TEST_SEEDS}.", ""]
    for key, title in (("hr_feed_none", "no HR offboarding feed (honest default)"), ("hr_feed_all", "with an HR offboarding feed")):
        s = R["seat_idle"][key]
        L += [f"## /score/seat-idle: {title}", "", f"{s['n_seats']} seats, {s['n_should_prune']} should be pruned (pooled over test seeds).", "",
              "| method | precision | recall | F1 | false positives | recall: idle / drifting / offboarded |", "|---|---|---|---|---|---|"]
        for m in ("baseline_30_day_rule", "logistic_regression", "gradient_boosting"):
            x = s[m]; rc = x["recall_by_class"]
            L.append(f"| {m} | {x['precision']} | {x['recall']} | {x['f1']} | {x['fp']} ({x['false_positives_by_class']}) | {rc['idle']} / {rc['drifting']} / {rc['offboarded']} |")
        L.append("")
    for key, title in (("planted_types_only", "planted anomaly types only"), ("with_novel_types", "plus two NOVEL types the rules were not written for")):
        a = R["anomaly"][key]
        L += [f"## /score/anomaly: {title}", "", f"{a['n_purchases']} purchases, {a['n_anomalies']} anomalies (**base rate {a['base_rate']:.0%}**, far above real life, so precision is flattered).", "",
              "| method | precision | recall | F1 | AUROC | recall by type |", "|---|---|---|---|---|---|"]
        for m in ("baseline_ratio_rule", "hand_written_rules", "isolation_forest"):
            x = a[m]
            L.append(f"| {m} | {x['precision']} | {x['recall']} | {x['f1']} | {x.get('auroc', '-')} | {', '.join(f'{k} {v}' for k, v in x['recall_by_type'].items())} |")
        L.append("")
    p = R["price"]
    L += ["## /score/price (simulated offers, 15% contaminated with bait/gouge prices)", "", f"{p['trials']} trials. Error is vs the true market price.", "",
          "| offers | method | median abs % error | p90 abs % error |", "|---|---|---|---|"]
    for b in ("n3-4", "n5-9", "n10-15", "all"):
        for m in ("mean", "median", "robust"):
            e = p[b][m]; L.append(f"| {b} | {m} | {e['median_abs_pct_error']} | {e['p90_abs_pct_error']} |")
    L += ["", f"Outlier detection (robust method): precision {p['outlier_detection']['precision']}, recall {p['outlier_detection']['recall']}.", "",
          "## /forecast/replacement", "", "Deterministic calendar projection. No model, no accuracy claim (no failure data exists).", ""]
    return "\n".join(L)


if __name__ == "__main__":
    R = {"seat_idle": eval_seats(), "anomaly": eval_anomaly(), "price": eval_price()}
    json.dump(R, open("metrics.json", "w"), indent=2, default=str)
    open("metrics.md", "w").write(md(R))
    print(md(R))
