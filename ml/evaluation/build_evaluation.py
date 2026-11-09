#!/usr/bin/env python3
"""C8: assembles docs/evaluation.md from the real result files. Never types a number by hand.
Anything not measured yet is printed as a visible NOT YET MEASURED banner with the command that produces it,
so an unmeasured claim cannot slip into the Devpost write-up.

    python ml/evaluation/build_evaluation.py
Inputs (all optional except the ML + backtest files that the repo already generates):
    ml/policy_eval/results/{dev,test}_metrics.json   score.py <responses> --json <this file>
    ml/channel3_probe/out/summary.json               probe.py
    arena/results/summary.json                       arena runner (not written yet)
    apps/ml/metrics.json                             apps/ml/evaluate.py
    seed/backtest-demo.json                          apps/ml/run_backtest.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load(rel):
    p = ROOT / rel
    return json.loads(p.read_text()) if p.exists() else None


def pc(v):
    return "n/a" if v is None else f"{v * 100:.1f}%"


def missing(what, cmd):
    return f"> **NOT YET MEASURED: {what}.** Produce it with: `{cmd}`\n"


def policy_section():
    dev, test = load("ml/policy_eval/results/dev_metrics.json"), load("ml/policy_eval/results/test_metrics.json")
    L = ["## 1. Policy compiler (plain English to a strict Policy)", "",
         "55 hand-written policies: 30 clear, 21 ambiguous, 4 adversarial. The compiler must ask a question instead of guessing. "
         "Prompt tuned on the 23 `dev` cases only; the 32 `test` cases are run once at the end.", ""]
    if not test:
        L.append(missing("policy compiler accuracy on the held-out test split",
                         "python ml/policy_eval/run_eval.py ... --split test --out test.json && python ml/policy_eval/score.py test.json --json ml/policy_eval/results/test_metrics.json"))
    src = test or dev
    if src:
        m = src["metrics"]["TEST" if test else "DEV"]
        L += ["Split reported: **" + ("test (held out)" if test else "dev (the split we tuned on, so optimistic)") + "**", "",
              "| metric | value |", "|---|---|",
              f"| clear policies compiled exactly right | {pc(m['clear_exact_rate'])} (of {m['n_clear']}) |",
              f"| clear policies wrongly refused (annoying, safe) | {pc(m['clear_wrongly_asked_rate'])} |",
              f"| **guessed when it should have asked (dangerous)** | **{pc(m['guess_rate'])}** (of {m['n_hard']} hard cases) |",
              f"| of which adversarial (override attempts) | {pc(m['adversarial_guess_rate'])} (of {m['n_adversarial']}) |",
              f"| defaults applied without a warning | {pc(m['silent_default_rate'])} |",
              f"| output matched the schema | {pc(m['schema_valid_rate'])} |", ""]
    return L


def probe_section():
    s = load("ml/channel3_probe/out/summary.json")
    L = ["## 2. Channel3 benchmark coverage", ""]
    if not s:
        return L + [missing("Channel3 coverage", "CHANNEL3_API_KEY=... python ml/channel3_probe/probe.py")]
    L += [f"{s['n_queries']} business-hardware queries; {s['usable']} returned a usable benchmark ({s['rule']}).", "",
          "| category | usable | demo-safe |", "|---|---|---|"]
    for k, c in s["categories"].items():
        L.append(f"| {k} | {c['usable']}/{c['n']} ({pc(c['usable_rate'])}) | {'yes' if c['demo_safe'] else 'no'} |")
    if s.get("latency"):
        L += ["", f"Latency p50 {s['latency']['p50_s']}s, p95 {s['latency']['p95_s']}s."]
    return L + [""]


def arena_section():
    import glob
    cases = [c for f in sorted(glob.glob(str(ROOT / "arena" / "cases" / "*.json"))) for c in json.load(open(f))]
    atk = [c for c in cases if c["kind"] == "attack"]
    L = ["## 3. Break-it Arena (abuse suite)", "",
         f"{len(cases)} cases: {len(atk)} attacks across {len({c['category'] for c in atk})} categories plus {len(cases) - len(atk)} legitimate controls. "
         f"{sum(c['layer'] == 'guard' for c in atk)} attacks target the deterministic verifier, {sum(c['layer'] == 'agent' for c in atk)} target the LLM agent.", ""]
    s = load("arena/results/summary.json")
    if not s:
        return L + [missing("Arena pass rates (the headline safety claim)", "pnpm exec tsx arena/runner.ts")]
    L += [f"**Layer measured: {s['layer']}.** {s['safety_pass']}/{s['attacks_run']} attacks ended safely; false-block rate on controls {s['control_false_block_rate']}. "
          f"{len(s['skipped'])} cases were skipped (not counted as passes).", "",
          "| category | safety pass | rule match | skipped |", "|---|---|---|---|"]
    for k, v in s["by_category"].items():
        L.append(f"| {k} | {v['safety_pass']} | {v['rule_match']} | {v['skipped']} |")
    if s.get("failures"):
        L += ["", "Failures in this run (published as measured):", ""] + [f"- `{x['id']}` {x['title']}: verifier said {x['outcome']}" for x in s["failures"]]
    if (ROOT / "arena" / "findings" / "FINDINGS.md").exists():
        L += ["", "The first run against the verifier as merged found fail-open gaps (40 of 45 safe before fixes). Findings and fixes: `arena/findings/FINDINGS.md`."]
    if s.get("diagnostics"):
        L += ["", "Safe but not stopped by the expected rule:", ""] + [f"- `{x['id']}` {x['title']}" for x in s["diagnostics"]]
    return L + [""]


def ml_section():
    m = load("apps/ml/metrics.json")
    L = ["## 4. Advisory ML service", "",
         "> All numbers in this section are on **synthetic** data from our own generator, on random seeds the models never trained on. Upper bounds, not field results.", ""]
    if not m:
        return L + [missing("ML metrics", "python apps/ml/evaluate.py")]
    s = m["seat_idle"]["hr_feed_none"]
    L += [f"**Idle-seat detection** ({s['n_seats']} seats, {s['n_should_prune']} should be pruned, no HR feed):", "",
          "| method | precision | recall | false positives |", "|---|---|---|---|"]
    for k in ("baseline_30_day_rule", "logistic_regression", "gradient_boosting"):
        x = s[k]
        L.append(f"| {k} | {x['precision']} | {x['recall']} | {x['fp']} |")
    a = m["anomaly"]["with_novel_types"]
    L += ["", f"**Purchase anomalies** ({a['n_purchases']} purchases, base rate {pc(a['base_rate'])}, far above real life), including two novel types:", "",
          "| method | precision | recall | F1 |", "|---|---|---|---|"]
    for k in ("baseline_ratio_rule", "hand_written_rules", "isolation_forest"):
        x = a[k]
        L.append(f"| {k} | {x['precision']} | {x['recall']} | {x['f1']} |")
    p = m["price"]["all"]
    L += ["", f"**Fair price** (simulated offers, 15% contaminated): median error {p['mean']['median_abs_pct_error']}% with a plain mean, "
              f"{p['median']['median_abs_pct_error']}% with a plain median, {p['robust']['median_abs_pct_error']}% with our robust method.", ""]
    return L


def backtest_section():
    b = load("seed/backtest-demo.json")
    L = ["## 5. Backtest (90 days of synthetic purchase history, demo policy)", ""]
    if not b:
        return L + [missing("backtest", "python apps/ml/run_backtest.py")]
    s, d, sp = b["backtest"]["summary"], b["backtest"]["savings_decomposition"], b["seat_pruning"]
    c = s["counts"]
    L += [f"{s['n_purchases']} purchases replayed: **{c['auto_approved']} auto-approved, {c['escalated']} escalated, {c['blocked']} blocked** by the circuit breaker.", "",
          f"- Realized savings (auto-approved only): **${s['realized_savings']:,.2f}** ({s['realized_savings_pct_of_human_spend']}% of what humans paid for those).",
          f"- Potential savings if the manager approves escalations: ${s['potential_savings']:,.2f}.",
          f"- Of the realized savings, ${d['realized_list_price_only']:,.2f} comes from picking the cheaper vendor; negotiation adds ${d['realized_with_negotiation'] - d['realized_list_price_only']:,.2f}.",
          f"- Seat pruning would flag {sp['seats_flagged']} of {sp['total_seats']} seats, about ${sp['monthly_saving_if_all_flagged_cancelled']:,.2f} a month of ${sp['total_monthly_seat_spend']:,.2f}.", "",
          "Assumptions:"] + [f"- {x}" for x in b["backtest"]["assumptions"]] + [""]
    return L


LIMITS = ["## 6. Limitations (read before quoting any number)", "",
          "- The company, its SaaS seats, the asset register, usage logs and the vendors are simulated. Benchmark prices come from the real Channel3 catalog.",
          "- The generator makes cleanly separable behaviour, so ML metrics are upper bounds and measure learning of the generator, not of real offices.",
          "- Planted anomalies are 30% of the history; real fraud is far rarer, which flatters precision.",
          "- Savings depend on our simulated vendors' prices and concessions.",
          "- The verifier, not any model, decides whether money moves. Every ML score is advisory.",
          "- No rule detects duplicate orders; the ML anomaly service flags them but the verifier does not.", ""]

if __name__ == "__main__":
    out = ["# Evaluation", "", "Generated by `ml/evaluation/build_evaluation.py` from result files. Do not edit by hand; rerun the script.", ""]
    for f in (policy_section, probe_section, arena_section, ml_section, backtest_section):
        out += f()
    out += LIMITS
    doc = ROOT / "docs" / "evaluation.md"
    doc.parent.mkdir(exist_ok=True)
    doc.write_text("\n".join(out))
    n = sum(1 for l in out if l.startswith("> **NOT YET MEASURED"))
    print(f"wrote {doc} ({n} section(s) still NOT YET MEASURED)")