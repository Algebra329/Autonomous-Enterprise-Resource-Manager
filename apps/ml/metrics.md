# ML service metrics (advisory endpoints)

> **All numbers are on SYNTHETIC data from our own generator** (`ml/seedgen/generate.py`), on seeds the models never trained on.
> Treat them as upper bounds. The generator creates cleanly separable classes, so a model can learn the generator's habits.

Seeds: train [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112], validation [113, 114, 115, 116] (thresholds only), test [20261028, 202, 203, 204, 205].

## /score/seat-idle: no HR offboarding feed (honest default)

4272 seats, 1031 should be pruned (pooled over test seeds).

| method | precision | recall | F1 | false positives | recall: idle / drifting / offboarded |
|---|---|---|---|---|---|
| baseline_30_day_rule | 0.949 | 0.966 | 0.957 | 54 ({'periodic': 54}) | 1.0 / 0.885 / 0.956 |
| logistic_regression | 0.994 | 0.991 | 0.993 | 6 ({'periodic': 6}) | 0.995 / 1.0 / 0.98 |
| gradient_boosting | 0.998 | 0.997 | 0.998 | 2 ({'casual': 2}) | 1.0 / 1.0 / 0.99 |

## /score/seat-idle: with an HR offboarding feed

4272 seats, 1031 should be pruned (pooled over test seeds).

| method | precision | recall | F1 | false positives | recall: idle / drifting / offboarded |
|---|---|---|---|---|---|
| baseline_30_day_rule | 0.949 | 0.966 | 0.957 | 54 ({'periodic': 54}) | 1.0 / 0.885 / 0.956 |
| logistic_regression | 0.997 | 0.997 | 0.997 | 3 ({'periodic': 3}) | 0.995 / 1.0 / 1.0 |
| gradient_boosting | 1.0 | 0.998 | 0.999 | 0 ({}) | 1.0 / 1.0 / 0.993 |

## /score/anomaly: planted anomaly types only

175 purchases, 55 anomalies (**base rate 31%**, far above real life, so precision is flattered).

| method | precision | recall | F1 | AUROC | recall by type |
|---|---|---|---|---|---|
| baseline_ratio_rule | 1.0 | 0.273 | 0.429 | 0.663 | cap_structuring 0/25, currency_mismatch 5/5, duplicate_order 0/5, first_time_vendor 0/5, price_inflation 10/10, quantity_outlier 0/5, too_good_to_be_true 0/5, velocity_burst 0/25 |
| hand_written_rules | 0.93 | 0.964 | 0.946 | - | cap_structuring 25/25, currency_mismatch 5/5, duplicate_order 5/5, first_time_vendor 5/5, price_inflation 10/10, quantity_outlier 3/5, too_good_to_be_true 5/5, velocity_burst 25/25 |
| isolation_forest | 0.93 | 0.964 | 0.946 | 0.987 | cap_structuring 25/25, currency_mismatch 5/5, duplicate_order 5/5, first_time_vendor 5/5, price_inflation 10/10, quantity_outlier 3/5, too_good_to_be_true 5/5, velocity_burst 25/25 |

## /score/anomaly: plus two NOVEL types the rules were not written for

215 purchases, 95 anomalies (**base rate 44%**, far above real life, so precision is flattered).

| method | precision | recall | F1 | AUROC | recall by type |
|---|---|---|---|---|---|
| baseline_ratio_rule | 1.0 | 0.158 | 0.273 | 0.595 | cap_structuring 0/25, currency_mismatch 5/5, duplicate_order 0/5, first_time_vendor 0/5, mild_inflation 0/20, price_inflation 10/10, quantity_outlier 0/5, too_good_to_be_true 0/5, underpriced_known_vendor 0/20, velocity_burst 0/25 |
| hand_written_rules | 0.891 | 0.6 | 0.717 | - | cap_structuring 25/25, currency_mismatch 5/5, duplicate_order 5/5, first_time_vendor 5/5, mild_inflation 1/20, price_inflation 10/10, quantity_outlier 3/5, too_good_to_be_true 5/5, underpriced_known_vendor 3/20, velocity_burst 25/25 |
| isolation_forest | 0.875 | 0.811 | 0.842 | 0.952 | cap_structuring 25/25, currency_mismatch 5/5, duplicate_order 5/5, first_time_vendor 5/5, mild_inflation 4/20, price_inflation 10/10, quantity_outlier 3/5, too_good_to_be_true 5/5, underpriced_known_vendor 20/20, velocity_burst 25/25 |

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
