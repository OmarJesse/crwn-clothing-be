# Python Training Pipeline (Thesis Scaffolding)

This folder is the **Python-side companion** to the JavaScript evaluation harness in [`../`](..). The JS harness validates the **deployed pipeline** against synthetic anthropometric data; the Python code in this folder is the scaffolding for **training new models** (Keras) and **validating against public benchmark datasets** (via Hugging Face Datasets and Kaggle), as well as a polite **Trendyol catalog fetcher** for real-world e-commerce validation.

> These scripts are **runnable stubs**, intended for a thesis writer to fill in dataset paths and credentials. They mirror the methodology described in [`../../EVALUATION.md`](../../EVALUATION.md).

## Files

| File | Purpose | Status |
|------|---------|--------|
| `requirements.txt` | Python dependencies | Final |
| `train_measurement_head.py` | Keras model that maps pose keypoints + height → body measurements | Trainable stub |
| `evaluate_movenet_on_coco.py` | Run our wrapped MoveNet against COCO Keypoints val, report OKS / PCK | Trainable stub |
| `evaluate_palette_on_deepfashion.py` | Hugging Face DeepFashion + our palette classifier, report per-class F1 | Trainable stub |
| `trendyol_catalog_fetcher.py` | Polite (1 req/s) Trendyol catalog crawler with rate limit + robots.txt | Trainable stub |
| `evaluate_size_recommendation_on_hm.py` | H&M Personalized Fashion Recommendations on Kaggle, NDCG@k | Trainable stub |

## How to Run

```bash
# From the repository root
cd evaluation/python
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Each script runs independently. Datasets must be available locally OR
# accessible via Hugging Face datasets / Kaggle CLI.
python evaluate_movenet_on_coco.py
python train_measurement_head.py
python evaluate_palette_on_deepfashion.py
```

The Trendyol crawler **must** be run with appropriate authentication (academic-use request preferred over scraping) and the `--max-products` cap respected.

## Why This Lives Here Instead of in Production

- **TensorFlow.js is the runtime** — the browser uses pre-trained MoveNet + FaceMesh + a hand-coded measurement head, plus our deterministic body-shape and palette classifiers.
- **Keras is the experiment lab** — training new models, comparing against the hand-coded baselines, and producing the per-class metrics tables a thesis defense needs.
- The two are bridged by `tensorflowjs_converter` when (and only when) a Keras-trained model beats the hand-coded baseline.

See [`../../EVALUATION.md`](../../EVALUATION.md) §5 for the full conceptual treatment.
