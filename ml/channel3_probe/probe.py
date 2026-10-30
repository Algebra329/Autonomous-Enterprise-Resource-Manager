#!/usr/bin/env python3
"""Channel3 coverage probe (task C2 / Spike 2).

Question answered: for the hardware our demo buys, does Channel3 return enough real priced
offers to act as a market benchmark?

  export CHANNEL3_API_KEY=...
  python probe.py                         # call the API, save raw responses, write the report
  python probe.py --from-raw out/raw      # re-analyse saved responses offline (no key needed)

Outputs (default ./out/):
  raw/qNN.json          untouched API responses (also our fixtures if coverage is weak)
  report.md             coverage table + recommendation
  summary.json          machine-readable numbers
  and  ../../seed/benchmarks-fixture.json   per-SKU offers for BAI's fallback (override with --fixtures)

Endpoint (Channel3 docs): POST https://api.trychannel3.com/v1/search, header x-api-key,
body {"query": "...", "limit": N}. Response: products[] each with offers[] (price, availability, url).
Standard library only.
"""
import argparse, json, os, statistics, sys, time, urllib.error, urllib.request
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
MIN_OFFERS = 3            # fair-price scoring needs several independent offers
PLAUSIBLE = (0.5, 2.0)    # real median / our catalog market_price
USABLE_CATEGORY = 0.6     # a category is demo-safe if >=60% of its queries are usable


def call(base, key, query, limit, retries=3):
    body = json.dumps({"query": query, "limit": limit}).encode()
    for n in range(retries + 1):
        req = urllib.request.Request(base.rstrip("/") + "/v1/search", body,
                                     {"Content-Type": "application/json", "x-api-key": key})
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read()), time.time() - t0
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                sys.exit(f"Auth failed ({e.code}). Check CHANNEL3_API_KEY and your plan.")
            if e.code == 429 or e.code >= 500:
                time.sleep(2 ** (n + 1))
                continue
            return {"_error": f"HTTP {e.code}: {e.read()[:200]!r}", "products": []}, time.time() - t0
        except Exception as e:
            time.sleep(2 ** n)
            err = str(e)
    return {"_error": err, "products": []}, 0.0


def offer_price(o):
    p = o.get("price")
    cur = o.get("currency")
    if isinstance(p, dict):
        cur = p.get("currency", cur)
        p = p.get("price", p.get("amount"))
    try:
        return (float(p) if p is not None else None), (cur or "USD")
    except (TypeError, ValueError):
        return None, cur


def merchant(o):
    for k in ("domain", "merchant", "merchant_name", "website", "retailer", "seller"):
        v = o.get(k)
        if isinstance(v, dict):
            v = v.get("domain") or v.get("name")
        if v:
            return str(v)
    host = urlparse(o.get("url") or "").netloc
    return host or "unknown"


def parse_offers(product):
    out = []
    for o in product.get("offers") or []:
        price, cur = offer_price(o)
        avail = str(o.get("availability") or "")
        out.append({"merchant": merchant(o), "price": price, "currency": cur,
                    "availability": avail or None,
                    "in_stock": (not avail) or ("instock" in avail.lower().replace("_", "").replace(" ", "")),
                    "url": o.get("url")})
    return out


def title(p):
    return str(p.get("title") or p.get("name") or "")


def analyse(q, resp, catalog):
    prods = resp.get("products") or []
    must = [m.lower() for m in q["must"]]
    cands = [p for p in prods if all(m in title(p).lower() for m in must)] if must else prods[:5]
    best, best_offers = None, []
    for p in cands:
        offs = [o for o in parse_offers(p) if o["price"] is not None and o["price"] > 0 and o["in_stock"] and o["currency"] == "USD"]
        if len(offs) > len(best_offers):
            best, best_offers = p, offs
    prices = [o["price"] for o in best_offers]
    med = statistics.median(prices) if prices else None
    cat = catalog.get(q["sku"], {}).get("market_price")
    ratio = (med / cat) if (med and cat) else None
    return {
        "id": q["id"], "sku": q["sku"], "category": q["category"], "query": q["query"],
        "error": resp.get("_error"), "n_products": len(prods), "n_matched": len(cands),
        "n_offers_usable": len(best_offers), "n_merchants": len({o["merchant"] for o in best_offers}),
        "median_price": med, "min_price": min(prices) if prices else None, "max_price": max(prices) if prices else None,
        "ratio_vs_catalog": ratio,
        "plausible": (PLAUSIBLE[0] <= ratio <= PLAUSIBLE[1]) if ratio else None,
        "usable": len(best_offers) >= MIN_OFFERS,
        "product_title": title(best) if best else None, "offers": best_offers,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="https://api.trychannel3.com")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--delay", type=float, default=0.5)
    ap.add_argument("--out", default=str(HERE / "out"))
    ap.add_argument("--from-raw", help="analyse saved responses instead of calling the API")
    ap.add_argument("--fixtures", default=str(HERE.parents[1] / "seed" / "benchmarks-fixture.json"))
    ap.add_argument("--catalog", default=str(HERE.parents[1] / "seed" / "catalog.json"))
    a = ap.parse_args()

    queries = json.loads((HERE / "queries.json").read_text())["queries"]
    catalog = {c["sku"]: c for c in json.loads(Path(a.catalog).read_text())} if Path(a.catalog).exists() else {}
    out = Path(a.out); raw = out / "raw"; raw.mkdir(parents=True, exist_ok=True)

    key = os.environ.get("CHANNEL3_API_KEY")
    if not a.from_raw and not key:
        sys.exit("Set CHANNEL3_API_KEY (or use --from-raw DIR to re-analyse saved responses).")

    rows, lat = [], []
    for q in queries:
        if a.from_raw:
            f = Path(a.from_raw) / f"{q['id']}.json"
            resp, dt = (json.loads(f.read_text()) if f.exists() else {"_error": "missing raw file", "products": []}), None
        else:
            resp, dt = call(a.base_url, key, q["query"], a.limit)
            (raw / f"{q['id']}.json").write_text(json.dumps(resp, indent=2))
            time.sleep(a.delay)
        if dt:
            lat.append(dt)
        r = analyse(q, resp, catalog)
        rows.append(r)
        print(f"{q['id']} {q['query'][:42]:42s} products={r['n_products']:2d} offers={r['n_offers_usable']:2d} "
              f"{'USABLE' if r['usable'] else 'weak'}{'  ERR ' + r['error'] if r['error'] else ''}", file=sys.stderr)

    # ---- summaries ------------------------------------------------------------------------
    cats = {}
    for r in rows:
        c = cats.setdefault(r["category"], {"n": 0, "usable": 0, "plausible": 0, "judged": 0})
        c["n"] += 1; c["usable"] += r["usable"]
        if r["plausible"] is not None:
            c["judged"] += 1; c["plausible"] += r["plausible"]
    for c in cats.values():
        c["usable_rate"] = c["usable"] / c["n"]
        c["demo_safe"] = c["usable_rate"] >= USABLE_CATEGORY
    skus = {}
    for sku in sorted({r["sku"] for r in rows}):
        meds = [r["median_price"] for r in rows if r["sku"] == sku and r["usable"] and r["median_price"]]
        skus[sku] = {"catalog_market_price": catalog.get(sku, {}).get("market_price"),
                     "channel3_median_of_medians": round(statistics.median(meds), 2) if meds else None,
                     "n_usable_queries": len(meds)}
    ps = sorted(lat)
    latency = {"p50_s": round(statistics.median(ps), 2), "p95_s": round(ps[int(0.95 * (len(ps) - 1))], 2)} if ps else None
    summary = {"as_of": date.today().isoformat(), "n_queries": len(rows), "usable": sum(r["usable"] for r in rows),
               "categories": cats, "skus": skus, "latency": latency,
               "rule": f"usable = a matched product with >= {MIN_OFFERS} priced, in-stock, USD offers; category demo-safe if >= {USABLE_CATEGORY:.0%} usable"}
    (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")

    # ---- report ---------------------------------------------------------------------------
    L = ["# Channel3 coverage probe", "", f"Run date: {summary['as_of']}  |  queries: {len(rows)}  |  usable: {summary['usable']}",
         f"Rule: {summary['rule']}", ""]
    if latency:
        L += [f"Latency: p50 {latency['p50_s']}s, p95 {latency['p95_s']}s", ""]
    L += ["## By category", "", "| category | usable | rate | plausible price | demo-safe |", "|---|---|---|---|---|"]
    for k, c in cats.items():
        L.append(f"| {k} | {c['usable']}/{c['n']} | {c['usable_rate']:.0%} | {c['plausible']}/{c['judged']} | {'YES' if c['demo_safe'] else 'NO'} |")
    L += ["", "## Our fake catalog vs real market prices", "", "| SKU | catalog price | Channel3 median | usable queries |", "|---|---|---|---|"]
    for s, v in skus.items():
        L.append(f"| {s} | {v['catalog_market_price']} | {v['channel3_median_of_medians']} | {v['n_usable_queries']} |")
    L += ["", "## Per query", "", "| id | query | products | matched | offers | merchants | median $ | vs catalog | usable |", "|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        m = f"{r['median_price']:.0f}" if r["median_price"] else "-"
        ra = f"{r['ratio_vs_catalog']:.2f}x" if r["ratio_vs_catalog"] else "-"
        L.append(f"| {r['id']} | {r['query'][:40]} | {r['n_products']} | {r['n_matched']} | {r['n_offers_usable']} | {r['n_merchants']} | {m} | {ra} | {'yes' if r['usable'] else 'no'} |")
    errs = [r for r in rows if r["error"]]
    if errs:
        L += ["", "## Errors", ""] + [f"- {r['id']}: {r['error']}" for r in errs]
    safe = [k for k, c in cats.items() if c["demo_safe"]]
    L += ["", "## Recommendation (fill in after reading the tables)", "",
          f"- Demo-safe categories by the rule: {', '.join(safe) if safe else 'NONE: use fixture benchmarks'}",
          "- If a SKU's Channel3 median is far from its catalog price, update seed/catalog.json and regenerate seed + vendor price lists.", ""]
    (out / "report.md").write_text("\n".join(L))

    # ---- fixtures for BAI (fallback benchmarks) ------------------------------------------
    fx = {}
    for sku in skus:
        best = max((r for r in rows if r["sku"] == sku and r["usable"]), key=lambda r: r["n_offers_usable"], default=None)
        if best:
            fx[sku] = {"query": best["query"], "product_title": best["product_title"], "currency": "USD",
                       "median_price": best["median_price"], "offers": best["offers"]}
    Path(a.fixtures).parent.mkdir(parents=True, exist_ok=True)
    Path(a.fixtures).write_text(json.dumps({"source": "channel3", "as_of": summary["as_of"], "items": fx}, indent=2) + "\n")
    print(f"\nusable {summary['usable']}/{len(rows)} | demo-safe: {', '.join(safe) or 'none'} | report -> {out/'report.md'}")


if __name__ == "__main__":
    main()
