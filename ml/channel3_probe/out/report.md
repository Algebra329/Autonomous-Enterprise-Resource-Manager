# Channel3 coverage probe

Run date: 2026-10-30  |  queries: 30  |  usable: 14
Rule: usable = a matched product with >= 3 priced, in-stock, USD offers; category demo-safe if >= 60% usable

Latency: p50 2.24s, p95 3.12s

## By category

| category | usable | rate | plausible price | demo-safe |
|---|---|---|---|---|
| laptops | 4/13 | 31% | 9/12 | NO |
| monitors | 6/11 | 55% | 7/9 | NO |
| accessories | 4/6 | 67% | 6/6 | YES |

## Our fake catalog vs real market prices

| SKU | catalog price | Channel3 median | usable queries |
|---|---|---|---|
| DOCK-TB | 240.0 | 322.67 | 4 |
| LAP-13 | 1250.0 | 1249.99 | 1 |
| LAP-14 | 1450.0 | 1199.99 | 2 |
| LAP-16 | 1950.0 | 2979.49 | 1 |
| MON-24 | 230.0 | 521.49 | 2 |
| MON-27 | 420.0 | 584.99 | 4 |

## Per query

| id | query | products | matched | offers | merchants | median $ | vs catalog | usable |
|---|---|---|---|---|---|---|---|---|
| q01 | MacBook Air 13 inch M3 | 20 | 20 | 2 | 2 | 1234 | 0.99x | no |
| q02 | Dell XPS 13 laptop | 20 | 20 | 2 | 2 | 1526 | 1.22x | no |
| q03 | HP Dragonfly G4 13 laptop | 20 | 0 | 0 | 0 | - | - | no |
| q04 | Lenovo ThinkPad T14 Gen 5 | 20 | 20 | 5 | 5 | 1588 | 1.10x | yes |
| q05 | Dell Latitude 7450 laptop | 20 | 17 | 2 | 2 | 306 | 0.21x | no |
| q06 | HP EliteBook 840 G11 | 20 | 16 | 3 | 3 | 812 | 0.56x | yes |
| q07 | 14 inch business laptop 16GB 512GB | 20 | 5 | 1 | 1 | 1030 | 0.71x | no |
| q08 | MacBook Pro 16 inch | 20 | 20 | 8 | 8 | 2979 | 1.53x | yes |
| q09 | Lenovo ThinkPad P16 mobile workstation | 20 | 19 | 2 | 2 | 4769 | 2.45x | no |
| q10 | Dell Precision 5690 laptop | 20 | 20 | 2 | 2 | 1721 | 0.88x | no |
| q11 | Dell P2422H 24 inch monitor | 20 | 0 | 0 | 0 | - | - | no |
| q12 | HP E24 G5 monitor | 20 | 3 | 5 | 5 | 390 | 1.70x | yes |
| q13 | 24 inch full HD IPS monitor | 20 | 5 | 2 | 2 | 128 | 0.56x | no |
| q14 | ASUS VA24EHE 24 inch monitor | 20 | 1 | 1 | 1 | 33 | 0.14x | no |
| q15 | Lenovo ThinkVision 24 inch monitor | 20 | 17 | 3 | 3 | 653 | 2.84x | yes |
| q16 | Dell U2723QE 27 inch 4K monitor | 20 | 1 | 3 | 3 | 700 | 1.67x | yes |
| q17 | LG 27UP850 4K monitor | 20 | 0 | 0 | 0 | - | - | no |
| q18 | 27 inch 4K USB-C monitor | 20 | 5 | 5 | 5 | 700 | 1.67x | yes |
| q19 | Samsung ViewFinity S8 27 monitor | 20 | 15 | 3 | 3 | 470 | 1.12x | yes |
| q20 | BenQ PD2706U 27 inch monitor | 20 | 8 | 3 | 3 | 400 | 0.95x | yes |
| q21 | Dell WD22TB4 Thunderbolt dock | 20 | 6 | 3 | 3 | 210 | 0.87x | yes |
| q22 | Lenovo ThinkPad Thunderbolt 4 dock | 20 | 11 | 4 | 4 | 370 | 1.54x | yes |
| q23 | CalDigit TS4 Thunderbolt 4 dock | 20 | 1 | 1 | 1 | 380 | 1.58x | no |
| q24 | HP Thunderbolt Dock G4 | 20 | 9 | 4 | 4 | 275 | 1.15x | yes |
| q25 | Anker Thunderbolt 4 docking station | 20 | 12 | 3 | 3 | 400 | 1.67x | yes |
| q26 | Thunderbolt 4 docking station | 20 | 5 | 1 | 1 | 302 | 1.26x | no |
| q27 | UltraLight 13 Laptop | 20 | 5 | 5 | 5 | 1250 | 1.00x | yes |
| q28 | Business 14 Laptop | 20 | 5 | 2 | 2 | 1578 | 1.09x | no |
| q29 | Performance 16 Laptop | 20 | 5 | 2 | 2 | 793 | 0.41x | no |
| q30 | 27in 4K Monitor | 20 | 5 | 2 | 2 | 504 | 1.20x | no |

## Recommendation (fill in after reading the tables)

- Demo-safe categories by the rule: accessories
- If a SKU's Channel3 median is far from its catalog price, update seed/catalog.json and regenerate seed + vendor price lists.
