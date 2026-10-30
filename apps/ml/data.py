"""Builds datasets from the synthetic generator (ml/seedgen/generate.py) for training and evaluation.

Seed pools are disjoint on purpose:
  TRAIN_SEEDS  fit the models
  VAL_SEEDS    choose the decision thresholds
  TEST_SEEDS   report numbers (includes the shipped seed that the demo uses)
"""
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ml" / "seedgen"))
import generate as G  # noqa: E402

from core import anomaly as A  # noqa: E402
from core import seats as S  # noqa: E402
from core.common import parse_ts  # noqa: E402
import numpy as np  # noqa: E402

TRAIN_SEEDS = [101, 102, 103, 104, 105, 106]
VAL_SEEDS = [107, 108]
TEST_SEEDS = [G.SEED, 202, 203]
AS_OF = datetime.fromisoformat(G.AS_OF_DEFAULT).replace(hour=12, tzinfo=timezone.utc)


def seats_xy(seed, hr_mode):
    """hr_mode: 'none' (no HR feed), 'all' (HR feed for every seat), 'mixed' (random half known)."""
    d = G.build(AS_OF.date(), seed)
    gt = d["ground_truth.json"]["seats"]
    rng = random.Random(f"hr:{seed}")
    feats, y, cls = [], [], []
    for s in d["seats.json"]:
        t = gt[s["id"]]
        known = hr_mode == "all" or (hr_mode == "mixed" and rng.random() < 0.5)
        feats.append(S.seat_features(s, AS_OF, t["offboarded"] if known else None))
        y.append(int(t["should_prune"]))
        cls.append(t["class"])
    return feats, np.array(y), np.array(cls)


def purchases_xy(seed, extra=None):
    d = G.build(AS_OF.date(), seed)
    batch = list(d["history-90d.json"])
    gt = d["ground_truth.json"]["history"]
    types = [gt[b["id"]]["types"] for b in batch]
    if extra:
        batch, types = extra(batch, types, seed)
    X = A.purchase_features(batch)
    y = np.array([int(bool(t)) for t in types])
    return batch, X, y, types
