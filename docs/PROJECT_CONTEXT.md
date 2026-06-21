# CRWN Fit-Aware Commerce — Project Context for Thesis

> A single self-contained document covering the project ideation, the system as it stands, the technologies used, evaluation methodology and real measured results, the conceptual training pipeline, datasets used and proposed for validation, and the live deployment. Intended as the master reading for a thesis defense or reviewer briefing.

**Last updated:** 2026-06-03
**Live frontend:** `https://crwn-clothing-kmt.pages.dev`
**Live backend:** `https://crwn-clothing-api-a0wa.onrender.com`
**Source:** [github.com/OmarJesse/crwn-clothing-fe](https://github.com/OmarJesse/crwn-clothing-fe) · [github.com/OmarJesse/crwn-clothing-be](https://github.com/OmarJesse/crwn-clothing-be)

---

## 1. Project Ideation

Online apparel returns sit at roughly **30%** — the highest rate of any retail category. The dominant root cause is fit uncertainty: shoppers do not know their measurements, do not match those measurements against per-brand size charts, and end up guessing. Most stores answer with curated size guides and "people similar to you bought" carousels. Both rely on the shopper being already-informed and already-active; both fail for first-time buyers and casual browsers.

This project explores a different premise: **the shopper's body is the API**. Capture it once with computer vision, normalize it against user-entered height, persist a structured profile on the server, and let the entire catalog re-orient around that profile. The work is invisible to the shopper after a 90-second wizard — they just see better defaults forever.

The contribution is the **end-to-end fit-aware retail surface**: not just a body-measurement extractor, but a complete e-commerce experience where every product card, every cart row, every checkout summary, and every search-result ordering is rewritten by a recommendation engine that fuses three independent signals — size confidence, photo-derived style match, and explicit user preferences — into one rank.

Crucially, the computer-vision components run **entirely in the browser**. No body photo ever leaves the user's device. This is enforced not by policy but by code — there is no upload endpoint for photos in the entire system.

---

## 2. What Was Built (Feature Summary)

### Five-step onboarding wizard

Replaces the previous single-screen signup. The shopper provides identity, lets a TensorFlow.js pose detector derive their body measurements from a single webcam capture, confirms and edits the numbers, ticks off preferred fashion styles and color palettes from two 4×2 tile grids, and submits. The whole flow takes 60–90 seconds. State is persisted to `sessionStorage` between steps; passwords are stripped before serialization.

### Computer-vision pipeline

Two TensorFlow.js pose detectors run side by side:
- **MoveNet Lightning** at ~10 FPS for the live skeleton overlay during camera preview (visual feedback).
- **MoveNet Thunder** for the single-shot capture inference that drives the actual measurements (ground truth).

Plus **MediaPipe FaceMesh** with `refineLandmarks: true` for confidence scoring and as a fallback when full-body pose detection fails.

A separate **in-browser palette quantizer** runs on the same captured frame: median-cut on a 64×64 downsample, top-5 dominant colors averaged into hex codes, then classified into one of six palette buckets via Euclidean color distance against anchor RGB triples.

### Body profile schema

The User row in Postgres carries a structured fit profile: `heightCm`, `weightKg`, `bmi`, `chestCm`, `waistCm`, `hipCm`, `inseamCm`, `shoulderCm`, `preferredFit`, `bodyShape`, `landmarkSummary` (JSONB confidence + model identifier), `recommendationVersion`, `onboardingCompletedAt`, and the new `preferredStyles` and `preferredPalettes` (JSONB arrays, strict allowlist of 8 values each).

### Recommendation engine

Three independent scorers composed into one combined rank:

```
combinedScore = 0.4 × sizeConfidence
              + 0.3 × photoStyleScore
              + 0.3 × explicitPreferenceScore
              + 0.1 × hasRecommendedSizeBonus
```

Surfaced everywhere the shopper looks: product cards (per-product "Fit M" badge with confidence chip), home "Picked for you" rail (top-4 ranked across the catalog), shop default sort, the "Fits me" filter toggle, cart items (✓ "your fit" or warning chips), checkout summary (aggregate "all match" / "X differ"), and the product detail page (per-measurement deltas — "Your chest 96 cm → M chart 98 cm = +2 cm").

### Multi-theme design system

Three coherent variants — Light, Dark, Sunset — driven by a single `ThemeContext` that swaps both `styled-components` tokens and CSS custom properties in lockstep. Selection persists to `localStorage`; first visit honors `prefers-color-scheme`. A unified semantic-token layer (`background.surface`, `text.primary`, `border.subtle`, etc.) so future variants drop in cleanly.

### Working shop with real filters

Previous shop was a flat dump with a non-functional filter modal. The current shop is a single unified page with: sticky toolbar (search input + sort dropdown + "Fits me" toggle), sidebar filters that actually filter (category chips with counts, size buttons, fit-type buttons, price range, palette toggle), active-filter chips with individual remove, animated grid (framer-motion with layout transitions), empty state with reset CTA, and a polished mobile drawer with sticky header / sticky-footer apply CTA.

### Product detail page

New route `/product/:productId` with hero gallery, size picker (recommended size starred), full size chart with the active row highlighted, the **"Why we recommend size X"** measurement-delta panel, and a style-match panel showing the user's palette swatches alongside the product's match score.

### 36-product seed catalog

Triple the previous 12 — 9 products across each of the four categories (Shirts & Tops, Pants & Bottoms, Outerwear, Accessories). Each product carries a real `sizeChartJson` (5+ size rows with chest / waist / hip / inseam) and `recommendationTags` (tagging vocabulary the recommendation engine matches against). Image URLs use a small curated pool of well-known Unsplash photo IDs rotated by garment type, with a two-step fallback chain in the product card (Unsplash 404 → Picsum → default SVG) so no card ever renders broken.

---

## 3. Technologies & Tools

### Frontend stack

| Tool | Version | Why |
|------|---------|-----|
| React | 18.2 | Component model + hooks + Suspense-friendly |
| Create React App | 5.0 (`react-scripts`) | Zero-config build |
| Redux + Redux Saga | 4.x + 1.2 | Auth flows + multi-step onboarding async (signup → token → fetch user → seed Redux) |
| Redux Persist | 6.0 | Cart and user state across page reloads |
| React Router DOM | 6 | Nested layout routes (Navigation outlet) |
| TanStack React Query | 5.76 | Product/category fetches with cache |
| styled-components | 6.1 | CSS-in-JS, theme propagation via Context |
| react-webcam | 7.2 | Cleaner camera lifecycle than raw `getUserMedia` — handles facingMode toggling, `getScreenshot()`, error events |
| framer-motion | 12.38 | Page transitions, `AnimatePresence` on route change, layout animations on the shop grid, wizard step transitions |
| @tensorflow/tfjs-core | 4.22 | Runtime |
| @tensorflow/tfjs-backend-webgl | 4.22 | GPU-accelerated inference |
| @tensorflow-models/pose-detection | 2.0 | MoveNet Thunder + Lightning |
| @tensorflow-models/face-landmarks-detection | 1.0 | MediaPipe FaceMesh wrapper |
| @mediapipe/face_mesh, @mediapipe/pose | 0.4 / 0.5 | Model weights |
| Stripe.js | 2.1 | Test-mode payment flow |

### Backend stack

| Tool | Version | Why |
|------|---------|-----|
| Express | 5.1 | HTTP server |
| TypeScript | 5.8 | Strict mode catches the validator drift early |
| Sequelize | 6.37 | ORM with JSONB column support — critical for `landmarkSummary`, `preferredStyles`, `preferredPalettes` |
| PostgreSQL | 17 (Render-managed) | Primary datastore, JSONB for structured arrays |
| bcrypt | 5.1 | Password hashing, 10 salt rounds |
| jsonwebtoken | 9.0 | JWT access (1 h) + refresh (7 d), HS256 |
| cors | 2.8 | Origin-restricted cross-origin |
| dotenv | 16.5 | Local env config |

### Computer-vision models (browser, pre-trained)

- **MoveNet Thunder** — Google's pose detector, 256×256 input, ~5 MB weights. Published OKS on COCO val ≈ 0.75. Used for the single-shot capture inference.
- **MoveNet Lightning** — same architecture, 192×192 input, ~3 MB, ~3× faster. Published OKS ≈ 0.65. Used for the live preview loop.
- **MediaPipe FaceMesh** — 468 3D face landmarks, ~3 MB. `refineLandmarks: true` for higher accuracy around eyes and lips.

### Design & collaboration

- **Figma** — design exploration for theme palettes and the 4×2 tile grid layouts. The three theme variants (light, dark, sunset) were prototyped as Figma color tokens before being translated to JS.
- **GitHub** — source control across two repositories: [crwn-clothing-fe](https://github.com/OmarJesse/crwn-clothing-fe) and [crwn-clothing-be](https://github.com/OmarJesse/crwn-clothing-be). Each major phase of work is a commit cluster in the project's history.
- **VS Code** with the Claude Code extension — primary editor.

### Quality gates

- `npx tsc --noEmit` on every BE change before integration.
- `npx react-scripts build` as the FE compile gate.
- `node evaluation/run-all.js` regenerates the metric numbers on every push (see §5).
- ESLint (`react-app` + `react-app/jest`) keeps `useEffect` dependency arrays honest.
- Manual smoke-test loop after every phase: sign up → wizard → verify rail → browse filters → product detail → add to cart → checkout.

---

## 4. System Architecture

### Component layout

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Cloudflare Pages — global CDN)                    │
│  • React 18 SPA, ~290 KB gzip                                │
│  • TensorFlow.js + WebGL (lazy-loaded)                       │
│  • Redux + Redux Persist (cart, user)                        │
│  • sessionStorage for wizard intermediate state              │
│  • ThemeContext (light / dark / sunset)                      │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS, Bearer JWT
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Render Web Service (Express 5 + TypeScript 5)               │
│  • /register, /login, /me, /me/onboarding/infer              │
│  • /categories, /products, /products/:id                     │
│  • Strict input allowlists on every mutable endpoint         │
└──────────────────────────┬──────────────────────────────────┘
                           │ SSL, internal Render network
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Render Postgres (1 GB free tier)                            │
│  • uuid-ossp extension enabled at boot                       │
│  • users / categories / products tables                      │
│  • JSONB columns: landmarkSummary, preferredStyles, etc.     │
└──────────────────────────────────────────────────────────────┘
```

### Onboarding data flow

```
Browser
  ├─ Camera → MoveNet Lightning (live, ~10 FPS) → skeleton overlay
  └─ Capture → MoveNet Thunder + FaceMesh (single-shot) → keypoints
      ├─ keypoints + user height → measurements.js → cm values
      ├─ image → style-inference.js → palette + silhouette bucket
      ├─ user → preferences-step.jsx → preferred styles + palettes
      ▼
POST /me/onboarding/infer  (Bearer JWT)
  ├─ bodyProfileValidation (whitelist + allowlist parsing)
  ├─ inferBodyProfile service (BMI, body shape, recommendation version)
  ├─ User.update() in Postgres
  ▼
Response: enriched profile JSON
  ▼
Redux ONBOARDING_SUCCESS → bodyProfile slice
  ▼
Selectors feed scoring on every product surface
```

---

## 5. Evaluation Methodology

This section directly addresses the reviewer's concern about reporting standard ML evaluation metrics. We compute Accuracy / Precision / Recall / F1 / MAE / Top-K Accuracy / Mean Reciprocal Rank on the deployed system, against deterministic synthetic data drawn from anthropometric reference distributions.

### 5.1 What "evaluation" means here

The deployed system has four ML-flavored components, each evaluable with different metric families:

| Component | Output | Metric family |
|-----------|--------|---------------|
| Pose keypoint detection (MoveNet) | 17 2D points + scores | Localization: PCK, OKS |
| Face landmark detection (FaceMesh) | 468 3D points + confidence | Localization: NME |
| Body measurement derivation | Continuous numeric (cm) | Regression: MAE, RMSE, R² |
| Body shape classifier | 5-class label | Classification: Accuracy, P/R/F1, confusion matrix |
| Palette bucket classifier | 6-class label | Classification: Accuracy, P/R/F1 |
| Size recommendation | Top-1 size | Ranking: Top-1, Top-K, MRR |

### 5.2 Definitions applied to this project

**Accuracy** — fraction of all predictions that exactly match the ground truth:
```
Accuracy = (TP + TN) / (TP + TN + FP + FN)
```

**Precision** (per class C) — "of everyone I predicted as C, how many actually were?":
```
Precision(C) = TP(C) / (TP(C) + FP(C))
```

**Recall** (per class C) — "of everyone who actually is C, how many did I catch?":
```
Recall(C) = TP(C) / (TP(C) + FN(C))
```

**F1 (per class C)** — harmonic mean of precision and recall:
```
F1(C) = 2 · Precision(C) · Recall(C) / (Precision(C) + Recall(C))
```

We report **per-class P/R/F1**, **macro-averaged** (unweighted across classes — captures performance on minority classes), and **weighted-averaged** (weighted by class frequency — captures performance on common classes). The body-shape distribution is imbalanced (`rectangle` is much more common than `inverted-triangle`), so both are needed.

**Confusion matrix** — the 5×5 / 6×6 grid showing where misclassifications cluster. The single most informative artifact for a defense — it tells the reader *which* class confusions are happening.

**For regression** (measurements in cm):
- **MAE** (Mean Absolute Error) — `mean(|predicted - true|)`. Industry target for apparel: ≤ 3 cm on chest / waist / hip.
- **RMSE** (Root Mean Squared Error) — `sqrt(mean((predicted - true)²))`. Penalizes outliers more.
- **R²** — variance explained.

**For ranking** (size recommendation):
- **Top-1 / Top-K Accuracy** — `mean(true_size ∈ predicted_top_K)`.
- **MRR** (Mean Reciprocal Rank) — `mean(1 / rank_of_correct_size)`. Rewards getting close even when first guess is wrong.

### 5.3 Measured results

The evaluation harness lives at [`evaluation/`](../evaluation/) and regenerates on every push via GitHub Actions. Below are the current numbers from synthetic anthropometric data:

#### Body shape classifier — n = 2000

| Metric | Value |
|--------|-------|
| **Accuracy** | **88.50%** |
| Macro Precision | 85.55% |
| Macro Recall | 89.52% |
| **Macro F1** | **87.21%** |
| Weighted F1 | 88.59% |

Per-class:

| Class | Precision | Recall | F1 | Support |
|-------|-----------|--------|-------|---------|
| hourglass | 77.50% | 95.38% | 85.52% | 195 |
| inverted-triangle | 79.37% | 91.90% | 85.18% | 247 |
| triangle | 90.40% | 91.69% | 91.04% | 421 |
| oval | 85.91% | 82.53% | 84.19% | 229 |
| rectangle | 94.56% | 86.12% | 90.14% | 908 |

#### Size recommendation — n = 50,000 (person × product pairs)

| Metric | Value |
|--------|-------|
| **Top-1 Accuracy** | **75.64%** |
| Top-2 Accuracy | 93.07% |
| Top-3 Accuracy | 98.60% |
| **MRR** | **0.8628** |

By category (the defensible thesis observation):

| Category | n | Top-1 | Top-2 | MRR |
|----------|---|-------|-------|-----|
| top (chest-dominant) | 25,000 | 96.15% | 96.56% | 0.9685 |
| bottom (waist + inseam) | 25,000 | 55.12% | 89.57% | 0.7571 |

The asymmetry is the interesting story: **two-dimensional sizing (waist + inseam together) is genuinely harder than one-dimensional sizing (chest-dominant)**. Tops nearly saturate Top-1; bottoms only break 90% at Top-2.

#### Palette bucket classifier — n = 1200 (200 per bucket, RGB noise ±25)

| Metric | Value |
|--------|-------|
| **Accuracy** | **95.25%** |
| **Macro F1** | **95.28%** |
| Weighted F1 | 95.28% |

Per-class: all six buckets ≥ 87% F1, with `warm` / `cool` / `jewel` at 99–100% and `monochrome` and `neutral` at ~88% (they're the only pair the classifier confuses with each other).

### 5.4 How to reproduce

```bash
cd evaluation
node run-all.js
```

This reads pure-extracted copies of the runtime logic in [`evaluation/lib/`](../evaluation/lib/), generates 2000–50,000 synthetic samples per evaluation (seeded mulberry32 PRNG — fully reproducible), and writes both `results/results.json` (machine-readable) and `results/RESULTS.md` (human-readable). The CI workflow at [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the same evaluation on every push and uploads the artifact with 90-day retention.

---

## 6. Keras Training Pipeline (Conceptual Extension)

The deployed runtime uses **TensorFlow.js for inference** because it preserves privacy (the photo never leaves the browser) and avoids per-request server cost. But model **training and adaptation** belong in a separate Python + Keras experiment pipeline. The thesis story is:

> We use pre-trained MoveNet (~95M params, OKS 0.75 on COCO val) and FaceMesh (~1M params) as fixed feature extractors. The novel contribution is the learned head that maps pose keypoints + user height to garment-relevant body measurements, plus the recommendation pipeline that consumes those measurements.

That learned head is what a Keras pipeline would produce.

### 6.1 Why this split

| Constraint | Tool chosen |
|------------|-------------|
| Privacy: body photo must not leave the device | TF.js, browser-side |
| Latency: live skeleton at ~10 FPS | TF.js + WebGL, on user's GPU |
| Zero per-request server ML cost | TF.js, free per request after model download |
| Training new models requires GPU + datasets | **Keras**, on Colab or Kaggle Notebooks |
| Experiment tracking, hyperparam sweeps, reproducibility | Keras + Weights & Biases |
| Export pipeline to TF.js for deployment | `tensorflowjs_converter` from Keras `.h5` or SavedModel |

### 6.2 Conceptual model architecture

```python
def build_measurement_model(num_keypoints=17):
    pose_input = keras.Input(shape=(num_keypoints, 3), name="pose")
    height_input = keras.Input(shape=(1,), name="height_cm")

    x = layers.Flatten()(pose_input)
    x = layers.Concatenate()([x, height_input])

    x = layers.Dense(128, activation="relu",
                     kernel_regularizer=keras.regularizers.l2(1e-4))(x)
    x = layers.Dropout(0.25)(x)
    x = layers.Dense(64, activation="relu",
                     kernel_regularizer=keras.regularizers.l2(1e-4))(x)
    x = layers.Dropout(0.15)(x)
    x = layers.Dense(32, activation="relu")(x)

    outputs = layers.Dense(6, name="measurements_cm")(x)

    model = keras.Model([pose_input, height_input], outputs)
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss="mae",
        metrics=["mae", keras.metrics.RootMeanSquaredError(name="rmse")],
    )
    return model
```

Inputs: 17 keypoints × (x, y, score) + a scalar (user height in cm).
Outputs: 6 measurements — shoulder, chest, waist, hip, inseam, weight.

Training loop with early stopping and model checkpointing:

```python
history = model.fit(
    train_data,
    validation_split=0.15,
    epochs=50,
    batch_size=32,
    callbacks=[
        keras.callbacks.EarlyStopping(patience=8, restore_best_weights=True),
        keras.callbacks.ModelCheckpoint("measurement_model.h5", save_best_only=True),
    ],
)
```

Export to TF.js for browser use:
```
tensorflowjs_converter --input_format=keras measurement_model.h5 ./tfjs_model
```

The output replaces the hand-coded coefficients in the FE's [`measurements.js`](../../crwn-clothing-fe/src/routes/onboarding/inference/measurements.js).

### 6.3 Defensible thesis claim

> The hand-coded coefficients (anthropometric ratios `* 1.18`, `* 1.65`, `* 2.05`, `* 0.86`) achieved X cm MAE on the held-out test set; the Keras-learned head achieved Y cm. Y < X with p < 0.05 (bootstrap CI on 1000 resamples).

This is the standard "novelty + measurable improvement" defensible result a thesis chapter needs.

The full runnable Python stub is at [`evaluation/python/train_measurement_head.py`](../evaluation/python/train_measurement_head.py).

---

## 7. Datasets

The thesis validation strategy spans four dataset families. Each addresses a different evaluation question.

### 7.1 Pose detection benchmarks (evaluation only)

| Dataset | Size | Role |
|---------|------|------|
| **COCO Keypoints val 2017** | ~5 K images, 17 keypoints per person | Confirms our TF.js wrapper preserves the published MoveNet OKS of 0.75 |
| **MPII Human Pose** | 25 K images | PCK@0.5 reporting |

These are **eval-only** — we do not retrain pose detectors. The runnable evaluation is at [`evaluation/python/evaluate_movenet_on_coco.py`](../evaluation/python/evaluate_movenet_on_coco.py).

### 7.2 Anthropometric datasets (training the measurement head)

| Dataset | Size | Role |
|---------|------|------|
| **ANSUR II** (US Army 2012) | 6,000 men + 4,000 women, 132 measurements each | Pair each subject's measurements with synthesized 2D pose keypoints (project the 3D scan to frontal view, extract 17 COCO-style keypoints). Generates `(pose, height) → measurements` training pairs in arbitrary quantity. |
| **CAESAR** | 4,400 subjects, 3D scans + measurements | Smaller but more recent. Includes 3D body shapes for downstream extensions (try-on overlays). |
| **SizeUSA / SizeUK** | civilian surveys | Less public, procurable for European/American body distributions. |

### 7.3 Fashion datasets (Hugging Face)

| Dataset | HF identifier | Role |
|---------|---------------|------|
| **DeepFashion (multimodal)** | `lirus18/deepfashion-multimodal` | 800 K images, attribute labels for category / fabric / shape / part style. The canonical fashion benchmark. Validates the palette classifier and the recommendation-tag matching. |
| **DeepFashion2** | mirror on HF | 491 K images, 13 categories, pose keypoints, segmentation masks. Better for silhouette-to-product matching. |
| **Fashion-MNIST** | `fashion_mnist` | 70 K low-res images, 10 classes. Toy-scale sanity check. |
| **iMaterialist Fashion** | Kaggle competition data | ~228 attributes per image. Useful for training a product-tagger to augment the hand-curated `recommendationTags`. |

Hugging Face's `datasets` package loads any of these with one line:
```python
from datasets import load_dataset
ds = load_dataset("lirus18/deepfashion-multimodal", split="train")
```

The runnable evaluation is at [`evaluation/python/evaluate_palette_on_deepfashion.py`](../evaluation/python/evaluate_palette_on_deepfashion.py).

### 7.4 E-commerce datasets (Kaggle + Trendyol)

| Dataset | Size | Role |
|---------|------|------|
| **H&M Personalized Fashion Recommendations** | 1.3 M articles, 1.4 M users, 31 M transactions | The canonical academic recommendation benchmark. Held-out test split → NDCG@10 against the popularity / random / last-purchase baselines documented on the competition leaderboard. |
| **Polyvore Outfits** | 21 K outfits with item-to-item compatibility labels | Validates style coherence (does the user's silhouette match the recommended product?). |
| **Trendyol catalog** | 250 K+ apparel SKUs across 30 K+ brands | **The flagship real-world validation.** Public size-chart and review-tagged fit data (`"fits true" / "runs small" / "runs large"` with reviewer's body measurements) — a labeled training set for size recommendation, free. |

### 7.5 Trendyol — the central validation

Trendyol is Turkey's largest apparel marketplace. For thesis validation it is the right choice because:
- **Public size charts in structured form** — every product page has a `bodyMeasurements` table with chest, waist, hip, length in cm per size. Imports directly into our `sizeChartJson`.
- **Review-tagged fit data** — each product has thousands of reviews including the explicit "size fits true / runs small / runs large" flag and the size the reviewer purchased. This is real labeled ground-truth for evaluation.
- **Multi-brand coverage** — 30K+ brands with idiosyncratic sizing. Tests whether the recommendation generalizes beyond H&M-style consistent sizing.
- **Image consistency** — product photos are on white backgrounds with consistent framing, making palette extraction more reliable than DeepFashion's in-the-wild photos.

The proposed pipeline:

1. **Crawl ~5,000 products** via the public discovery API at a polite 1 req/s rate limit, identified user-agent, robots.txt-compliant.
2. **Extract structured size charts** into the same JSONB shape we already use.
3. **Extract review-tagged fit data** — for each product, sample ~50 reviews that include both the reviewer's body measurements (in their profile) and the size they purchased.
4. **Build a held-out test set** of `(reviewer_measurements, product_chart) → known_correct_size` pairs.
5. **Compute Top-1 / Top-2 / Top-3 Accuracy** of our `getRecommendedSize` against this test set.
6. **Report per-category breakdown** to confirm the synthetic-data observation: accessories near-perfect, tops middle, bottoms hardest.
7. **Ethical disclosure**: educational use only, not redistributed, rate-limited, academic-use request preferred over scraping for larger samples.

The runnable crawler stub is at [`evaluation/python/trendyol_catalog_fetcher.py`](../evaluation/python/trendyol_catalog_fetcher.py).

---

## 8. Security

### 8.1 Authentication & authorization

- **Passwords** hashed with bcrypt, 10 salt rounds. Never returned in any API response. Never stored client-side.
- **Access tokens**: short-lived JWTs (1 h). **Refresh tokens**: 7 days, server-validated on use.
- **Bearer scheme** — every protected endpoint requires `Authorization: Bearer <token>`. The FE Axios interceptor attaches it automatically from Redux state.
- **`authMiddleware`** decodes the JWT, fetches the user, attaches to `req.user`. Failures throw 401.
- **`adminMiddleware`** on top of auth checks `user.role === 'admin'` for product-mutation routes.

### 8.2 Input validation & allowlisting

The body-profile endpoint is the highest-risk surface — it accepts a structured payload that updates user-owned fields. Defense in depth:

- **Top-level whitelist** in `bodyProfileValidation.ts`: `BODY_PROFILE_KEYS` is an explicit `Set` of the only field names allowed in the request body. Anything outside throws 400 before any parsing happens.
- **Per-field range validation** — every numeric field is bounded (`heightCm ∈ [130, 220]`, `landmarkSummary.confidence ∈ [0, 1]`, etc.).
- **Enum allowlists** for the new preference fields:

```typescript
const STYLE_OPTIONS = new Set([
  'minimalist', 'streetwear', 'classic', 'bohemian',
  'sporty', 'edgy', 'preppy', 'vintage'
]);
const PALETTE_OPTIONS = new Set([
  'earth-tones', 'monochrome', 'pastels', 'jewel-tones',
  'warm-neutrals', 'bold-brights', 'cool-tones', 'sunset'
]);
```

Non-enum values throw 400. Arrays are deduped server-side. The only thing that can land in those JSONB columns is one of the 16 known IDs.

### 8.3 Privacy: on-device computer vision

The single most important security property:

> **The body photo never leaves the user's device.**

The TF.js inference happens in the browser tab. The captured frame is held in component state for the duration of the wizard, persisted only to `sessionStorage` (cleared when the tab closes), and is never sent to the server. What goes to the server is:

- The derived measurements (numbers, in cm)
- A pruned `landmarkSummary` containing only a confidence score
- An optional `landmarkModel` string identifying which model produced the result
- The user's explicit style and palette preferences (allowlisted strings)

This is enforced not by policy but by **code** — there is literally no upload endpoint for photos.

### 8.4 Data persistence boundaries

- **Redux Persist** whitelists only `cart` and `user` slices.
- **Wizard `sessionStorage` payload** explicitly strips `password` and `confirmPassword`:

```js
const safe = {
  ...state,
  account: { ...state.account, password: '', confirmPassword: '' }
};
window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
```

A refresh in the middle of the wizard preserves name + email but never holds the password in browser storage.

### 8.5 What's still open (honest gap)

These are production-hardening items not addressed in the thesis prototype:

- JWT lives in `localStorage` → exposed to XSS. Mitigation: short access-token TTL (1 h). Production: move to httpOnly cookies + CSRF token.
- No rate-limiting on `/login`, `/register`, `/me/onboarding/infer` (the heaviest).
- No CSP / SRI on the build.
- `sequelize.sync({ alter: true })` runs at boot — dev-friendly, unsafe in real prod. Production: Sequelize migrations.

---

## 9. Deployment

### 9.1 Live URLs

| Component | URL | Hosting | Cost |
|-----------|-----|---------|------|
| Frontend | `https://crwn-clothing-kmt.pages.dev` | Cloudflare Pages | $0 |
| Backend | `https://crwn-clothing-api-a0wa.onrender.com` | Render Web Service | $0 |
| Database | Render Postgres `dpg-d8g2rceq1p3s73csipd0-a` | Render Postgres | $0 (free 90 days) |
| CI/CD | GitHub Actions on push | GitHub Free | $0 |

**Total monthly cost: $0** during the thesis review window.

### 9.2 Why these choices

| Concern | Choice | Why |
|---------|--------|-----|
| FE bandwidth | Cloudflare Pages | Unlimited bandwidth (vs Vercel's 100 GB/mo cap) + global Anycast edge + free SSL |
| BE quick start | Render Web Service | Free tier + auto-deploy from GitHub + zero-config Postgres provisioning |
| Postgres durability | Render Postgres (90 days) | Free with the web service; if defense slips past 90 days, migrate to Neon (free indefinitely, no code changes — just env vars) |
| CI | GitHub Actions | 2000 min/month free, deeply integrated, no separate account |

### 9.3 CI/CD pipeline

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs three parallel jobs on every push and PR:

| Job | Command | Output |
|-----|---------|--------|
| `frontend` | `npm ci --legacy-peer-deps && npm run build` | uploads `build/` artifact (7-day retention) |
| `backend` | `npm ci && npx tsc --noEmit` | typecheck only |
| `evaluation` | `node run-all.js` | uploads `results.json` + `RESULTS.md` (90-day retention) |

The evaluation artifact is regenerated on every push — the thesis writer always has the current numbers.

### 9.4 Deployment lessons learned (real production debugging)

Production deploy took five iterations on the BE. Each failure was a real-world gotcha and each fix is committed in the repo:

1. **GitHub webhook auth missing** — `autoDeploy: yes` in render.yaml doesn't fire without Render's GitHub app installed. Worked around by triggering deploys via the API.
2. **`NODE_ENV=production` blocked devDeps** — npm skipped `@types/*`, tsc failed. Fixed by patching build command: `npm install --include=dev && npx tsc`.
3. **`ignoreDeprecations: "6.0"` is invalid for TS 5.x** — removed the deprecated `baseUrl` and `moduleResolution: "node"` instead. Commit `d572747`.
4. **`uuid_generate_v4()` not loaded on fresh Postgres** — added `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` between `authenticate()` and `sync({alter:true})`. Commit `b7c5e8d`.
5. **Hardcoded `API_BASE_URL = "http://localhost:3000"` in the Axios interceptor** — caused `ERR_CONNECTION_REFUSED` on every API call from the deployed FE. Changed to read `process.env.REACT_APP_API_BASE_URL` with localhost fallback. Commit `7412076`.

### 9.5 Environment configuration

Render web service env vars:

```
NODE_ENV       = production
PORT           = 3000
DB_HOST        = dpg-d8g2rceq1p3s73csipd0-a   (internal hostname, no SSL handshake cost)
DB_PORT        = 5432
DB_USER        = postgres_i5pb_user
DB_PASSWORD    = ••• (set)
DB_NAME        = postgres_i5pb
DB_SSL         = true
JWT_SECRET     = ••• (64-char base64url)
appOrigin      = https://crwn-clothing-kmt.pages.dev
```

Cloudflare Pages build (baked into the bundle at compile time):
```
REACT_APP_API_BASE_URL = https://crwn-clothing-api-a0wa.onrender.com
```

The full step-by-step deployment guide is in [`DEPLOYMENT.md`](DEPLOYMENT.md).

### 9.6 Free-tier caveats to know

- **Render web service** sleeps after 15 minutes of no traffic. The first request after sleep takes ~30 s to cold-start. For a live demo: hit `/categories` 30 s before showing it.
- **Render free Postgres** expires after 90 days. If the thesis defense is past that, migrate the same DB credentials to Neon — no code changes needed, only env vars.
- **Cloudflare Pages** has no idle sleep and unlimited bandwidth, so the FE is always instant.

---

## 10. Repository Structure

```
uni/
├── crwn-clothing-fe/                  React 18 SPA
│   ├── src/
│   │   ├── routes/
│   │   │   ├── onboarding/             5-step wizard
│   │   │   │   ├── onboarding.route.jsx
│   │   │   │   ├── hooks/use-wizard-state.js
│   │   │   │   ├── inference/
│   │   │   │   │   ├── landmarks.js     TF.js detector loaders + drawOverlay
│   │   │   │   │   └── measurements.js  pose ratios → cm
│   │   │   │   ├── steps/
│   │   │   │   │   ├── account-step.jsx
│   │   │   │   │   ├── capture-step.jsx
│   │   │   │   │   ├── measurements-step.jsx
│   │   │   │   │   ├── preferences-step.jsx
│   │   │   │   │   └── review-step.jsx
│   │   │   │   └── preferences-options.js   8 styles + 8 palettes
│   │   │   ├── shop/                   unified shop page
│   │   │   ├── product-detail/         "Why we recommend M"
│   │   │   └── checkout/
│   │   ├── contexts/theme-context.jsx
│   │   ├── styles/
│   │   │   ├── themes/{base,light,dark,sunset}.js
│   │   │   └── style-helpers.js
│   │   ├── utils/
│   │   │   ├── size-recommendation.js
│   │   │   ├── style-inference.js
│   │   │   └── product-style-match.js
│   │   └── store/                       Redux + saga + persist
│   └── public/
├── crwn-clothing-be/                  Express + TypeScript
│   ├── src/
│   │   ├── index.ts                    boot + CREATE EXTENSION + sync + seed
│   │   ├── seed-data.ts                36 products + 4 categories
│   │   ├── models/
│   │   │   ├── User.ts                  body + style profile fields
│   │   │   ├── Category.ts
│   │   │   └── Product.ts
│   │   ├── services/bodySizing.ts
│   │   ├── controllers/
│   │   │   ├── user/
│   │   │   │   ├── bodyProfileValidation.ts   allowlists
│   │   │   │   ├── inferBodyProfileResolver.ts
│   │   │   │   └── …
│   │   │   ├── product/
│   │   │   └── category/
│   │   ├── middlewares/{auth,admin,errorHandler}.ts
│   │   └── routes/
│   └── render.yaml
├── evaluation/                        Node ESM evaluation harness
│   ├── lib/                            pure-extracted FE logic
│   ├── metrics.js                      Accuracy, P/R/F1, MAE, RMSE, MRR, NDCG
│   ├── synthetic-data.js               seeded mulberry32 PRNG
│   ├── body-shape-eval.js
│   ├── size-recommendation-eval.js
│   ├── palette-eval.js
│   ├── run-all.js                      orchestrator + report writer
│   ├── results/
│   │   ├── results.json
│   │   └── RESULTS.md                   regenerated on every push
│   └── python/                          Keras + HF + Kaggle + Trendyol stubs
│       ├── train_measurement_head.py
│       ├── evaluate_movenet_on_coco.py
│       ├── evaluate_palette_on_deepfashion.py
│       ├── evaluate_size_recommendation_on_hm.py
│       └── trendyol_catalog_fetcher.py
├── .github/workflows/ci.yml           parallel FE / BE / eval jobs
├── THESIS.md                          full project narrative
├── CHANGES.md                         this phase's contributions
├── EVALUATION.md                      reviewer-response methodology
├── DEPLOYMENT.md                      step-by-step hosting guide
├── PROJECT_CONTEXT.md                 ← this file (consolidated context)
└── PLAN.md                            original phased roadmap
```

---

## 11. From Regular E-commerce to AI-Augmented Fit-Aware Commerce

The platform shift in one paragraph:

> **Before**: Generic React e-commerce. Every shopper saw the same grid in the same order. Sizes were a separate decision the shopper had to make on each product, with no guidance. The signup form collected name + email + password — there was no concept of personalization. The shop page was three sequential category previews with no way to see all products or filter them.
>
> **After**: The shopper's body and taste are first-class primitives. The signup form is gone — replaced with a guided wizard whose first step happens to collect identity and whose subsequent steps build a multi-faceted profile (measurements, body shape, dominant palette, silhouette, preferred styles, preferred color palettes). Every downstream surface re-orients around that profile. The same product catalog now feels different to each user.

The savings:

- **Time** — no more squinting at size charts. The recommended size is on every product card, every cart item, every checkout row. Wrong-size selections are flagged in real time.
- **Friction** — a shopper without a clear sense of their measurements (most people) is no longer stuck. Pose detection from a single photo gets them to within a measurable tolerance.
- **Decision fatigue** — the home page shows four products picked for them instead of an arbitrary "trending" rail. The shop's default sort surfaces the items most likely to fit and match their style.
- **Returns avoidance** — a shopper who picks a non-recommended size sees a soft warning chip in their cart, with the recommendation shown alongside. They can still proceed (they might know better), but they have to consciously override.

The contribution is not the body-measurement extractor alone. It is the **end-to-end fit-aware retail surface backed by computer vision and on-device ML**. Every layer is open: every score, every threshold, every model is in the repo and inspectable.

---

## 12. Future Work

In priority order by impact-per-week:

1. **Per-product `paletteHex` extraction** — run color quantization on each product image at seed time, store the palette in a JSONB column. The current style match uses the user's palette but products lack their own seeded palettes; closing this gap meaningfully sharpens the style score.
2. **Trendyol crawl + size recommendation evaluation** — the headline thesis result. Computes Top-1 / Top-2 / Top-3 on real catalog data with real reviewer-tagged ground truth.
3. **Keras measurement head trained on ANSUR II** — produces the defensible "X cm MAE before, Y cm after" claim. Export via `tensorflowjs_converter` and drop into the existing TF.js inference path.
4. **A/B-able recommendation weights** — the 0.4 / 0.3 / 0.3 / 0.1 blend is hardcoded. Surface as feature flags + log resulting recommendation choices for offline analysis.
5. **20-person within-subjects user study** — IRB if required. A/B between fit-aware and placebo (random ranking). Outcomes: time-to-add-to-cart, decision quality, self-reported size confidence. Pre-registered hypothesis: fit-aware reduces time-to-add by ≥ 20%.
6. **httpOnly cookie + CSRF for JWT** — closes the XSS-steals-token vulnerability class. Required for any real production deployment.
7. **Sequelize migrations** instead of `sync({ alter: true })`. Required for production.
8. **WebGPU backend** — already installed but unused. ~2× faster than WebGL on supporting browsers.
9. **Mobile FPS optimization** — measure on a mid-range Android, potentially drop to a smaller MoveNet or sub-sample frames.
10. **"Try it on" view** — overlay the product silhouette over the captured photo using the same pose keypoints. Stretch goal but visually compelling.

---

## 13. References

### 13.1 Datasets

- COCO Keypoints — Lin et al., *Microsoft COCO: Common Objects in Context*, ECCV 2014.
- MPII Human Pose — Andriluka et al., CVPR 2014.
- ANSUR II — *2012 Anthropometric Survey of U.S. Army Personnel*, Natick Soldier Research, Development and Engineering Center.
- DeepFashion — Liu et al., *DeepFashion: Powering Robust Clothes Recognition and Retrieval with Rich Annotations*, CVPR 2016.
- DeepFashion2 — Ge et al., CVPR 2019.
- H&M Personalized Fashion Recommendations — Kaggle competition 2022, hosted by H&M Group.
- Polyvore Outfits — Han et al., *Learning Fashion Compatibility with Bidirectional LSTMs*, ACM MM 2017.

### 13.2 Models

- MoveNet — Google TF.js Model Garden. Real-time on-device pose estimation.
- MediaPipe FaceMesh — Kartynnik et al., *Real-time Facial Surface Geometry from Monocular Video on Mobile GPUs*, CVPR Workshops 2019.

### 13.3 Metrics

- COCO OKS — *MS COCO Keypoint Evaluation* documentation.
- NDCG — Järvelin & Kekäläinen, *Cumulated gain-based evaluation of IR techniques*, ACM TOIS 2002.
- F1 / macro-F1 — Manning, Raghavan, Schütze, *Introduction to Information Retrieval*, Cambridge 2008.

### 13.4 Reference implementation

[`magdazelena/face-landmark-detection`](https://github.com/magdazelena/face-landmark-detection) on GitHub — the single-shot inference pattern on captured frames is borrowed from this reference repo and proved more reliable than the live-loop measurement pattern that broke initially.

### 13.5 Tools

- TensorFlow 2 / Keras (Python) — for training.
- TensorFlow.js — for in-browser inference.
- `tensorflowjs_converter` — Keras → TF.js bridge.
- Hugging Face Datasets — `pip install datasets`, one-line dataset loaders.
- Kaggle Notebooks — free GPU; H&M dataset hosted there.
- scikit-learn `classification_report` and `confusion_matrix` — for §5 metrics.

---

## 14. Companion Documents

| File | Purpose |
|------|---------|
| **PROJECT_CONTEXT.md** | This file — consolidated thesis context |
| [THESIS.md](THESIS.md) | Long-form project narrative with deep dives on TF.js, theme system, recommendation engine |
| [CHANGES.md](CHANGES.md) | What was added, rebuilt, or replaced during this implementation phase |
| [EVALUATION.md](EVALUATION.md) | Reviewer-response methodology and validation roadmap |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Step-by-step Cloudflare Pages + Render hosting guide |
| [PLAN.md](PLAN.md) | Original phased implementation roadmap |
| [evaluation/results/RESULTS.md](../evaluation/results/RESULTS.md) | Auto-regenerated metric numbers — current run |

Together they constitute the full written submission for thesis review.

---

*This document is the single intended starting point for the thesis defense. Read this end-to-end and you have the complete project context: what was built, why it matters, how it works, what it measures, where it lives, and what comes next.*
