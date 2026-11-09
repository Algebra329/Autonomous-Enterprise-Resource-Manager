#!/usr/bin/env python3
"""Compares two runs of the SAME exam to measure stability, and says whether each difference is cosmetic or a real flip.

  python ml/policy_eval/compare.py results/dev_raw.json results/dev_raw2.json
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import score

cases = {c["id"]: c for c in json.loads((Path(__file__).parent / "cases.json").read_text())["cases"]}
A, B = (json.loads(Path(p).read_text()) for p in sys.argv[1:3])
ids = [i for i in A if i in B and i in cases]
flips, field_diffs, cosmetic, same = [], [], [], 0
for i in ids:
    a, b = A[i], B[i]
    pa, pb = (a or {}).get("policy"), (b or {}).get("policy")
    if (pa is None) != (pb is None):
        flips.append(i); continue
    if pa is None:
        same += 1; continue
    bad = [f for f in score.FIELDS if not score.field_equal(f, pa.get(f), pb.get(f))]
    if bad:
        field_diffs.append((i, bad))
    elif pa != pb or sorted(a.get("warnings", [])) != sorted(b.get("warnings", [])):
        cosmetic.append(i)
    else:
        same += 1
print(f"{len(ids)} cases compared")
print(f"  identical:            {same}")
print(f"  cosmetic differences: {len(cosmetic)}  (same policy; list order or warning wording)  {cosmetic}")
print(f"  FIELD differences:    {len(field_diffs)}  (a different policy value)")
for i, bad in field_diffs:
    print(f"     {i} [{cases[i]['type']}] fields {bad}: {cases[i]['text'][:70]}")
print(f"  FLIPS ask<->compile:  {len(flips)}  (the serious kind)")
for i in flips:
    ga, gb = score.grade(cases[i], A[i]), score.grade(cases[i], B[i])
    print(f"     {i} [{cases[i]['type']}] run1 {'ok' if not ga['problems'] else 'WRONG'}, run2 {'ok' if not gb['problems'] else 'WRONG'}: {cases[i]['text'][:70]}")
stable = same + len(cosmetic)
print(f"\nsemantically stable: {stable}/{len(ids)}")
