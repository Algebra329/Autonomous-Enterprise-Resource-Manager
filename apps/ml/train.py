#!/usr/bin/env python3
"""Trains the two models and saves them to models/. Run:  python train.py
Seat model: gradient boosting (supervised, labels from the generator).
Anomaly model: isolation forest (unsupervised; labels used ONLY to choose the threshold on validation seeds).
"""
import json
from datetime import date

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier, IsolationForest

import data
from core import seats as S

VERSION = "v1"


def seat_threshold(y, p, min_precision=0.95):
    """Best-F1 threshold on a coarse grid (precision must stay >= min_precision); ties go to the value nearest 0.5.
    A grid avoids letting one stray example pin the threshold (an earlier 'max recall' rule gave 0.0009)."""
    best = None
    for t in np.arange(0.05, 0.96, 0.05):
        pred = p >= t
        tp = int((pred & (y == 1)).sum())
        prec = tp / max(1, int(pred.sum()))
        rec = tp / max(1, int((y == 1).sum()))
        f1 = 2 * prec * rec / max(prec + rec, 1e-9)
        if prec >= min_precision:
            key = (round(f1, 4), -abs(t - 0.5))
            if best is None or key > best[0]:
                best = (key, float(t))
    return best[1] if best else 0.5


def main():
    # ---- seat model --------------------------------------------------------------------
    Xs, ys = [], []
    for s in data.TRAIN_SEEDS:
        f, y, _ = data.seats_xy(s, "mixed")
        Xs.append(S.matrix(f)); ys.append(y)
    X, y = np.vstack(Xs), np.concatenate(ys)
    gbm = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.08, max_depth=4, random_state=0).fit(X, y)
    vf, vy = [], []
    for s in data.VAL_SEEDS:
        f, yy, _ = data.seats_xy(s, "none")          # threshold chosen under the honest default: no HR feed
        vf += f; vy.append(yy)
    tau_seat = seat_threshold(np.concatenate(vy), gbm.predict_proba(S.matrix(vf))[:, 1])
    joblib.dump({"model": gbm, "tau": tau_seat, "version": f"seat-gbm-{VERSION}", "features": S.FEATURES}, "models/seat_gbm.joblib")

    # ---- anomaly model -----------------------------------------------------------------
    Xp = np.vstack([data.purchases_xy(s)[1] for s in data.TRAIN_SEEDS])
    iso = IsolationForest(n_estimators=300, contamination="auto", random_state=0).fit(Xp)
    train_scores = np.sort(-iso.decision_function(Xp))
    vs, vyy = [], []
    for s in data.VAL_SEEDS:
        _, Xv, yv, _ = data.purchases_xy(s)
        vs.append(-iso.decision_function(Xv)); vyy.append(yv)
    vs, vyy = np.concatenate(vs), np.concatenate(vyy)
    ecdf = np.searchsorted(train_scores, vs, side="right") / len(train_scores)
    best = max(((2 * ((ecdf >= t) & (vyy == 1)).sum()) / max(1, (ecdf >= t).sum() + (vyy == 1).sum()), t) for t in np.linspace(0.5, 0.99, 50))
    tau_an = float(best[1])
    joblib.dump({"model": iso, "tau": tau_an, "train_scores": train_scores, "version": f"anomaly-iforest-{VERSION}", "features": data.A.FEATURES}, "models/anomaly_iforest.joblib")

    meta = {"version": VERSION, "trained": date.today().isoformat(), "train_seeds": data.TRAIN_SEEDS, "val_seeds": data.VAL_SEEDS,
            "test_seeds": data.TEST_SEEDS, "seat_threshold": tau_seat, "anomaly_threshold": tau_an,
            "n_seat_train_rows": int(len(y)), "note": "synthetic data from ml/seedgen/generate.py; thresholds chosen on validation seeds only"}
    json.dump(meta, open("models/meta.json", "w"), indent=2)
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
