#!/usr/bin/env python3
"""Read the model's actual answers next to the answer key (a keyword scorer can miss things a human sees).

  python ml/policy_eval/show.py results/dev_raw.json pc-033 pc-051      # specific cases
  python ml/policy_eval/show.py results/dev_raw.json --random 6         # a random sample
  python ml/policy_eval/show.py results/dev_raw.json --problems         # only cases the scorer flagged
  python ml/policy_eval/show.py results/dev_raw.json --hard             # every ambiguous/adversarial case
"""
import argparse, json, random, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import score


def compact(p):
    return None if p is None else {k: p[k] for k in score.FIELDS}


ap = argparse.ArgumentParser()
ap.add_argument("responses"); ap.add_argument("ids", nargs="*")
ap.add_argument("--random", type=int); ap.add_argument("--problems", action="store_true"); ap.add_argument("--hard", action="store_true")
ap.add_argument("--cases", default=str(Path(__file__).with_name("cases.json")))
a = ap.parse_args()
cases = {c["id"]: c for c in json.loads(Path(a.cases).read_text())["cases"]}
resp = json.loads(Path(a.responses).read_text())
ids = [i for i in resp if i in cases]
if a.ids:
    ids = [i for i in a.ids if i in resp]
elif a.problems:
    ids = [i for i in ids if score.grade(cases[i], resp[i])["problems"]]
elif a.hard:
    ids = [i for i in ids if cases[i]["type"] != "clear"]
elif a.random:
    ids = random.Random(0).sample(ids, min(a.random, len(ids)))
for i in ids:
    c, r = cases[i], resp[i]
    g = score.grade(c, r)
    print(f"\n=== {i} [{c['type']}/{c['split']}] {'OK' if not g['problems'] else 'PROBLEM'}")
    print(f"TEXT:     {c['text']}")
    e = c["expect"]
    print("EXPECTED: " + (f"compile {json.dumps(e['policy'])}  warn on {e['warn_fields']}" if e["outcome"] == "compile" else f"ask about {e['question_fields'] or 'anything sensible'}"))
    print(f"GOT:      policy={json.dumps(compact(r.get('policy')))}")
    print(f"          warnings={r.get('warnings')}\n          questions={r.get('questions')}")
    for p in g["problems"]:
        print(f"  ! {p}")
if not ids:
    print("nothing to show")
