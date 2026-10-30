"""FastAPI wrapper (advisory ML service). Run:  uvicorn main:app --host 0.0.0.0 --port $PORT
 First todo on your machine: run it and hit /health.
Auth: if SERVICE_TOKEN is set, every route except /health requires 'Authorization: Bearer <token>'."""
import os
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from core import handlers

app = FastAPI(title="Resource Manager ML (advisory only)", version=handlers.SERVICE_VERSION)


def auth(authorization: Optional[str] = Header(default=None)):
    token = os.environ.get("SERVICE_TOKEN")
    if token and authorization != f"Bearer {token}":
        raise HTTPException(401, "missing or wrong service token")


class PriceReq(BaseModel):
    offers: list[dict[str, Any]]
    candidate_price: Optional[float] = None
    threshold_pct: float = 10
    force_fallback: bool = False


class SeatReq(BaseModel):
    seats: list[dict[str, Any]]
    as_of: Optional[str] = None
    threshold_days: int = 30
    force_fallback: bool = False


class AnomalyReq(BaseModel):
    purchases: list[dict[str, Any]]
    approved_vendors: Optional[list[str]] = None
    force_fallback: bool = False


class ForecastReq(BaseModel):
    assets: list[dict[str, Any]]
    as_of: Optional[str] = None
    unit_prices: dict[str, float] = Field(default_factory=dict)


def run(fn, body):
    try:
        return fn(body.model_dump())
    except handlers.InputError as e:
        raise HTTPException(422, str(e))


@app.get("/health")
def health():
    return handlers.health()


@app.post("/score/price", dependencies=[Depends(auth)])
def score_price(body: PriceReq):
    return run(handlers.handle_price, body)


@app.post("/score/seat-idle", dependencies=[Depends(auth)])
def score_seat_idle(body: SeatReq):
    return run(handlers.handle_seats, body)


@app.post("/score/anomaly", dependencies=[Depends(auth)])
def score_anomaly(body: AnomalyReq):
    return run(handlers.handle_anomaly, body)


@app.post("/forecast/replacement", dependencies=[Depends(auth)])
def forecast_replacement(body: ForecastReq):
    return run(handlers.handle_forecast, body)
