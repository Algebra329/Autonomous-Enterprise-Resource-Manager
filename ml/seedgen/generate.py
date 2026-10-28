#!/usr/bin/env python3
"""
Seed data generator (task C3) for the Autonomous Enterprise Resource Manager.

Writes, into ../../seed/ by default:
  assets.json        devices the agent scans for replacement      (DB: assets)
  saas.json          SaaS subscriptions                           (DB: saas_subscriptions)
  seats.json         per-user seats + usage                       (DB: seats)
  history-90d.json   last 90 days of human purchases              (backtest, anomaly eval)
  catalog.json       SKUs + reference market price                (fallback benchmark)
  vendors.json       vendor A/B price + negotiation behaviour     (vendor-kit price lists)
  ground_truth.json  hidden labels used ONLY for evaluation       (never given to the agent)

Design rules (the "why" is in the chat walkthrough):
  1. Deterministic: same seed + same as-of date => byte-identical files.
  2. Independent random streams per file, so editing one generator does not
     silently reshuffle the others.
  3. Labels live in ground_truth.json, never inside the files the system reads.
     Otherwise our metrics would be measuring leakage, not skill.
  4. All dates are relative to an AS_OF date, so the demo can be re-anchored.

Usage:
  python generate.py                      # write ../../seed/
  python generate.py --out some/dir
  python generate.py --as-of 2026-11-01
  python generate.py --verify             # regenerate in memory, compare to disk
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SEED = 20261028
AS_OF_DEFAULT = "2026-10-28"
NS = uuid.UUID("6f1c2a52-0000-4000-8000-000000000001")  # fixed => stable ids
COMPANY_DOMAIN = "brightwave.example"
IDLE_THRESHOLD_DAYS = 30  # default used by the naive baseline; policy can override

# --------------------------------------------------------------------------- #
# Reference data
# --------------------------------------------------------------------------- #

CATALOG = [
    {"sku": "LAP-13", "name": "UltraLight 13 Laptop", "category": "laptops", "market_price": 1250.00},
    {"sku": "LAP-14", "name": "Business 14 Laptop", "category": "laptops", "market_price": 1450.00},
    {"sku": "LAP-16", "name": "Performance 16 Laptop", "category": "laptops", "market_price": 1950.00},
    {"sku": "MON-24", "name": "24in FHD Monitor", "category": "monitors", "market_price": 230.00},
    {"sku": "MON-27", "name": "27in 4K Monitor", "category": "monitors", "market_price": 420.00},
    {"sku": "DOCK-TB", "name": "Thunderbolt Dock", "category": "accessories", "market_price": 240.00},
]
CAT_BY_SKU = {c["sku"]: c for c in CATALOG}

# Two vendors with deliberately different behaviour so negotiation is interesting.
VENDORS = {
    "vendor_a": {
        "display_name": "Apex Tech Supply",
        "style": "premium list price, flexible when countered",
        "list_multiplier": {"laptops": 1.10, "monitors": 1.04, "accessories": 1.06},
        "floor_multiplier": {"laptops": 1.00, "monitors": 0.98, "accessories": 1.00},
        "concession_rate": 0.40,   # moves 40% of the gap toward the buyer's counter each round
        "max_rounds": 3,
        "skus": ["LAP-13", "LAP-14", "LAP-16", "MON-24", "MON-27", "DOCK-TB"],
    },
    "vendor_b": {
        "display_name": "ValueByte Direct",
        "style": "competitive list price, stubborn",
        "list_multiplier": {"laptops": 1.02, "monitors": 0.95, "accessories": 0.97},
        "floor_multiplier": {"laptops": 1.00, "monitors": 0.94, "accessories": 0.96},
        "concession_rate": 0.10,
        "max_rounds": 3,
        "skus": ["LAP-13", "LAP-14", "MON-24", "MON-27", "DOCK-TB"],  # no LAP-16 in stock
    },
}

FIRST = ["Ada", "Tunde", "Chioma", "Liam", "Maya", "Noah", "Amara", "Ethan", "Zara", "Omar",
         "Sofia", "Kwame", "Lena", "Ravi", "Ife", "Mateo", "Hana", "Sam", "Nia", "Jonas",
         "Priya", "Diego", "Yusuf", "Elena", "Kofi", "Anika", "Leo", "Fatima", "Ben", "Chen",
         "Ngozi", "Tariq", "Mila", "Arjun", "Bola", "Isla", "Emeka", "Ruth", "Hugo", "Sade"]
LAST = ["Okafor", "Smith", "Adeyemi", "Garcia", "Khan", "Nguyen", "Johnson", "Bello", "Silva", "Kim",
        "Mensah", "Brown", "Patel", "Ibrahim", "Rossi", "Chukwu", "Walker", "Tanaka", "Ali", "Moore",
        "Eze", "Lopez", "Singh", "Park", "Davies", "Abiola", "Costa", "Wright", "Nwosu", "Hill",
        "Balogun", "Young", "Haddad", "Obi", "Clark", "Yilmaz", "Afolabi", "Reid", "Dang", "Sanni"]
DEPTS = [("Engineering", 40), ("Support", 25), ("Sales", 30), ("Marketing", 15),
         ("Operations", 15), ("Finance", 10), ("Design", 8), ("HR", 7)]  # = 150
N_OFFBOARDED = 8

# app, per-seat price, dept->coverage, idle rate, periodic rate, sold via PayPal sandbox?
ALL = {d: 0.95 for d, _ in DEPTS}
APPS = [
    dict(app="TeamChat Pro", price=8.75, cover=ALL, idle=0.06, periodic=0.00, paypal=False),
    dict(app="DocuHub", price=12.00, cover={d: 0.90 for d, _ in DEPTS}, idle=0.10, periodic=0.01, paypal=False),
    dict(app="DesignForge", price=45.00, cover={"Design": 1.0, "Marketing": 0.8, "Engineering": 0.15}, idle=0.30, periodic=0.02, paypal=True),
    dict(app="CodeVault", price=21.00, cover={"Engineering": 1.0, "Operations": 0.2}, idle=0.14, periodic=0.01, paypal=True),
    dict(app="DealPilot CRM", price=75.00, cover={"Sales": 1.0, "Marketing": 0.3, "Support": 0.2}, idle=0.20, periodic=0.05, paypal=True),
    dict(app="SupportDesk", price=55.00, cover={"Support": 1.0, "Operations": 0.3}, idle=0.10, periodic=0.01, paypal=False),
    dict(app="InsightBoard BI", price=30.00, cover={"Finance": 1.0, "Operations": 0.6, "Sales": 0.3, "Engineering": 0.1}, idle=0.30, periodic=0.08, paypal=True),
    dict(app="VideoMeet", price=15.00, cover={d: 0.85 for d, _ in DEPTS}, idle=0.10, periodic=0.00, paypal=False),
    dict(app="PlanTrack", price=10.00, cover={"Engineering": 0.8, "Operations": 0.7, "Marketing": 0.6, "Design": 0.5}, idle=0.14, periodic=0.01, paypal=False),
    dict(app="SignFlow", price=25.00, cover={"Sales": 0.5, "Finance": 0.8, "HR": 0.9, "Operations": 0.2}, idle=0.25, periodic=0.08, paypal=True),
    dict(app="MailBlast", price=40.00, cover={"Marketing": 1.0, "Sales": 0.25}, idle=0.24, periodic=0.02, paypal=True),
    dict(app="TimeKeep", price=6.00, cover={d: 0.70 for d, _ in DEPTS}, idle=0.14, periodic=0.00, paypal=False),
]
P_DRIFT = 0.05
P_CASUAL = 0.18


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def uid(kind: str, key: str) -> str:
    return str(uuid.uuid5(NS, f"{kind}:{key}"))


def stream(name: str, seed: int) -> random.Random:
    """Independent, deterministic RNG per dataset (string seeds are stable in CPython)."""
    return random.Random(f"{seed}:{name}")


def r2(x: float) -> float:
    return round(x + 0.0, 2)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def weighted(rng: random.Random, pairs):
    total = sum(w for _, w in pairs)
    x = rng.random() * total
    for item, w in pairs:
        x -= w
        if x <= 0:
            return item
    return pairs[-1][0]


# --------------------------------------------------------------------------- #
# People
# --------------------------------------------------------------------------- #

def make_people(rng: random.Random):
    used, people = set(), []

    def new_person(dept):
        while True:
            f, l = rng.choice(FIRST), rng.choice(LAST)
            email = f"{f}.{l}@{COMPANY_DOMAIN}".lower()
            if email not in used:
                used.add(email)
                return {"name": f"{f} {l}", "email": email, "department": dept}

    for dept, n in DEPTS:
        for _ in range(n):
            people.append(new_person(dept))
    offboarded = []
    for _ in range(N_OFFBOARDED):
        p = new_person(weighted(rng, DEPTS))
        p["offboarded_days_ago"] = rng.randint(20, 150)
        offboarded.append(p)
    return people, offboarded


# --------------------------------------------------------------------------- #
# Assets
# --------------------------------------------------------------------------- #

def months_to_date(as_of: date, months: float) -> date:
    return as_of - timedelta(days=int(round(months * 30.44)))


def make_assets(rng: random.Random, as_of: date, people):
    assets, truth = [], {}
    tag = 0

    def add(person, sku, category, replace_after, bucket):
        nonlocal tag
        tag += 1
        if bucket == "overdue":
            age = replace_after + rng.uniform(1, 14)
        elif bucket == "borderline":
            age = replace_after - rng.uniform(0.2, 3.0)
        else:
            age = rng.uniform(1, replace_after - 3.5)
        purchased = months_to_date(as_of, age)
        item = CAT_BY_SKU[sku]
        aid = uid("asset", f"A-{tag:04d}")
        status = "in_repair" if (category == "laptops" and bucket == "overdue" and rng.random() < 0.15) else "active"
        assets.append({
            "id": aid,
            "asset_tag": f"A-{tag:04d}",
            "name": f"{item['name']} ({person['name']})",
            "category": category,
            "sku": sku,
            "purchased_at": purchased.isoformat(),
            "replace_after_months": replace_after,
            "status": status,
            "assigned_to": person["email"],
            "purchase_price": r2(item["market_price"] * rng.uniform(0.85, 1.12)),
        })
        months_old = (as_of - purchased).days / 30.44
        truth[aid] = {"bucket": bucket, "age_months": round(months_old, 1),
                      "due_for_replacement": months_old >= replace_after}

    for p in people:
        creative = p["department"] in ("Engineering", "Design")
        sku = weighted(rng, [("LAP-16", 40), ("LAP-14", 50), ("LAP-13", 10)] if creative
                       else [("LAP-14", 50), ("LAP-13", 40), ("LAP-16", 10)])
        add(p, sku, "laptops", 36, weighted(rng, [("overdue", 16), ("borderline", 12), ("fine", 72)]))
        for _ in range(2 if rng.random() < 0.4 else 1):
            add(p, rng.choice(["MON-24", "MON-27"]), "monitors", 60,
                weighted(rng, [("overdue", 10), ("borderline", 8), ("fine", 82)]))
    return assets, truth


# --------------------------------------------------------------------------- #
# SaaS + seats
# --------------------------------------------------------------------------- #

def weekly_sessions(rng, cls: str, days: int):
    """13 weekly session counts, oldest -> newest. Zero after the last-active week."""
    ws = days // 7
    out = []
    period = rng.choice([4, 5, 6])
    for w in range(13):
        ago = 12 - w
        if ago < ws:
            out.append(0)
        elif ago == ws:
            out.append(1 if cls in ("active", "casual", "drifting", "idle", "offboarded") else rng.randint(2, 5))
        elif cls == "active":
            out.append(rng.randint(2, 5))
        elif cls == "casual":
            out.append(rng.choice([0, 1, 1, 2, 3]))
        elif cls in ("drifting", "idle", "offboarded"):
            out.append(rng.randint(2, 4) if ago > ws + 3 else rng.randint(0, 2))
        elif cls == "periodic":
            out.append(rng.randint(2, 5) if (ago - ws) % period == 0 else 0)
        else:
            out.append(0)
    return out


def make_saas_and_seats(rng, as_of: date, people, offboarded):
    now = datetime(as_of.year, as_of.month, as_of.day, 12, 0, tzinfo=timezone.utc)
    subs, seats, truth = [], [], {}
    vendor_cycle = ["vendor_a", "vendor_b"]

    def seat(sub_id, app_name, email, cls, days):
        sid = uid("seat", f"{app_name}:{email}")
        last = now - timedelta(days=days, hours=rng.randint(0, 10))
        seats.append({
            "id": sid, "subscription_id": sub_id, "user_email": email,
            "last_active_at": iso(last),
            "weekly_sessions_13w": weekly_sessions(rng, cls, days),
        })
        truth[sid] = {"class": cls, "days_since_active": days,
                      "should_prune": cls in ("idle", "drifting", "offboarded"),
                      "offboarded": cls == "offboarded"}

    for i, a in enumerate(APPS):
        sub_id = uid("sub", a["app"])
        members = []
        for p in people:
            if rng.random() < a["cover"].get(p["department"], 0.0):
                r = rng.random()
                if r < a["idle"]:
                    cls, days = "idle", min(240, int(45 + rng.expovariate(1 / 50)))
                elif r < a["idle"] + P_DRIFT:
                    cls, days = "drifting", rng.randint(28, 44)
                elif r < a["idle"] + P_DRIFT + a["periodic"]:
                    cls, days = "periodic", rng.randint(30, 60)
                elif r < a["idle"] + P_DRIFT + a["periodic"] + P_CASUAL:
                    cls, days = "casual", rng.randint(8, 27)
                else:
                    cls, days = "active", rng.randint(0, 7)
                members.append((p["email"], cls, days))
        for p in offboarded:
            if rng.random() < 0.6:
                members.append((p["email"], "offboarded", p["offboarded_days_ago"] + rng.randint(0, 5)))
        for email, cls, days in members:
            seat(sub_id, a["app"], email, cls, days)
        subs.append({
            "id": sub_id, "app": a["app"], "vendor_id": vendor_cycle[i % 2],
            "paypal_enabled": a["paypal"],
            "paypal_subscription_id": None,   # filled by SWE's sandbox seed script (task A2)
            "seat_price": a["price"], "seat_count": len(members),
            "monthly_cost": r2(a["price"] * len(members)), "status": "active",
        })
    return subs, seats, truth


# --------------------------------------------------------------------------- #
# 90-day purchase history with injected anomalies
# --------------------------------------------------------------------------- #

def benchmark_at(sku: str, t_frac: float, rng) -> float:
    """Market price with slow drift + noise. t_frac in [0,1] across the 90 days."""
    base = CAT_BY_SKU[sku]["market_price"]
    phase = (sum(map(ord, sku)) % 10) / 10 * 2 * math.pi
    return r2(base * (1 + 0.02 * math.sin(2 * math.pi * t_frac + phase) + rng.gauss(0, 0.008)))


def make_history(rng, as_of: date):
    end = datetime(as_of.year, as_of.month, as_of.day, 17, 0, tzinfo=timezone.utc)
    start = end - timedelta(days=90)
    requesters = [f"it.admin{n}@{COMPANY_DOMAIN}" for n in (1, 2, 3)]
    rows, truth = [], {}
    n = 0

    def business_time():
        while True:
            t = start + timedelta(seconds=rng.randint(0, 90 * 86400))
            if t.weekday() < 5 and 9 <= t.hour < 17:
                return t.replace(minute=rng.randint(0, 59), second=rng.randint(0, 59))

    def push(t, vendor, sku, qty, unit, currency="USD", requester=None, labels=None, bench=None):
        nonlocal n
        n += 1
        pid = uid("purchase", f"P-{n:04d}")
        item = CAT_BY_SKU[sku]
        frac = (t - start).total_seconds() / (90 * 86400)
        b = bench if bench is not None else benchmark_at(sku, frac, rng)
        unit = r2(unit)  # round FIRST so total == unit_price * quantity exactly (cart hashes depend on it)
        rows.append({
            "id": pid, "ordered_at": iso(t), "vendor_id": vendor, "sku": sku,
            "category": item["category"], "quantity": qty, "unit_price": unit,
            "total": r2(unit * qty), "currency": currency,
            "benchmark_price": b, "benchmark_currency": "USD",
            "requested_by": requester or rng.choice(requesters), "channel": "manual",
        })
        truth[pid] = {"anomaly": bool(labels), "types": labels or []}
        return pid

    sku_w = [("LAP-14", 28), ("LAP-13", 12), ("LAP-16", 8), ("MON-24", 18), ("MON-27", 18), ("DOCK-TB", 16)]

    def qty_for(sku):
        if sku.startswith("LAP"):
            return rng.choice([1, 1, 1, 2, 2, 3])
        if sku.startswith("MON"):
            return rng.choice([1, 2, 2, 3, 4, 6])
        return rng.choice([1, 2, 3, 4])

    # --- normal human purchasing: habitually picks the pricier vendor ----------
    normal = []
    for _ in range(80):
        t = business_time()
        sku = weighted(rng, sku_w)
        vendor = "vendor_a" if (rng.random() < 0.65 or sku == "LAP-16") else "vendor_b"
        cat = CAT_BY_SKU[sku]["category"]
        frac = (t - start).total_seconds() / (90 * 86400)
        bench = benchmark_at(sku, frac, rng)
        unit = bench * VENDORS[vendor]["list_multiplier"][cat] * math.exp(rng.gauss(0, 0.03))
        normal.append(push(t, vendor, sku, qty_for(sku), unit, bench=bench))

    # --- injected anomalies ----------------------------------------------------
    for _ in range(4):  # price inflation: 28-60% above market
        t, sku = business_time(), weighted(rng, sku_w)
        vendor = rng.choice(["vendor_a", "vendor_b"])
        frac = (t - start).total_seconds() / (90 * 86400)
        bench = benchmark_at(sku, frac, rng)
        push(t, vendor, sku, qty_for(sku), bench * rng.uniform(1.28, 1.60), bench=bench, labels=["price_inflation"])

    for sku, q in (("MON-24", rng.randint(18, 25)), ("LAP-14", rng.randint(11, 14))):  # quantity outliers
        push(business_time(), "vendor_a", sku, q, CAT_BY_SKU[sku]["market_price"] * 1.05, labels=["quantity_outlier"])

    # velocity burst / cap structuring: 6 single-unit orders in <45 minutes
    while True:
        t0 = business_time()
        if t0.hour < 15:
            break
    who = requesters[0]
    for k in range(6):
        push(t0 + timedelta(minutes=k * rng.randint(4, 8)), "vendor_a", "LAP-14", 1,
             CAT_BY_SKU["LAP-14"]["market_price"] * 1.08, requester=who,
             labels=["velocity_burst", "cap_structuring"])

    push(business_time(), "vendor_x_unvetted", "LAP-16", 3, CAT_BY_SKU["LAP-16"]["market_price"] * 0.62,
         labels=["first_time_vendor", "too_good_to_be_true"])

    cad_t = business_time()  # currency mismatch: CAD amount against a USD benchmark
    push(cad_t, "vendor_b", "LAP-14", 1, CAT_BY_SKU["LAP-14"]["market_price"] * 1.37, currency="CAD",
         labels=["currency_mismatch"])

    # duplicate order: same vendor/sku/qty a few hours after a normal one
    src = next(r for r in rows if r["id"] == normal[10])
    dup_t = datetime.strptime(src["ordered_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) + timedelta(hours=3)
    push(dup_t, src["vendor_id"], src["sku"], src["quantity"], src["unit_price"], requester=src["requested_by"],
         bench=src["benchmark_price"], labels=["duplicate_order"])

    rows.sort(key=lambda r: r["ordered_at"])
    return rows, truth


# --------------------------------------------------------------------------- #
# Assemble, validate, write
# --------------------------------------------------------------------------- #

def build(as_of: date, seed: int = SEED) -> dict:
    people, offboarded = make_people(stream("people", seed))
    assets, a_truth = make_assets(stream("assets", seed), as_of, people)
    subs, seats, s_truth = make_saas_and_seats(stream("seats", seed), as_of, people, offboarded)
    history, h_truth = make_history(stream("history", seed), as_of)
    return {
        "assets.json": assets,
        "saas.json": subs,
        "seats.json": seats,
        "history-90d.json": history,
        "catalog.json": CATALOG,
        "vendors.json": VENDORS,
        "ground_truth.json": {
            "_note": "EVALUATION ONLY. Never load into the agent, API or dashboard.",
            "as_of": as_of.isoformat(), "seed": seed, "idle_threshold_days_baseline": IDLE_THRESHOLD_DAYS,
            "assets": a_truth, "seats": s_truth, "history": h_truth,
        },
    }


def validate(d: dict) -> None:
    sub_ids = {s["id"] for s in d["saas.json"]}
    assert all(s["subscription_id"] in sub_ids for s in d["seats.json"]), "orphan seat"
    assert len({s["id"] for s in d["seats.json"]}) == len(d["seats.json"]), "duplicate seat id"
    for s in d["saas.json"]:
        n = sum(1 for x in d["seats.json"] if x["subscription_id"] == s["id"])
        assert n == s["seat_count"], f"seat_count mismatch {s['app']}"
    skus = set(CAT_BY_SKU)
    assert all(a["sku"] in skus for a in d["assets.json"]), "asset sku not in catalog"
    assert all(h["sku"] in skus for h in d["history-90d.json"]), "history sku not in catalog"
    assert sum(1 for s in d["saas.json"] if s["paypal_enabled"]) == 6, "expected 6 PayPal-enabled subs"
    gt = d["ground_truth.json"]
    assert set(gt["assets"]) == {a["id"] for a in d["assets.json"]}
    assert set(gt["seats"]) == {s["id"] for s in d["seats.json"]}
    assert set(gt["history"]) == {h["id"] for h in d["history-90d.json"]}
    for h in d["history-90d.json"]:
        assert abs(h["total"] - h["unit_price"] * h["quantity"]) < 0.02, "total mismatch"


def dump(obj) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def summary(d: dict) -> str:
    gt = d["ground_truth.json"]
    a = gt["assets"].values()
    s = gt["seats"].values()
    h = gt["history"].values()
    from collections import Counter
    lines = [
        f"assets: {len(d['assets.json'])} | due for replacement: {sum(x['due_for_replacement'] for x in a)}",
        f"saas apps: {len(d['saas.json'])} | seats: {len(d['seats.json'])} | "
        f"monthly cost: ${sum(x['monthly_cost'] for x in d['saas.json']):,.2f}",
        f"seat classes: {dict(Counter(x['class'] for x in s))}",
        f"naive {IDLE_THRESHOLD_DAYS}-day rule flags {sum(x['days_since_active'] >= IDLE_THRESHOLD_DAYS for x in s)} seats; "
        f"truly prunable: {sum(x['should_prune'] for x in s)}",
        f"history: {len(d['history-90d.json'])} purchases | anomalies: {sum(x['anomaly'] for x in h)} "
        f"({sum(x['anomaly'] for x in h) / len(d['history-90d.json']):.0%} base rate)",
        f"anomaly types: {dict(Counter(t for x in h for t in x['types']))}",
    ]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "seed"))
    ap.add_argument("--as-of", default=AS_OF_DEFAULT)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--verify", action="store_true", help="compare in-memory build to files on disk")
    args = ap.parse_args()

    as_of = date.fromisoformat(args.as_of)
    data = build(as_of, args.seed)
    validate(data)
    out = Path(args.out)

    if args.verify:
        bad = [n for n, obj in data.items() if not (out / n).exists() or (out / n).read_text() != dump(obj)]
        print("VERIFY FAILED: " + ", ".join(bad) if bad else "VERIFY OK: files match the generator output")
        return 1 if bad else 0

    out.mkdir(parents=True, exist_ok=True)
    for name, obj in data.items():
        text = dump(obj)
        (out / name).write_text(text)
        print(f"{name:20s} {len(text):>9,d} bytes  sha256={hashlib.sha256(text.encode()).hexdigest()[:12]}")
    print("\n" + summary(data))
    return 0


if __name__ == "__main__":
    sys.exit(main())
