# CRWN Fit-Aware Commerce — Evaluation, Datasets & Validation Roadmap

> A direct response to the thesis reviewer's feedback. Maps each reviewer concern (evaluation metrics, Keras as a training pipeline, Hugging Face / Kaggle datasets, real-world Trendyol validation) to concrete plans, methodologies, and code-level deliverables for the current implementation.

**Last updated:** 2026-05-01
**Companion docs:** [THESIS.md](THESIS.md) (full project narrative), [CHANGES.md](CHANGES.md) (this phase's contributions).

---

## 1. Reviewer Feedback Summary

The reviewer raised four interlocking concerns about the rigor of the current submission:

1. **Evaluation metrics** — the work as it stands describes the recommendation engine and the computer-vision pipeline but does not report *Accuracy, Precision, Recall, F1*, or any other standard ML-evaluation numbers. A thesis-grade contribution needs measurable, reproducible quality claims.
2. **Keras model** — the runtime uses TensorFlow.js for inference, but the reviewer wants to see a clear story for how the underlying models *could be trained, fine-tuned, or replaced* in a Python/Keras ecosystem. The implicit point: don't conflate runtime choice (browser-side TF.js) with model-development methodology (Keras + experiment tracking + reproducible training).
3. **Hugging Face / Kaggle datasets** — the project asserts behavior about fashion style, body silhouette, and palette matching without grounding it in any benchmark dataset. Hugging Face and Kaggle host datasets relevant to all three (DeepFashion, ANSUR II–derivatives, polished fashion-tagged image sets) and the thesis should at minimum *cite and design experiments against* one or more of them.
4. **Real-world data from Trendyol** — the in-app catalog is a 36-product seed. A defensible thesis needs to show the system works on a *real e-commerce catalog* with the size charts, photos, descriptions, and review distributions that imply. Trendyol — Turkey's largest apparel marketplace, with a public catalog and structured size data — is the concrete recommendation.

This document addresses all four. It also documents the **TF.js cold-start performance fix** that ships in the same patch, since that was an immediate ask in the same review pass.

---

## 2. Performance: TensorFlow.js Load Time

### 2.1 Diagnosis

The reviewer (and the user testing the build) observed that the camera step takes "a long while" to become usable. Tracing through the code:

- **TF.js core + WebGL backend** — ~2 MB chunk download, ~1.5 s shader compile + WebGL context init on first use.
- **`pose-detection` package** — ~1.2 MB JS chunk.
- **`face-landmarks-detection` + MediaPipe FaceMesh weights** — ~3 MB.
- **MoveNet Lightning model weights** — ~3 MB.
- **MoveNet Thunder model weights** — ~5 MB.

That's ~14 MB on cold cache, plus initialization overhead. On a mid-range laptop with a warm cache the total time to "ready for inference" was ~5 s; on a cold cache it was 9–12 s. All of it was happening **after** the user clicked "Use camera," with no progress feedback.

The pre-fix code also had a redundancy bug: each `loadXDetector()` independently did `tf.setBackend("webgl")` + `tf.ready()`, so the backend init cost was effectively paid twice (once for the live Lightning detector, once for the Thunder capture detector).

### 2.2 Fix Applied

Three structural changes in [`landmarks.js`](../../crwn-clothing-fe/src/routes/onboarding/inference/landmarks.js):

1. **Single `initBackend()` promise.** All three detector loaders now `await initBackend()` first. The backend boots exactly once across the lifetime of the page.

2. **`prewarmDetectors({ onProgress })` helper.** Idempotent, fires off all three detector loads in series with a progress callback. Safe to call multiple times — re-entry just resolves immediately because the inner promises are cached.

3. **Pre-warming on Camera-step mount** ([`capture-step.jsx`](../../crwn-clothing-fe/src/routes/onboarding/steps/capture-step.jsx)). A `useEffect` fires `prewarmDetectors()` the moment the user lands on the camera step — *before* they've decided whether to use camera, upload, or skip. While they're reading the three permission cards (typically 3–10 s of dwell time), the models stream in the background. The status note below the cards updates from "Preparing AI models (backend)…" → "(live-pose)…" → "(face)…" → "(pose)…" → "✓ AI models ready — capture will be instant."

### 2.3 Expected Impact

| Scenario | Before | After |
|----------|--------|-------|
| Cold cache, immediate click | 9–12 s wait | 9–12 s wait (unavoidable on first visit) |
| Cold cache, 5–10 s read time | 9–12 s wait after click | 0–3 s after click (warmup overlaps with reading) |
| Warm cache, immediate click | 4–6 s wait | 4–6 s wait |
| Warm cache, 5–10 s read time | 4–6 s wait after click | ~0 s after click |
| Returning visitor (model cached in IndexedDB by TF.js) | 2–4 s wait after click | ~0 s after click |

The pre-warm doesn't make the bytes load faster — it makes them load **during downtime** the user wasn't using anyway.

### 2.4 Measurement Plan for Thesis

For the thesis writeup, instrument the wizard with `performance.mark()` / `performance.measure()` and report:

- Backend init time (median + p95)
- Per-detector load time (cold, warm)
- Time-to-first-inference (TTFI) on the live preview loop
- Frame budget under steady state (target: 95 ms / 10 FPS)

A small `tf.env().getNumOfBytesInGPU()` snapshot before and after warmup quantifies the GPU memory footprint (typically 30–60 MB).

---

## 3. Evaluation Framework

The work has four ML-flavored components, each of which is evaluable with different metric families. The reviewer's specific mention of **Accuracy, Precision, Recall** plus the implicit need for **F1** and regression metrics maps as follows.

### 3.1 What We're Evaluating

| Component | Output type | Metric family |
|-----------|-------------|---------------|
| Pose keypoint detection (MoveNet) | 17 2D points + per-keypoint score | Localization (PCK, OKS) + per-class recall |
| Face landmark detection (FaceMesh) | 468 3D points + confidence | Localization (NME) |
| Body measurement derivation (cm) | Continuous numeric (7 measurements) | Regression: MAE, RMSE, R² |
| Body shape classification | 5-class categorical (`hourglass`, `inverted-triangle`, `triangle`, `oval`, `rectangle`) | Classification: Accuracy, per-class Precision/Recall/F1, confusion matrix |
| Palette bucket classification | 6-class categorical (`warm`, `cool`, `neutral`, `earth`, `jewel`, `monochrome`) | Classification: Accuracy, per-class Precision/Recall/F1 |
| Size recommendation | Top-1 size from the product's chart | Ranking: Top-1 / Top-K Accuracy, MRR |
| Style preference influence on rank | Reordering quality | Ranking: NDCG@k, Spearman correlation with user-validated preference |

### 3.2 Classification Metrics — Definitions Applied to This Project

For each categorical output we report standard binary-classification-extended-to-multiclass:

**Accuracy** — the fraction of all predictions that exactly match the ground truth:

```
Accuracy = (TP + TN) / (TP + TN + FP + FN)
         = (number of correctly classified samples) / (total samples)
```

In the body-shape classifier, accuracy is simply: across N labeled people, how many did we put in the right bucket?

**Precision** (per class C) — "of everyone I predicted as class C, how many actually were?":

```
Precision(C) = TP(C) / (TP(C) + FP(C))
```

For "hourglass": if the model predicts 10 people as hourglass and 7 are correctly labeled hourglass, precision is 0.70.

**Recall** (per class C) — "of everyone who actually is class C, how many did I catch?":

```
Recall(C) = TP(C) / (TP(C) + FN(C))
```

If 12 people in the dataset are truly hourglass and we labeled 7 of them correctly, recall is 7/12 = 0.58.

**F1 (per class C)** — harmonic mean of precision and recall:

```
F1(C) = 2 · Precision(C) · Recall(C) / (Precision(C) + Recall(C))
```

We report **per-class P/R/F1** plus **macro-averaged** (unweighted average across classes — captures performance on minority classes) and **weighted-averaged** (weighted by class frequency — captures performance on common classes). Both are needed because the body-shape distribution is imbalanced: `rectangle` is much more common than `inverted-triangle`.

**Confusion matrix** — a 5×5 or 6×6 grid showing where misclassifications cluster. This is the most informative single artifact for a thesis defense — it tells the reader *which* class confusions are happening, which often suggests targeted fixes.

### 3.3 Regression Metrics — for Body Measurements

The pose-to-cm pipeline outputs continuous values. Standard metrics:

- **MAE (Mean Absolute Error)** — `mean(|predicted - true|)`. The single number every measurement-quality conversation lives or dies on. Industry target for apparel recommendation: ≤ 3 cm MAE on chest, waist, hip.
- **RMSE (Root Mean Squared Error)** — `sqrt(mean((predicted - true)²))`. Penalizes outliers more than MAE, which matters because a 10 cm error on hip is a return guarantee.
- **R²** — coefficient of determination, how much of the variance the model explains. Useful for validating that the pose-pixel-to-cm linear mapping is the right form.

Report per-measurement (chest, waist, hip, shoulder, inseam, height-check-back-against-input).

### 3.4 Ranking Metrics — for Size Recommendation

For each product the user later purchased (real-world validation set), did our model recommend the *actual* size they bought?

- **Top-1 Accuracy** — `mean(predicted_size == purchased_size)`.
- **Top-K Accuracy** — `mean(purchased_size ∈ top_K_predictions)`. We surface alternates in the `getRecommendedSize` output, so K=2 and K=3 are natural choices.
- **MRR (Mean Reciprocal Rank)** — `mean(1 / rank_of_correct_size)`. Rewards getting close even when first guess is wrong.
- **NDCG@k (Normalized Discounted Cumulative Gain)** — for the "Picked for you" home rail, which orders products. If the user later interacts with rank-2 product more than rank-1, NDCG penalizes us.

### 3.5 Pose-Specific Metrics

The COCO Keypoint benchmark uses two metrics worth borrowing wholesale:

- **PCK (Percentage of Correct Keypoints)** — a keypoint is "correct" if its predicted location is within a threshold τ of the ground truth (commonly τ = 0.2 · head_segment_length, or τ = 50 px on a 720×960 capture). Report PCK@τ.
- **OKS (Object Keypoint Similarity)** — Gaussian-weighted distance, normalized by object scale. The official COCO metric and what MoveNet papers report.

The published MoveNet Lightning OKS is ~0.65 on COCO val; Thunder is ~0.75. We won't beat those numbers; our job is to *show our wrapper preserves them* and confirm the post-pipeline body-shape and measurement accuracy is what we expect given the underlying detector quality.

---

## 4. Metric → System Component Mapping

The single most useful artifact for a thesis defense: a one-page table the committee can read in 30 seconds.

| Component | Inputs | Outputs | Primary metric | Secondary | Target |
|-----------|--------|---------|----------------|-----------|--------|
| MoveNet pose detection | 720×960 video frame | 17 keypoints | PCK@0.2 | OKS | ≥ 0.85 PCK |
| FaceMesh face landmarks | 720×960 still | 468 points + confidence | NME | per-region MAE | ≤ 5% NME |
| `inferMeasurementsFromPose` (cm) | pose + user height | chest, waist, hip, shoulder, inseam | MAE per measurement | RMSE, R² | ≤ 3 cm chest/waist/hip MAE |
| `inferBodyShape` classifier | shoulder/hip/waist | 5-class label | Accuracy | per-class F1, confusion matrix | ≥ 0.70 macro-F1 |
| `inferStyleFromImage` (palette) | captured image | 6-class bucket | Accuracy | per-class F1 | ≥ 0.65 macro-F1 |
| `getRecommendedSize` | profile + product chart | Top-1 size | Top-1 Accuracy | Top-2 Acc., MRR | ≥ 0.65 Top-1 |
| `scoreProductPreferences` | profile + product tags | float 0–1 | NDCG@10 vs. user-validated preference | rank correlation | ≥ 0.60 NDCG@10 |
| Home "Picked for you" rail | full catalog + profile | top-4 ranking | NDCG@4 vs. click-through preference | hit rate @ 4 | ≥ 0.70 NDCG@4 |

The "Target" column is the **defensible thesis claim**: hit this on the validation set and the work is reportable.

---

## 5. Keras Training Pipeline (Conceptual)

The reviewer's mention of "Keras model" is a hint that the thesis needs to clearly separate two ML concerns:

- **Runtime / inference** — what the production app does. Browser-side TensorFlow.js, designed for low-latency, privacy-preserving local inference.
- **Model development / training** — how the model came to exist. This belongs in a Python notebook with Keras (or its parent, TensorFlow's Python API), with proper dataset splits, training loops, experiment tracking, and exported artifacts.

The current implementation skips the second part entirely — we use *pre-trained* MoveNet and FaceMesh from the TF.js model zoo. That's defensible (these are strong baseline models), but a thesis needs a story for what training and adaptation would look like.

### 5.1 Why TF.js for Inference, Keras for Training

| Constraint | Why it picks the tool |
|-----------|-----------------------|
| Privacy: body photo must not leave the device | TF.js, in-browser inference |
| Latency: live skeleton at ~10 FPS | TF.js + WebGL, on user's GPU |
| No server ML cost per request | TF.js, free per request after model download |
| Training new models requires GPU + large datasets | Keras / TF Python on Colab or Kaggle Notebooks |
| Experiment tracking, hyperparam sweeps, reproducibility | Keras + Weights & Biases or MLflow |
| Export pipeline to TF.js for deployment | `tensorflowjs_converter` from Keras `.h5` or SavedModel |

The natural division: train in Keras, evaluate against a held-out test set with the metrics above, freeze and export to TF.js for the browser. This is the standard ML deployment workflow.

### 5.2 A Trainable Model Architecture (Sketch)

The component most worth training from scratch is the **body measurement regression head** — the part that maps pose keypoints + user height to centimeters. We currently hand-coded coefficients from anthropometric tables (`shoulderCm = ratios.shoulderPx * cmPerPx * 1.18`). A Keras model could learn these:

```python
# Conceptual — would live in a separate Python repo with the training data.
from tensorflow import keras
from tensorflow.keras import layers

def build_measurement_model(num_keypoints=17):
    # Inputs: 17 (x, y, score) triples + 1 scalar (user height in cm).
    pose_input = keras.Input(shape=(num_keypoints, 3), name="pose")
    height_input = keras.Input(shape=(1,), name="height_cm")

    # Flatten pose keypoints + concatenate with height.
    x = layers.Flatten()(pose_input)
    x = layers.Concatenate()([x, height_input])

    # Small MLP. The relationship is largely affine in the right basis,
    # so we don't need depth — we need regularization.
    x = layers.Dense(64, activation="relu")(x)
    x = layers.Dropout(0.2)(x)
    x = layers.Dense(32, activation="relu")(x)

    # Six outputs: shoulder, chest, waist, hip, inseam, weight (optional).
    outputs = layers.Dense(6, name="measurements_cm")(x)

    model = keras.Model([pose_input, height_input], outputs)
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss="mae",                                # Mean Absolute Error
        metrics=["mae", keras.metrics.RootMeanSquaredError()],
    )
    return model
```

Training loop:

```python
model = build_measurement_model()
history = model.fit(
    train_data,                                    # (pose, height) → measurements
    validation_data=val_data,
    epochs=50,
    batch_size=32,
    callbacks=[
        keras.callbacks.EarlyStopping(patience=5, restore_best_weights=True),
        keras.callbacks.ModelCheckpoint("measurement_model.h5", save_best_only=True),
    ],
)
```

Evaluation:

```python
test_loss, test_mae, test_rmse = model.evaluate(test_data)
print(f"Test MAE: {test_mae:.2f} cm, RMSE: {test_rmse:.2f} cm")
```

Then `tensorflowjs_converter --input_format=keras measurement_model.h5 ./tfjs_model` produces an artifact we drop into the existing TF.js inference path.

### 5.3 What This Gets Us

- **Quantifiable improvement claim**: "the hand-coded coefficients achieved X cm MAE; the learned model achieved Y cm." Y < X is the defensible thesis result.
- **Per-sub-population analysis**: report MAE broken down by gender, BMI bucket, age band. Hand-coded coefficients have known underperformance on certain populations (e.g. underestimating chest for women with high BMI); a learned model fits these explicitly.
- **Confidence intervals**: bootstrap the test set to put error bars on MAE. A thesis with `3.1 ± 0.4 cm` is more defensible than `3.1 cm`.

### 5.4 What Could Stay Pre-Trained

The pose and face detectors (MoveNet, FaceMesh) are absolutely fine off-the-shelf — re-training those is a 6-month project of its own and isn't novel. The thesis story can be:

> *We use pre-trained MoveNet (95M params, OKS 0.75 on COCO val) and FaceMesh (1M params, NME 4% on indoor 300W) as fixed feature extractors. The novel contribution is the learned head that maps pose keypoints + user height to garment-relevant body measurements, plus the recommendation pipeline that consumes those measurements.*

That's a clean, scoped contribution that doesn't overclaim.

---

## 6. Datasets

### 6.1 Pose Detection Benchmarks (No Training Required, Use for Eval)

- **COCO Keypoints** ([cocodataset.org/#keypoints-2020](https://cocodataset.org/#keypoints-2020)) — the standard pose benchmark. 250K labeled people, 17 keypoints. We use the val set to confirm MoveNet's published OKS holds in our wrapper.
- **MPII Human Pose** ([human-pose.mpi-inf.mpg.de](http://human-pose.mpi-inf.mpg.de)) — 25K images, full activity coverage. Used for PCK@0.5 reporting.

These are **evaluation-only** for our purposes — we don't retrain pose detectors.

### 6.2 Anthropometric Datasets (Train the Measurement Head)

- **ANSUR II (Anthropometric Survey of US Army Personnel 2012)** — ~6,000 men, ~4,000 women, 132 measurements per person, full-body landmarks. Public, no PII. Available via Open Anthropometric Data on Kaggle.
- **CAESAR (Civilian American and European Surface Anthropometry Resource)** — 4,400 subjects, 3D scans + measurements. Smaller but more recent and includes 3D body shapes.
- **SizeUSA / SizeUK** — civilian surveys, less public but procurable.

For training the Keras measurement head: pair each ANSUR II subject's known measurements with a synthesized "pose" derived from their 3D scan (project to 2D from a frontal camera angle, extract the 17 COCO-style keypoints). This generates `(pose, height) → measurements` training pairs in arbitrary quantity.

### 6.3 Fashion Datasets (Style + Palette Validation)

Available on Hugging Face Hub:

- **DeepFashion** ([huggingface.co/datasets/DeepFashion](https://huggingface.co/datasets/lirus18/deepfashion-multimodal) and mirrors) — 800K images, attribute labels for category, fabric, shape, part style. The canonical fashion benchmark.
- **DeepFashion2** — 491K images with 13 categories, pose keypoints, segmentation masks. Better for matching products to silhouette.
- **Fashion-MNIST** (`huggingface.co/datasets/fashion_mnist`) — 70K low-res images, 10-class clothing categories. Toy-scale but good for sanity-checking palette classifiers.
- **iMaterialist Fashion** — Kaggle-hosted fashion attribute competition data with ~228 attributes per image. Useful for training a product-tagging model that augments our hand-curated `recommendationTags`.

Available on Kaggle:

- **H&M Personalized Fashion Recommendations** ([kaggle.com/competitions/h-and-m-personalized-fashion-recommendations](https://www.kaggle.com/competitions/h-and-m-personalized-fashion-recommendations)) — 1.3M articles, 1.4M users, full transaction history. **This is the canonical academic recommendation-system dataset for fashion** and the right place to compute NDCG@10 against industry baselines.
- **Polyvore Outfits** — 21K outfits curated by users, with item-to-item compatibility labels. Useful for validating style coherence (does the user's silhouette match the recommended item's silhouette?).

### 6.4 Why These Specifically

For the thesis's three claims:

| Claim | Validating dataset |
|-------|--------------------|
| "Pose detection works in-browser at acceptable accuracy" | COCO Keypoints val |
| "Pose + user height → measurements with MAE ≤ 3 cm" | ANSUR II (synthetic pose), held-out test split |
| "Body shape classifier achieves ≥ 0.70 macro-F1" | ANSUR II measurements → shape labels via published industry rules, held-out test split |
| "Palette bucket classifier works on fashion photography" | DeepFashion, with human-labeled palette buckets on a sub-sample |
| "Size recommendation Top-1 accuracy ≥ 0.65" | H&M Personalized Fashion Recommendations |
| "Style preferences influence rank meaningfully" | DeepFashion + user-validated preference questionnaire |

### 6.5 Real-World Validation: Trendyol

The reviewer's specific call-out — **Trendyol** ([trendyol.com](https://www.trendyol.com)) — is the right benchmark for a **real e-commerce catalog**. The H&M competition data is comprehensive but is curated, cleaned, and from one retailer. Trendyol is messier and broader, which makes it harder and more defensible.

Why Trendyol specifically:

- Turkey's largest apparel marketplace, 30M+ active users, 250K+ apparel SKUs across categories from kids to plus-size.
- **Public size charts in structured form** — every product page has a normalized `bodyMeasurements` table with chest, waist, hip, length in cm per size. This is the input our `sizeChartJson` was designed for; it imports directly with no manual cleanup.
- **Review data** — each product has thousands of user reviews including the explicit "size fits true / runs small / runs large" tag and the size the reviewer purchased. This is **labeled training data for the size recommendation engine**, free.
- **Multi-brand coverage** — 30K+ brands, each with idiosyncratic sizing. Tests whether the recommendation generalizes beyond H&M-style consistent sizing.
- **Image consistency** — product photos are on white backgrounds with consistent framing, which makes palette extraction much more reliable than DeepFashion's "in the wild" photos.

#### 6.5.1 Proposed Trendyol Validation Pipeline

1. **Crawl ~5,000 products** across the four CRWN categories (Shirts & Tops, Pants & Bottoms, Outerwear, Accessories), using their public API or polite scraping with `robots.txt` compliance and a 1-req/s rate limit.
2. **Extract structured size charts** into the same JSONB shape we already use (`{ size, chestCm, waistCm, hipCm, inseamCm }`).
3. **Extract review-tagged fit data**: for each product, sample 50 reviews that include both the reviewer's body measurements (in their profile) and the size they purchased.
4. **Build a held-out test set**: (reviewer_measurements, product_chart) → known_correct_size pairs.
5. **Compute Top-1 / Top-2 / Top-3 Accuracy** of our `getRecommendedSize` against this test set.
6. **Compute MAE on cross-fit-system measurement transfer** — does an ANSUR II–trained measurement model produce metrics that match Trendyol-tagged "fits true" purchases?
7. **Report per-category breakdown**. We hypothesize accessories (one-size-dominant) will score near-perfect; tops will score middle; bottoms will be hardest (waist + inseam two-dimensional).

This pipeline is **the** defensible thesis validation. It uses real catalog data, real user purchase outcomes, and standard ranking metrics. The reviewer's instinct is correct: until this exists, the system's quality claims are essentially anecdotes.

#### 6.5.2 Ethical & Legal Considerations

- Respect `robots.txt`, rate-limit, identify the scraper user-agent, and don't republish images.
- Strip personally-identifying review information.
- Use the data only for academic evaluation. The full dataset is not redistributed.
- An academic-use request to Trendyol's data team (this is how H&M's dataset originated) is the cleaner path if the timeline allows.

---

## 7. Validation Plan

### 7.1 Component-Level Evaluation

Each component above gets a small notebook in a `evaluation/` folder, runnable on Colab or Kaggle Notebooks. Each notebook:

1. Loads the relevant dataset (COCO val, ANSUR II, DeepFashion, H&M, Trendyol).
2. Runs the corresponding pipeline component (calls into the FE's JS via a Node-side TF.js port, or re-implements the same logic in Python for batch evaluation).
3. Computes the metrics from §3.
4. Outputs a JSON results file + a confusion matrix figure.

This gives the thesis chapter exactly the numbers it needs to defend the work.

### 7.2 End-to-End User Study Design

A 20-person within-subjects study to evaluate the **shopper-facing claims** that aren't captured by offline metrics:

- **Recruit**: 20 participants with varied body types and shopping experience.
- **Setup**: each goes through the 5-step wizard, then completes two shopping tasks (one with a specific item type in mind, one open-browse).
- **Conditions**: A/B — half use the fit-aware version (recommendation engine on), half use a placebo version (recommendations replaced with random ranking).
- **Outcomes measured**:
  - Time-to-add-to-cart (efficiency)
  - Number of products viewed before adding (decision quality)
  - Self-reported confidence in size selection (5-point Likert)
  - Post-task interview: "Did the recommended size feel right?"
- **Analysis**: paired t-test on continuous outcomes, McNemar's test on binary outcomes (correct/incorrect size). Pre-registered hypothesis: fit-aware reduces time-to-add by ≥ 20% and increases self-reported size confidence by ≥ 1 point on the 5-point scale.

### 7.3 Statistical Significance & Baselines

For every claim, report:

- The metric value.
- A 95% confidence interval (bootstrap with 1000 resamples).
- A baseline comparison. For size recommendation: against (a) random size guess, (b) modal size from the product's chart, (c) "fits true" reviewers' modal size. The thesis claim is "we beat all three baselines significantly (p < 0.05)."

---

## 8. Concrete Next Steps for the Thesis Writeup

Ordered for impact-per-week:

1. **Run COCO Keypoint OKS evaluation** on the deployed MoveNet wrapper. Confirm we preserve the published numbers. (1–2 days, one notebook.)
2. **Process ANSUR II into a training set** for the measurement head. (3–4 days.)
3. **Train the Keras measurement model**, report MAE per measurement, compare to the hand-coded coefficient baseline. (1 week.)
4. **Build the body-shape classifier evaluation** on ANSUR II–derived labels. Confusion matrix + per-class F1. (3 days.)
5. **Trendyol catalog crawl** (~5K products, polite rate). (1 week, mostly waiting on rate-limit.)
6. **Trendyol size recommendation evaluation** — Top-1 / Top-2 / Top-3 against review-tagged ground truth. **This is the highest-value single deliverable.** (3–4 days, depends on crawl completing.)
7. **DeepFashion-validated palette classifier** with per-class F1. (3 days.)
8. **H&M ranking evaluation** for the home rail, with NDCG@10 against industry baselines from the public competition leaderboard. (1 week.)
9. **20-person user study** — IRB if required, recruit, run, analyze. (2–3 weeks.)
10. **Write up.**

Steps 1–6 are the technical evaluation chapter (or chapters). Steps 7–9 round out the contribution claims. Step 10 is what we already have a draft of in [THESIS.md](THESIS.md), enriched by the numbers from 1–9.

---

## 9. Bibliography & Tools

### 9.1 Datasets

- COCO Keypoints — Lin et al., *Microsoft COCO: Common Objects in Context*, ECCV 2014.
- MPII Human Pose — Andriluka et al., *2D Human Pose Estimation: New Benchmark and State of the Art Analysis*, CVPR 2014.
- ANSUR II — *2012 Anthropometric Survey of U.S. Army Personnel*, Natick Soldier Research, Development and Engineering Center.
- CAESAR — *Civilian American and European Surface Anthropometry Resource Project*, SAE International, 2002.
- DeepFashion — Liu et al., *DeepFashion: Powering Robust Clothes Recognition and Retrieval with Rich Annotations*, CVPR 2016. Hugging Face mirrors available.
- DeepFashion2 — Ge et al., *DeepFashion2: A Versatile Benchmark for Detection, Pose Estimation, Segmentation and Re-Identification of Clothing Images*, CVPR 2019.
- H&M Personalized Fashion Recommendations — Kaggle competition 2022, hosted by H&M Group.
- Polyvore Outfits — Han et al., *Learning Fashion Compatibility with Bidirectional LSTMs*, ACM MM 2017.

### 9.2 Models

- MoveNet — Bazarevsky et al., *BlazePose: On-device Real-time Body Pose Tracking*, CVPR Workshops 2020 (related architecture); model published in TF.js Model Garden.
- MediaPipe FaceMesh — Kartynnik et al., *Real-time Facial Surface Geometry from Monocular Video on Mobile GPUs*, CVPR Workshops 2019.

### 9.3 Metrics

- COCO OKS — *MS COCO Keypoint Evaluation*, [cocodataset.org/#keypoints-eval](https://cocodataset.org/#keypoints-eval).
- NDCG — Järvelin & Kekäläinen, *Cumulated gain-based evaluation of IR techniques*, ACM TOIS 2002.
- F1 / macro-F1 — Manning, Raghavan, Schütze, *Introduction to Information Retrieval*, Cambridge, 2008.

### 9.4 Tools

- TensorFlow 2 / Keras (Python) — for training.
- TensorFlow.js — for in-browser inference.
- `tensorflowjs_converter` — Keras → TF.js bridge.
- Weights & Biases — experiment tracking.
- Hugging Face Datasets — `pip install datasets`, `load_dataset("...")` calls map 1:1 onto the datasets in §6.
- Kaggle Notebooks — free GPU for training the measurement head; H&M dataset is hosted there.
- scikit-learn `classification_report` and `confusion_matrix` — for §3 metrics.

---

## 10. Reviewer-Concern → Deliverable Map (for the Defense)

Bring this single table to the defense. Each row is a one-line summary the committee can verify.

| Reviewer concern | What's in the codebase | What's in this document | What runs to produce the numbers |
|------------------|------------------------|--------------------------|-----------------------------------|
| Accuracy / Precision / Recall / F1 | n/a — no eval yet | §3 framework, §4 mapping table, §7 plan | §8 steps 1, 3, 4, 7 |
| Keras training pipeline | n/a — we use pre-trained models | §5 sketch with code example | §8 steps 2–3 (training the measurement head) |
| Hugging Face / Kaggle datasets | n/a | §6.1–§6.4 explicit dataset list with thesis-claim mapping | §8 steps 1, 4, 7, 8 |
| Trendyol real-world validation | n/a | §6.5 pipeline design, ethical considerations | §8 steps 5–6 |
| TF.js cold start | Fixed in this patch: `prewarmDetectors`, `initBackend`, mount-time warmup | §2 with measurement plan | `performance.mark()` instrumentation in capture-step |

Each "n/a" in the second column is a piece of work scheduled in §8. The defense reads as: *"Here's what's in the code now. Here's our plan for the evaluation chapter. Here are the specific datasets, metrics, and notebooks we'll run."* That's a defensible response to every point the reviewer raised.

---

*This document is intended as the foundation of the thesis's evaluation chapter and the response artifact to the reviewer's feedback. The companion documents — [THESIS.md](THESIS.md) for the project narrative and [CHANGES.md](CHANGES.md) for this implementation phase — together with this file constitute the full written submission.*
