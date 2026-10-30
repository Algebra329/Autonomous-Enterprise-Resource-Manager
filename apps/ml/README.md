# apps/ml: advisory scoring service

```
python train.py              # trains models/ from the synthetic generator (seconds)
python evaluate.py           # writes metrics.json + metrics.md on held-out seeds
python -m unittest tests.test_core -v
python make_examples.py      # regenerates contract_examples.json from real output
uvicorn main:app --reload    # run the API (needs fastapi, uvicorn, pydantic)
```
Layout: `core/` pure functions (testable without FastAPI) | `main.py` thin FastAPI wrapper | `data.py` seed pools |
`models/` trained bundles | `CONTRACT.md` for BAI | `metrics.md` numbers for the write-up.

Honesty: every metric is on synthetic data from `ml/seedgen/generate.py`. See the header of `metrics.md`.
