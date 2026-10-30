# ML service metrics (advisory endpoints)

> **All numbers are on SYNTHETIC data from our own generator** (`ml/seedgen/generate.py`), on seeds the models never trained on.
> Treat them as upper bounds. The generator creates cleanly separable classes, so a model can learn the generator's habits.

Seeds: train [101, 102, 103, 104, 105, 106], validation [107, 108] (thresholds only), test [20261028, 202, 203].

## /score/seat-idle: no HR offboarding feed (honest default)

2544 seats, 603 should be pruned (pooled over test seeds).

| method | precision | recall | F1 | false positives | recall: idle / drifting / offboarded |
|---|---|---|---|---|---|
| baseline_30_day_rule | 0.938 | 0.96 | 0.949 | 38 ({'periodic': 38}) | 1.0 / 0.905 / 0.923 |
| logistic_regression | 0.995 | 0.99 | 0.993 | 3 ({'periodic': 3}) | 0.994 / 1.0 / 0.976 |
| gradient_boosting | 0.995 | 0.995 | 0.995 | 3 ({'casual': 3}) | 0.997 / 1.0 / 0.988 |

## /score/seat-idle: with an HR offboarding feed

2544 seats, 603 should be pruned (pooled over test seeds).

| method | precision | recall | F1 | false positives | recall: idle / drifting / offboarded |
|---|---|---|---|---|---|
| baseline_30_day_rule | 0.938 | 0.96 | 0.949 | 38 ({'periodic': 38}) | 1.0 / 0.905 / 0.923 |
| logistic_regression | 0.998 | 0.997 | 0.998 | 1 ({'periodic': 1}) | 0.994 / 1.0 / 1.0 |
| gradient_boosting | 1.0 | 0.995 | 0.998 | 0 ({}) | 0.997 / 1.0 / 0.988 |

## /score/anomaly: planted anomaly types only

285 purchases, 45 anomalies (**base rate 16%**, far above real life, so precision is flattered).

| method | precision | recall | F1 | AUROC | recall by type |
|---|---|---|---|---|---|
| baseline_ratio_rule | 1.0 | 0.333 | 0.5 | 0.697 | cap_structuring 0/18, currency_mismatch 3/3, duplicate_order 0/3, first_time_vendor 0/3, price_inflation 12/12, quantity_outlier 0/6, too_good_to_be_true 0/3, velocity_burst 0/18 |
| hand_written_rules | 0.662 | 0.956 | 0.782 | - | cap_structuring 18/18, currency_mismatch 3/3, duplicate_order 3/3, first_time_vendor 3/3, price_inflation 12/12, quantity_outlier 4/6, too_good_to_be_true 3/3, velocity_burst 18/18 |
| isolation_forest | 0.82 | 0.911 | 0.863 | 0.974 | cap_structuring 17/18, currency_mismatch 3/3, duplicate_order 3/3, first_time_vendor 3/3, price_inflation 12/12, quantity_outlier 3/6, too_good_to_be_true 3/3, velocity_burst 17/18 |

## /score/anomaly: plus two NOVEL types the rules were not written for

309 purchases, 69 anomalies (**base rate 22%**, far above real life, so precision is flattered).

| method | precision | recall | F1 | AUROC | recall by type |
|---|---|---|---|---|---|
| baseline_ratio_rule | 1.0 | 0.217 | 0.357 | 0.628 | cap_structuring 0/18, currency_mismatch 3/3, duplicate_order 0/3, first_time_vendor 0/3, mild_inflation 0/12, price_inflation 12/12, quantity_outlier 0/6, too_good_to_be_true 0/3, underpriced_known_vendor 0/12, velocity_burst 0/18 |
| hand_written_rules | 0.676 | 0.667 | 0.672 | - | cap_structuring 18/18, currency_mismatch 3/3, duplicate_order 3/3, first_time_vendor 3/3, mild_inflation 1/12, price_inflation 12/12, quantity_outlier 4/6, too_good_to_be_true 3/3, underpriced_known_vendor 2/12, velocity_burst 18/18 |
| isolation_forest | 0.862 | 0.812 | 0.836 | 0.963 | cap_structuring 18/18, currency_mismatch 3/3, duplicate_order 3/3, first_time_vendor 3/3, mild_inflation 2/12, price_inflation 12/12, quantity_outlier 3/6, too_good_to_be_true 3/3, underpriced_known_vendor 12/12, velocity_burst 18/18 |

## /score/price (simulated offers, 15% contaminated with bait/gouge prices)

3000 trials. Error is vs the true market price.

| offers | method | median abs % error | p90 abs % error |
|---|---|---|---|
| n3-4 | mean | 2.48 | 31.77 |
| n3-4 | median | 1.64 | 4.44 |
| n3-4 | robust | 1.5 | 4.12 |
| n5-9 | mean | 7.03 | 22.31 |
| n5-9 | median | 1.06 | 2.82 |
| n5-9 | robust | 0.94 | 2.51 |
| n10-15 | mean | 5.5 | 17.37 |
| n10-15 | median | 0.81 | 2.13 |
| n10-15 | robust | 0.76 | 1.9 |
| all | mean | 5.82 | 21.21 |
| all | median | 0.97 | 2.74 |
| all | robust | 0.91 | 2.49 |

Outlier detection (robust method): precision 0.973, recall 0.937.

## /forecast/replacement

Deterministic calendar projection. No model, no accuracy claim (no failure data exists).
