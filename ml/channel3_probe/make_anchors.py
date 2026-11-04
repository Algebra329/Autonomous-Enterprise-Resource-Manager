#!/usr/bin/env python3
"""Turns probe results into the demo's anchor products: writes ml/seedgen/anchors.json (real prices the generator uses)
and seed/benchmarks-fixture.json (the real offers BAI's fixture fallback serves). Offline: reads the saved raw responses.

    python ml/channel3_probe/make_anchors.py                       # default picks below
    python ml/channel3_probe/make_anchors.py --pick LAP-14=q04 LAP-16=q08 MON-24=q12 MON-27=q18 DOCK-TB=q22 --retire LAP-13
After running it: python ml/seedgen/generate.py && bash scripts/check_all.sh
"""
import argparse, json, sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import probe  # noqa: E402

ROOT = HERE.parents[1]
DEFAULT_PICKS = ["LAP-14=q04", "LAP-16=q08", "MON-24=q12", "MON-27=q18", "DOCK-TB=q22"]

ap = argparse.ArgumentParser()
ap.add_argument("--raw", default=str(HERE / "out" / "raw"))
ap.add_argument("--pick", nargs="*", default=DEFAULT_PICKS)
ap.add_argument("--retire", nargs="*", default=["LAP-13"])
a = ap.parse_args()

queries = {q["id"]: q for q in json.loads((HERE / "queries.json").read_text())["queries"]}
catalog = {c["sku"]: c for c in json.loads((ROOT / "seed" / "catalog.json").read_text())}
skus, items = {}, {}
for p in a.pick:
    sku, qid = p.split("=")
    q = queries[qid]
    assert q["sku"] == sku, f"{qid} is a probe for {q['sku']}, not {sku}"
    raw = HERE / "out" / "raw" / f"{qid}.json" if a.raw == str(HERE / "out" / "raw") else Path(a.raw) / f"{qid}.json"
    r = probe.analyse(q, json.loads(raw.read_text()), catalog)
    if not r["usable"]:
        sys.exit(f"{qid} ({sku}) is not usable (needs >= {probe.MIN_OFFERS} clean offers, has {r['n_offers_usable']}). Pick another query.")
    skus[sku] = {"name": r["product_title"], "market_price": round(r["median_price"], 2), "benchmark_query": q["query"],
                 "probe_query": qid, "n_offers": r["n_offers_usable"], "source": "channel3"}
    items[sku] = {"query": q["query"], "product_title": r["product_title"], "currency": "USD", "median_price": r["median_price"], "offers": r["offers"]}
    print(f"{sku:8s} {r['product_title'][:48]:48s} ${r['median_price']:>8,.2f}  ({r['n_offers_usable']} offers)")
today = date.today().isoformat()
(ROOT / "ml" / "seedgen" / "anchors.json").write_text(json.dumps({"as_of": today, "source": f"Channel3 probe {today}", "retired": a.retire, "skus": skus}, indent=2) + "\n")
(ROOT / "seed" / "benchmarks-fixture.json").write_text(json.dumps({"source": "channel3", "as_of": today, "items": items}, indent=2) + "\n")
print("wrote ml/seedgen/anchors.json and seed/benchmarks-fixture.json")
