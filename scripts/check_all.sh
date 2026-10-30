#!/usr/bin/env bash
# Runs every keyless check we have built, in project order (C3 -> C1 -> C4 -> C5). Run from anywhere:
#   bash scripts/check_all.sh
# Needs: python3, numpy, scikit-learn. Optional: fastapi + httpx (API smoke test).
cd "$(dirname "$0")/.." || exit 1
ROOT=$PWD; PASS=0; FAIL=0; SKIP=0; LOG=$(mktemp)
step() {  # step "name" expected_exit command...
  local name=$1 want=$2; shift 2
  "$@" >"$LOG" 2>&1; local got=$?
  if [ "$got" -eq "$want" ]; then printf "  PASS  %s\n" "$name"; PASS=$((PASS+1))
  elif [ "$got" -eq 3 ]; then printf "  SKIP  %s  (%s)\n" "$name" "$(head -c 120 "$LOG" | tr '\n' ' ')"; SKIP=$((SKIP+1))
  else printf "  FAIL  %s  (exit %s, wanted %s)\n" "$name" "$got" "$want"; sed 's/^/        /' "$LOG" | tail -15; FAIL=$((FAIL+1)); fi
}
echo "== environment"
step "python3 + numpy + scikit-learn" 0 python3 -c "import numpy, sklearn"
echo "== C3 seed data"
step "seed files match the generator (deterministic)" 0 python3 ml/seedgen/generate.py --verify
echo "== C1 policy compiler exam"
step "answer key builds (55 cases, 25 hard)" 0 python3 ml/policy_eval/build_cases.py
step "scorer: oracle passes the gate" 0 python3 ml/policy_eval/score.py --baseline oracle --gate --quiet
step "scorer: always_ask is rejected by the gate" 1 python3 ml/policy_eval/score.py --baseline always_ask --gate --quiet
step "scorer: reckless guesser is rejected by the gate" 1 python3 ml/policy_eval/score.py --baseline reckless --gate --quiet
echo "== C4 arena"
step "63 arena cases build + validate" 0 python3 arena/tools/build_cases.py
step "arena answer key matches spec arithmetic" 0 python3 arena/tools/selfcheck.py
echo "== C5 ML service"
( cd apps/ml || exit 1
  step "train both models" 0 python3 train.py
  step "unit tests (9)" 0 python3 -m unittest tests.test_core
  step "evaluate on held-out seeds" 0 python3 evaluate.py
  step "contract examples regenerate" 0 python3 make_examples.py
  step "FastAPI smoke test (all routes)" 0 python3 -m tests.smoke_api
  echo "$PASS $FAIL $SKIP" > "$LOG.counts" ) 
# subshell counters do not propagate: recount from the saved line
read -r P F S < "$LOG.counts" 2>/dev/null && { PASS=$P; FAIL=$F; SKIP=$S; }
echo; echo "RESULT: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
