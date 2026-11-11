#!/usr/bin/env python3
"""Do BAI's guard rule codes match the names the Arena cases use?  Point it at the file(s) that define them:

    python arena/tools/check_rule_codes.py packages/shared/src            # a folder (scans *.ts)
    python arena/tools/check_rule_codes.py packages/shared/src/verdict.ts

Prints which of OUR codes are missing from theirs, and which of THEIR code-like names we do not use.
A mismatch is a one-line fix in build_cases.py (RULES set and the cases), then rerun it."""
import re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import importlib.util
spec = importlib.util.spec_from_file_location("bc", Path(__file__).parent / "build_cases.py")
src = (Path(__file__).parent / "build_cases.py").read_text()
ours = set(re.search(r"RULES = \{(.*?)\}", src, re.S).group(1).replace('"', "").replace("\n", " ").replace(" ", "").split(",")) - {""}

paths = [Path(p) for p in sys.argv[1:]] or sys.exit(__doc__)
files = [f for p in paths for f in ([p] if p.is_file() else sorted(p.rglob("*.ts")))]
text = "\n".join(f.read_text(errors="ignore") for f in files)
theirs = {t for t in re.findall(r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*\b", text) if len(t) >= 4}   # UPPER_CASE tokens, with or without underscores
missing = sorted(ours - theirs)
print(f"scanned {len(files)} file(s); our arena uses {len(ours)} rule codes")
print("OUR codes NOT found in theirs:", missing or "none (all match)")
extra = sorted(theirs - ours)
print(f"their UPPER_CASE names we do not use ({len(extra)}; may include non-rule constants):", extra[:40])
sys.exit(1 if missing else 0)
