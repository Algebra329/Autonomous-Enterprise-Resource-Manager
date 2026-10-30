"""/score/seat-idle: is this paid seat unused? Features + reasons. Model is trained in train.py.

Why features beyond "days since last login": an infrequent-but-regular user (finance running
month-end reports) looks idle to a 30-day rule but is not. The rhythm of usage over 13 weeks
(gap regularity, how overdue the next burst is) is what separates them.
"""
import numpy as np

from .common import InputError, MAX_SEATS, need, parse_ts

FEATURES = ["days_since", "mean13", "recent4", "prior9", "drop", "trailing_zeros", "nz_weeks",
            "gap_mean", "gap_cv", "overdue_ratio", "hr_known", "offboarded"]


def _weekly(seat):
    w = [float(x) for x in (seat.get("weekly_sessions_13w") or [])]
    return np.array(([0.0] * 13 + w)[-13:])


def seat_features(seat, as_of, hr=None):
    """hr: None = unknown, True/False = HR feed says offboarded / not."""
    w = _weekly(seat)
    days = max(0.0, (as_of - parse_ts(need(seat, "last_active_at", "seat"))).total_seconds() / 86400)
    nz = np.where(w > 0)[0]
    tz = 13 - (nz[-1] + 1) if len(nz) else 13
    if len(nz) >= 2:
        gaps = np.diff(nz).astype(float)
        gm = float(gaps.mean())
        gcv = float(gaps.std() / gm) if gm else 0.0
    else:
        gm, gcv = 13.0, 1.0
    recent4, prior9 = float(w[-4:].mean()), float(w[:9].mean())
    return {"days_since": days, "mean13": float(w.mean()), "recent4": recent4, "prior9": prior9,
            "drop": prior9 - recent4, "trailing_zeros": float(tz), "nz_weeks": float(len(nz)),
            "gap_mean": gm, "gap_cv": gcv, "overdue_ratio": tz / gm,
            "hr_known": 0.0 if hr is None else 1.0, "offboarded": 1.0 if hr else 0.0}


def matrix(feats):
    return np.array([[f[k] for k in FEATURES] for f in feats], float)


def explain(f, score, tau):
    if f["hr_known"] and f["offboarded"]:
        return "user is marked offboarded but the seat is still paid"
    if score >= tau:
        why = f"no activity for {int(f['days_since'])} days"
        if f["drop"] > 1:
            why += ", usage was already declining before that"
        if f["gap_cv"] < 0.3 and f["nz_weeks"] >= 3:
            why += f" (overdue versus their usual rhythm of about {round(f['gap_mean'])} weeks)"
        return why
    if f["nz_weeks"] >= 2 and f["gap_cv"] < 0.35 and 3 <= f["gap_mean"] <= 7 and f["days_since"] >= 28:
        return f"periodic usage (about every {round(f['gap_mean'])} weeks), probably still needed"
    return "recently active" if f["days_since"] < 30 else "intermittent usage, keep for now"


def baseline_score(f, threshold_days=30):
    d = f["days_since"]
    return min(1.0, d / (2.0 * threshold_days)), d >= threshold_days


def score_seats(payload, bundle, fallback=False):
    seats = need(payload, "seats", "seat-idle")
    if not isinstance(seats, list) or len(seats) > MAX_SEATS:
        raise InputError(f"seats must be a list of at most {MAX_SEATS}")
    as_of = parse_ts(payload["as_of"]) if payload.get("as_of") else __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    thr_days = int(payload.get("threshold_days", 30))
    feats = [seat_features(s, as_of, s.get("offboarded")) for s in seats]
    if fallback or bundle is None:
        res = []
        for s, f in zip(seats, feats):
            sc, flag = baseline_score(f, thr_days)
            res.append({"seat_id": s.get("seat_id") or s.get("id"), "idle_score": round(sc, 3), "suggest_prune": flag,
                        "reason": f"no activity for {int(f['days_since'])} days" if flag else "recently active"})
        return {"advisory": True, "method": f"baseline_{thr_days}_day_rule", "is_fallback": True, "results": res}
    p = bundle["model"].predict_proba(matrix(feats))[:, 1] if feats else []
    tau = bundle["tau"]
    res = [{"seat_id": s.get("seat_id") or s.get("id"), "idle_score": round(float(sc), 3), "suggest_prune": bool(sc >= tau),
            "reason": explain(f, sc, tau)} for s, f, sc in zip(seats, feats, p)]
    return {"advisory": True, "method": "gradient_boosting", "is_fallback": False, "model_version": bundle["version"],
            "threshold": round(float(tau), 3), "results": res}
