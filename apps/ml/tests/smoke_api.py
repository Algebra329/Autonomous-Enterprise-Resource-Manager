#!/usr/bin/env python3
"""Hits every FastAPI route in-process. Needs: fastapi, httpx. Exits 3 (SKIP) if they are not installed.
Run from apps/ml:  python -m tests.smoke_api"""
import json, os, sys

try:
    from fastapi.testclient import TestClient
except Exception as e:
    print(f"SKIP: fastapi/httpx not installed ({e}). Run: pip install fastapi httpx uvicorn pydantic")
    sys.exit(3)

import data
from main import app

c = TestClient(app)
ex = json.load(open("contract_examples.json"))
d = data.G.build(data.AS_OF.date(), data.G.SEED)
asof = data.AS_OF.isoformat()

assert c.get("/health").json()["status"] == "ok"
r = c.post("/score/price", json=ex["POST /score/price"]["request"]); assert r.status_code == 200 and r.json()["advisory"], r.text
r = c.post("/score/seat-idle", json=ex["POST /score/seat-idle"]["request"]); assert r.status_code == 200 and r.json()["results"], r.text
r = c.post("/score/anomaly", json={"purchases": d["history-90d.json"]}); assert r.status_code == 200 and r.json()["method"] == "isolation_forest", r.text
r = c.post("/forecast/replacement", json={"assets": d["assets.json"][:50], "as_of": asof}); assert r.status_code == 200 and r.json()["buckets"], r.text
r = c.post("/score/price", json={"offers": [{"price": 1}] * 501}); assert r.status_code == 422, r.status_code
r = c.post("/score/price", json={"offers": [{"price": 5}], "force_fallback": True}); assert r.json()["is_fallback"] is True
os.environ["SERVICE_TOKEN"] = "t0ken"
assert c.post("/score/price", json={"offers": []}).status_code == 401
assert c.post("/score/price", json={"offers": []}, headers={"Authorization": "Bearer t0ken"}).status_code == 200
assert c.get("/health").status_code == 200   # health stays open
print("API smoke test OK: all routes, 422 on oversize, fallback flag, token auth")
