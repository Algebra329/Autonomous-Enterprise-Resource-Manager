#!/usr/bin/env python3
"""Runs cases.json through a compiler and saves responses.json for score.py.

  # A) the team's real endpoint (once BAI's B4 is up)
  python run_eval.py --provider api --url http://localhost:8787 [--token T] --out responses.json

  # B) straight to a model with prompt_v1.txt (needs network + key)
  ANTHROPIC_API_KEY=... python run_eval.py --provider anthropic --model <model-id> --out responses.json

Use --split dev while tuning the prompt. Run --split test once when you are done.
Standard library only.
"""
import argparse, json, os, re, sys, time, urllib.request
from pathlib import Path

HERE = Path(__file__).parent


def post(url, body, headers):
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def parse_json(text):
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    return json.loads(t)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["api", "anthropic"], required=True)
    ap.add_argument("--url"); ap.add_argument("--token"); ap.add_argument("--model")
    ap.add_argument("--prompt", default=str(HERE / "prompt_v1.txt"))
    ap.add_argument("--split", choices=["all", "dev", "test"], default="all")
    ap.add_argument("--out", default="responses.json")
    ap.add_argument("--delay", type=float, default=0.0)
    a = ap.parse_args()
    cases = [c for c in json.loads((HERE / "cases.json").read_text())["cases"] if a.split in ("all", c["split"])]
    system = Path(a.prompt).read_text()
    out = {}
    for i, c in enumerate(cases, 1):
        try:
            if a.provider == "api":
                h = {"Authorization": f"Bearer {a.token}"} if a.token else {}
                r = post(a.url.rstrip("/") + "/v1/policies/compile", {"text": c["text"]}, h)
            else:
                if not a.model or not os.environ.get("ANTHROPIC_API_KEY"):
                    sys.exit("need --model and ANTHROPIC_API_KEY")
                resp = post("https://api.anthropic.com/v1/messages",
                            {"model": a.model, "max_tokens": 1000, "temperature": 0, "system": system,
                             "messages": [{"role": "user", "content": f"<policy_text>\n{c['text']}\n</policy_text>"}]},
                            {"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01"})
                r = parse_json("".join(b.get("text", "") for b in resp["content"]))
        except Exception as e:  # record the failure; the scorer counts it as a schema failure
            r = {"policy": None, "warnings": [], "questions": [], "_error": str(e)[:200]}
        out[c["id"]] = r
        print(f"[{i}/{len(cases)}] {c['id']} {'ERR ' + r['_error'] if '_error' in r else 'ok'}", file=sys.stderr)
        time.sleep(a.delay)
    Path(a.out).write_text(json.dumps(out, indent=2) + "\n")
    print(f"saved {len(out)} responses -> {a.out}")


if __name__ == "__main__":
    main()
