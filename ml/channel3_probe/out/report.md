# Channel3 coverage probe (v2: accessory and price-floor filters)

Run date: 2026-11-04  |  queries: 30  |  usable: 14
Rule: usable = a matched product with >= 3 priced, in-stock, USD offers; category demo-safe if >= 60% usable
Filters: laptop/monitor titles with accessory words are dropped; offers below {'laptops': 250.0, 'monitors': 80.0, 'accessories': 50.0} are dropped.

## By category

| category | usable | rate | plausible price | demo-safe |
|---|---|---|---|---|
| laptops | 3/13 | 23% | 10/12 | NO |
| monitors | 6/11 | 55% | 7/8 | NO |
| accessories | 5/6 | 83% | 6/6 | YES |

## Our fake catalog vs real market prices

| SKU | catalog price | Channel3 median | usable queries |
|---|---|---|---|
| DOCK-TB | 240.0 | 299.99 | 5 |
| LAP-13 | 1250.0 | 994.9 | 1 |
| LAP-14 | 1450.0 | 1587.99 | 1 |
| LAP-16 | 1950.0 | 2979.49 | 1 |
| MON-24 | 230.0 | 389.99 | 1 |
| MON-27 | 420.0 | 699.99 | 5 |

## Per query

| id | query | best match | matched | offers | median $ | vs catalog | usable |
|---|---|---|---|---|---|---|---|
| q01 | MacBook Air 13 inch M3 | Apple 13" MacBook Air (M3, Starlight) | 6 (-5 acc.) | 1 (-4 cheap) | 1199 | 0.96x | no |
| q02 | Dell XPS 13 laptop | Dell XPS 13 9345 Laptop, Copilot+ AI PC | 20 (-0 acc.) | 2 (-0 cheap) | 1825 | 1.46x | no |
| q03 | HP Dragonfly G4 13 laptop | - | 0 (-0 acc.) | 0 (-0 cheap) | - | - | no |
| q04 | Lenovo ThinkPad T14 Gen 5 | Lenovo ThinkPad T14 Gen 5 - AI PC | 20 (-0 acc.) | 5 (-0 cheap) | 1588 | 1.10x | yes |
| q05 | Dell Latitude 7450 laptop | Dell Latitude 7450 14" FHD+ 2-in-1 Touchscreen | 5 (-0 acc.) | 2 (-0 cheap) | 1500 | 1.03x | no |
| q06 | HP EliteBook 840 G11 | EliteBook 840 G11 14" Notebook | 10 (-0 acc.) | 2 (-0 cheap) | 1389 | 0.96x | no |
| q07 | 14 inch business laptop 16GB 512GB | Dell Pro 5 Series 14" Business Laptop | 5 (-0 acc.) | 1 (-0 cheap) | 2130 | 1.47x | no |
| q08 | MacBook Pro 16 inch | MacBook Pro 16" | 20 (-0 acc.) | 8 (-1 cheap) | 2979 | 1.53x | yes |
| q09 | Lenovo ThinkPad P16 mobile worksta | Lenovo ThinkPad P16 Gen 3 Mobile Workstation | 18 (-0 acc.) | 2 (-0 cheap) | 4919 | 2.52x | no |
| q10 | Dell Precision 5690 laptop | Dell Precision 5690 16" Mobile Workstation Lap | 2 (-0 acc.) | 1 (-0 cheap) | 3000 | 1.54x | no |
| q11 | Dell P2422H 24 inch monitor | - | 0 (-0 acc.) | 0 (-0 cheap) | - | - | no |
| q12 | HP E24 G5 monitor | E24t G5 Monitor | 2 (-1 acc.) | 5 (-0 cheap) | 390 | 1.70x | yes |
| q13 | 24 inch full HD IPS monitor | HP Series 7 Pro 724pf 24" FHD IPS Monitor, Ant | 4 (-1 acc.) | 2 (-0 cheap) | 480 | 2.09x | no |
| q14 | ASUS VA24EHE 24 inch monitor | - | 1 (-0 acc.) | 0 (-1 cheap) | - | - | no |
| q15 | Lenovo ThinkVision 24 inch monitor | ThinkVision S24e-10 24" (23.8" Viewable) 1920  | 10 (-0 acc.) | 2 (-0 cheap) | 204 | 0.88x | no |
| q16 | Dell U2723QE 27 inch 4K monitor | UltraSharp U2723QE 27" 4K UHD LCD Monitor | 1 (-0 acc.) | 3 (-0 cheap) | 700 | 1.67x | yes |
| q17 | LG 27UP850 4K monitor | - | 0 (-0 acc.) | 0 (-0 cheap) | - | - | no |
| q18 | 27 inch 4K USB-C monitor | ColorPro VP2776T-4K Monitor | 5 (-0 acc.) | 5 (-0 cheap) | 700 | 1.67x | yes |
| q19 | Samsung ViewFinity S8 27 monitor | Viewfinity S80 Series UHD 4K Monitor | 19 (-1 acc.) | 3 (-0 cheap) | 570 | 1.36x | yes |
| q20 | BenQ PD2706U 27 inch monitor | PD2706U | 8 (-0 acc.) | 3 (-0 cheap) | 437 | 1.04x | yes |
| q21 | Dell WD22TB4 Thunderbolt dock | Thunderbolt WD22TB4 Laptop Dock | 7 (-0 acc.) | 3 (-0 cheap) | 210 | 0.87x | yes |
| q22 | Lenovo ThinkPad Thunderbolt 4 dock | Thinkpad Thunderbolt 4 Smart Dock Gen 2 | 11 (-0 acc.) | 4 (-0 cheap) | 300 | 1.25x | yes |
| q23 | CalDigit TS4 Thunderbolt 4 dock | CalDigit TS4 Thunderbolt 4 18-in-1 Hub | 1 (-0 acc.) | 1 (-0 cheap) | 380 | 1.58x | no |
| q24 | HP Thunderbolt Dock G4 | Thunderbolt Dock 120W G4 (4J0A2AA) Docking Sta | 9 (-0 acc.) | 4 (-0 cheap) | 275 | 1.14x | yes |
| q25 | Anker Thunderbolt 4 docking statio | Anker Prime 14-in-1 Thunderbolt 5 Docking Stat | 12 (-0 acc.) | 3 (-2 cheap) | 400 | 1.67x | yes |
| q26 | Thunderbolt 4 docking station | Thunderbolt 4 Docking Station with DisplayLink | 5 (-0 acc.) | 3 (-0 cheap) | 300 | 1.25x | yes |
| q27 | UltraLight 13 Laptop | MSI Modern 13 inch Ultrabook Laptop Core 7-150 | 4 (-1 acc.) | 3 (-0 cheap) | 995 | 0.80x | yes |
| q28 | Business 14 Laptop | V-Series V14 Gen 5 14" Business Laptop | 5 (-0 acc.) | 2 (-0 cheap) | 719 | 0.50x | no |
| q29 | Performance 16 Laptop | Dell 16 Laptop | 5 (-0 acc.) | 2 (-0 cheap) | 1250 | 0.64x | no |
| q30 | 27in 4K Monitor | ColorPro VP2776T-4K Monitor | 5 (-0 acc.) | 5 (-0 cheap) | 700 | 1.67x | yes |

## Recommendation (fill in after reading the tables)

- Demo-safe categories by the rule: accessories
- If a SKU's Channel3 median is far from its catalog price, update seed/catalog.json and regenerate seed + vendor price lists.
