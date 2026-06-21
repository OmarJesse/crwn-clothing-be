# Evaluation Harness

A standalone Node-side evaluation suite for the CRWN fit-aware pipeline. Computes the metrics the thesis reviewer asked for (Accuracy, Precision, Recall, F1, MAE, Top-K Accuracy, MRR) against synthetic anthropometric data.

For the methodology behind every number see [`../EVALUATION.md`](../EVALUATION.md).

## Run

```bash
cd evaluation
node run-all.js
```

Outputs:

- `results/results.json` — machine-readable
- `results/RESULTS.md` — human-readable, suitable for the thesis appendix

Or run individual suites:

```bash
node body-shape-eval.js
node size-recommendation-eval.js
node palette-eval.js
```

## Layout

```
evaluation/
├── lib/                       Pure extracted copies of the runtime logic.
│   ├── measurements.js          (body-shape classifier)
│   ├── size-recommendation.js   (scoreSize + getRecommendedSize)
│   └── product-style-match.js   (scoreProductPreferences)
├── metrics.js                 Accuracy / Precision / Recall / F1 / MAE / etc.
├── synthetic-data.js          Anthropometric distributions + catalog generator.
├── body-shape-eval.js         Body-shape classification suite.
├── size-recommendation-eval.js Size recommendation suite.
├── palette-eval.js            Palette bucket classifier suite.
├── run-all.js                 Orchestrator; writes RESULTS.md + results.json.
├── results/                   Output (gitignored except RESULTS.md).
└── python/                    Keras + Hugging Face + Trendyol stubs.
```

## What's Synthetic vs. Real

The Node-side harness uses **synthetic data drawn from published anthropometric distributions** (ANSUR II–derived means and variances) so it can be run anywhere, fully reproducible, no dataset download required, no GPU needed. The metrics are real numbers for the real classifiers — what's synthetic is the input distribution.

For **real-world validation** (DeepFashion via Hugging Face, H&M competition via Kaggle, Trendyol catalog), see `python/` and `../EVALUATION.md` §6.

## CI

This suite runs automatically in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) on every push, with results uploaded as a 90-day artifact. Pull the latest artifact for the thesis writeup.

## Reproducibility

All randomness is seeded:

- Synthetic people: `seed = 42` (body-shape), `seed = 11` (size recommendation)
- Synthetic catalog: `seed = 7`
- Palette noise: `seed = 99`

Two machines running the same code produce identical metric values.
