"""Dict-in, dict-out handlers. main.py is a thin FastAPI wrapper around these, so they are testable without FastAPI.
If a model file cannot be loaded, the endpoint answers with the deterministic baseline and says so (is_fallback=true)."""
import os
from pathlib import Path

from . import anomaly, forecast, price, seats
from .common import InputError  # noqa: F401  (re-exported for main.py)

SERVICE_VERSION = "0.1.0"
MODELS_DIR = Path(os.environ.get("MODELS_DIR", Path(__file__).resolve().parents[1] / "models"))
_cache = {}


def _bundle(name):
    if name not in _cache:
        try:
            import joblib
            _cache[name] = joblib.load(MODELS_DIR / name)
        except Exception as e:  # missing file, version mismatch, corrupt pickle...
            _cache[name] = {"_error": f"{type(e).__name__}: {e}"[:200]}
    b = _cache[name]
    return None if "_error" in b else b


def _reason(name):
    b = _cache.get(name) or {}
    return b.get("_error")


def health():
    s, a = _bundle("seat_gbm.joblib"), _bundle("anomaly_iforest.joblib")
    return {"status": "ok", "service_version": SERVICE_VERSION,
            "models": {"seat_idle": s["version"] if s else None, "anomaly": a["version"] if a else None},
            "fallbacks_active": [n for n, b in (("seat_idle", s), ("anomaly", a)) if b is None]}


def handle_price(p):
    return price.score_price(p, fallback=bool(p.get("force_fallback")))


def handle_seats(p):
    b = _bundle("seat_gbm.joblib")
    r = seats.score_seats(p, b, fallback=bool(p.get("force_fallback")))
    if b is None:
        r["fallback_reason"] = _reason("seat_gbm.joblib") or "forced"
    return r


def handle_anomaly(p):
    b = _bundle("anomaly_iforest.joblib")
    r = anomaly.score_purchases(p, b, fallback=bool(p.get("force_fallback")))
    if b is None:
        r["fallback_reason"] = _reason("anomaly_iforest.joblib") or "forced"
    return r


def handle_forecast(p):
    return forecast.forecast(p)
