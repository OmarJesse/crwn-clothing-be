# CRWN Fit-Aware Commerce — Feature Reference

> A complete, up-to-date catalogue of what the system does, how it is validated,
> and what it needs to run. Companion to [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)
> (narrative), [THESIS.md](THESIS.md) (defense), and
> [EVALUATION.md](EVALUATION.md) (methodology).

**Live frontend:** https://crwn-clothing-fe.onrender.com
**Live API:** https://crwn-clothing-api-a0wa.onrender.com
**Stack:** React 18 + styled-components + framer-motion (FE) · Express 5 +
Sequelize + Postgres (API) · TensorFlow.js + MediaPipe (in-browser CV) · Stripe.

**Repo layout:** this is the API repo. It also now hosts the project's
`datasets/` (ANSUR II CSVs), `evaluation/` (metrics harness), and `docs/`
(this file plus the thesis docs), so everything except the React front-end
(`crwn-clothing-fe`, separate repo) is version-controlled here.

---

## 1. Fit-aware onboarding

- **Five-step wizard** (account → camera capture → confirm measurements →
  style/palette preferences → review). 60–90 s, state persisted to
  `sessionStorage`, passwords stripped before serialization.
- **In-browser computer vision** (no body image ever leaves the device — there
  is no photo upload endpoint):
  - MoveNet Lightning ~10 FPS live skeleton overlay.
  - MoveNet Thunder single-shot capture → measurements.
  - MediaPipe FaceMesh (`refineLandmarks`) for confidence + fallback.
  - Detector **pre-warm** on camera-step mount overlaps the ~14 MB model load
    with reading time, making capture feel instant on warm cache.
- **In-browser palette quantizer**: median-cut on a 64×64 downsample → top-5
  dominant colors → one of six palette buckets by Euclidean color distance.

## 2. Body profile & body-shape model

- Structured fit profile persisted per user: `heightCm`, `weightKg`, `bmi`,
  `chestCm`, `waistCm`, `hipCm`, `inseamCm`, `shoulderCm`, `preferredFit`,
  `bodyShape`, `landmarkSummary` (JSONB), `recommendationVersion`,
  `preferredStyles`, `preferredPalettes`, `onboardingCompletedAt`.
- **FFIT body-shape classification** (`crwn-clothing-be/src/services/bodyShape.ts`),
  the literature-standard Female Figure Identification Technique (Simmons,
  Istook & Devarajan 2004), simplified to five garment-relevant shapes:
  **hourglass · inverted-triangle · triangle · oval · rectangle**, classified
  from bust/waist/hip circumferences.
  - **One source of truth**: the same classifier logic is mirrored in the API
    (`bodyShape.ts`), the onboarding FE (`measurements.js`), and the evaluation
    harness (`lib/measurements.js`), so the shape shown during onboarding always
    equals the persisted profile and the validated model.
  - Replaced an earlier BMI-driven taxonomy that collapsed ~49% of real bodies
    into a single class. On the real ANSUR II population the FFIT classifier
    yields a credible, sex-appropriate spread (hourglass 8.8%, inverted-triangle
    16.3%, triangle 18.5%, oval 31.7%, rectangle 24.7%).
  - *Stated limitation:* chest circumference is used as the bust proxy (no
    dedicated bust girth in ANSUR), which biases full-busted figures toward
    triangle. Documented in the classifier header.

## 3. Recommendation engine

Three independent scorers fused into one combined rank:

```
combinedScore = 0.4·sizeConfidence + 0.3·photoStyleScore
              + 0.3·explicitPreferenceScore + 0.1·hasRecommendedSizeBonus
```

Surfaced everywhere: product-card "Fit M" badges, home "Picked for you" rail,
shop default sort, "Fits me" filter, cart fit chips, checkout summary, and the
product-detail measurement-delta panel ("Your chest 96 cm → M chart 98 cm =
+2 cm").

## 4. Fit Insights *(new)*

Population analytics that turn the seeded body population into "people like
you" intelligence.

- **API** (`crwn-clothing-be/src/services/insights.ts`):
  - `GET /insights/population` (public): body-shape & fit-preference
    distributions, per-measurement summary stats (min/p10/p50/p90/max/mean).
    Cached in-process for 5 minutes.
  - `GET /insights/me` (auth): the shopper's per-measurement **percentile rank**,
    their body-shape **cohort size**, the number of **fit twins** (bodies within
    5 cm RMS across chest/waist/hip), and the cohort's dominant fit preference.
- **UI** (`/insights`): an animated dashboard — reference-population hero stat,
  FFIT distribution bars (the user's own shape highlighted), and, once signed in
  with a completed profile, a personal panel with fit-twins, cohort, and
  percentile gauges. Fully themed via CSS custom properties (Light/Dark/Sunset).

## 5. Storefront

- Unified shop page: sticky search + sort + "Fits me" toggle, working sidebar
  filters (category / size / fit / **gender** / price / palette) with
  active-filter chips, animated grid (framer-motion), empty state, polished
  mobile drawer.
- **Windowed rendering**: with a ~500-product catalog, mounting every animated
  card at once was slow, so the grid renders a page of 24 and grows via an
  `IntersectionObserver` as you scroll (with a "Load more" fallback). The
  global, recommendation-aware sort still runs over the full in-memory list;
  only the mounted DOM is windowed.
- **Gender filter**: Women / Men / Unisex chips. Unisex products always show
  alongside a selected Women/Men filter. Backed by a `gender` column on
  products (see §5b).
- Product detail: hero gallery, size picker (recommended size starred), full
  size chart with active row highlighted, "Why we recommend size X" panel,
  style-match panel.
- **Live catalog: ~517 products.** A 36-product hand-seed plus real-data
  importers (DummyJSON + the H&M Personalized Fashion dataset). Broken H&M CDN
  images (hot-link-protected 302s) are swapped for stable, category-appropriate
  Unsplash apparel photography by `scripts/fix-product-images.ts`.
- **Multi-theme design system**: Light / Dark / Sunset via a single
  `ThemeContext` swapping styled-components tokens and CSS variables in lockstep;
  persisted to `localStorage`, first visit honors `prefers-color-scheme`.

## 5b. Gender

End-to-end gender support, added across the whole stack:

- **User gender** (`male` / `female` / `unspecified`) — a `gender` column on the
  user, selectable on the **sign-up form**, in the **onboarding wizard**
  (measurements step), accepted by `/register` and the body-profile
  infer/update endpoints, and returned by `/me`. Seeded ANSUR users were
  backfilled from their `m.`/`f.` seed emails (4,082 male / 1,986 female).
- **Product gender** (`men` / `women` / `unisex`) — a `gender` column on
  products, backfilled from the H&M `index_group_name` with a name/tag
  heuristic fallback (240 unisex / 194 women / 83 men). Drives the shop filter.
- Migration + backfill: `scripts/migrate-add-gender.ts` (idempotent
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS` + backfill).

## 6. Checkout & payments

- Stripe card checkout via `<Elements>` + `CardElement`.
- **API**: `POST /payments/create-payment-intent` creates a Stripe PaymentIntent
  (amount in cents, USD) using `STRIPE_SECRET_KEY`.
- See [§8 Deployment](#8-deployment--environment) for the required keys.

## 7. Data & evaluation

### Datasets (now in this repo under `datasets/`)
- **ANSUR II** (US Army 2012): 6,068 subjects (4,082 M + 1,986 F), 93 body
  measurements each. Committed at `datasets/ansur2/*.csv`. Loaded +
  unit-converted (mm→cm; weight deci-kg→kg) and seeded into the `users` table
  as realistic users via the live `inferBodyProfile` service. See
  [scripts/ANSUR_README.md](../scripts/ANSUR_README.md).
- **H&M Personalized Fashion Recommendations** (Kaggle): `articles.csv`
  (105,543 products). Too large for git (`scripts/data/` is gitignored) —
  download with the Kaggle CLI after accepting the competition rules.

### Seed & migration scripts (`npm run …`)
| Script | What it does |
|--------|--------------|
| `seed:ansur -- --all` | Seed the full ANSUR population as users (idempotent; `@ansur.local` emails, deterministic UUIDs; `--reset` re-seeds) |
| `seed:dummyjson` | Real apparel/accessories from DummyJSON |
| `seed:hm -- --limit 400` | Import real H&M products (`--reset` to replace the catalog) |
| `seed:balance` | Add curated pants + outerwear to even out categories |
| `migrate-add-gender.ts` | Add + backfill the `gender` columns |
| `fix-product-images.ts` | Replace broken H&M image URLs with Unsplash apparel photos |

### Evaluation harness (`evaluation/`, `npm run eval`)
Real, reproducible metrics — two-tier validation for body shape:

| Suite | Result |
|-------|--------|
| Body shape — **synthetic** (clean FFIT-generated, n=2,000) | **Accuracy 95.65%**, macro-F1 95.19% |
| Body shape — **real ANSUR II** (gold tape labels vs. classifier on pose-noise σ=3 cm, n=6,068) | **Accuracy 61.09%**, macro-F1 59.67% |
| Size recommendation (50,000 person×product pairs) | Top-1 49.9%, Top-2 83.7%, **Top-3 99.8%**, MRR 0.72 |
| Palette bucket classifier (n=1,200, noise ±25) | **Accuracy 95.25%**, macro-F1 95.28% |

**Noise-sensitivity sweep** (ANSUR II) — graceful degradation as simulated
pose-estimation measurement noise grows:

| σ (cm) | 0 | 1 | 2 | 3 | 4 | 5 |
|--------|----|----|----|----|----|----|
| Accuracy | 100% | 84.8% | 71.5% | 61.1% | 53.3% | 47.2% |

Artifacts regenerated to `evaluation/results/RESULTS.md` and `results.json`.

### TensorFlow / Keras training pipeline (`evaluation/python/`)

The runtime does inference in the browser (TensorFlow.js: MoveNet + FaceMesh),
but the models can be **trained and benchmarked in Python/Keras**. This folder
is the training-and-validation companion to the JS metrics harness:

| Script | Datasets used | What it does |
|--------|---------------|--------------|
| `train_measurement_head.py` | ANSUR II (synthesized to-shape; swap in the real CSV in `../../datasets/ansur2/`) | Trains the Keras MLP `(pose keypoints 17×3 + height) → 128 → 64 → 32 → 6 body measurements`; reports MAE/RMSE; emits the `tensorflowjs_converter` command to ship weights to the browser |
| `colab_train_measurement_head.ipynb` | same | One-click Colab notebook for the above (GPU) |
| `evaluate_movenet_on_coco.py` | **COCO Keypoints** val | OKS / PCK of the wrapped MoveNet pose detector |
| `evaluate_palette_on_deepfashion.py` | **DeepFashion** (Hugging Face) | Per-class F1 of the palette classifier |
| `evaluate_size_recommendation_on_hm.py` | **H&M** (Kaggle) | NDCG@k of size recommendation |
| `trendyol_catalog_fetcher.py` | **Trendyol** (live) | Polite (1 req/s, robots-aware) real-catalog crawler |

So the datasets span the whole pipeline: **ANSUR II** (anthropometry / the
measurement head and body-shape model), **COCO** (pose accuracy), **DeepFashion**
(palette/style), and **H&M + Trendyol** (catalog + size-recommendation
validation). Run logs print the dataset, sample counts, and metrics; see
[../evaluation/python/README.md](../evaluation/python/README.md).

## 8. Deployment, CI/CD & operations

### 8.1 Topology — everything runs on Render.com

| Tier | Render service | URL | Build | Runtime |
|------|----------------|-----|-------|---------|
| Frontend | Static Site | `crwn-clothing-fe.onrender.com` | `npm ci --legacy-peer-deps` → `npm run build` (CRA) | static `build/` on Render's CDN |
| API | Web Service (`srv-d8g2u8t8nd3s7396kmlg`) | `crwn-clothing-api-a0wa.onrender.com` | `npm install --include=dev && npx tsc` | `node dist/index.js` |
| Database | Managed Postgres 16 (`crwn-postgres`) | — | — | Postgres |

The app lives in **two separate GitHub repos** — `OmarJesse/crwn-clothing-fe`
(React) and `OmarJesse/crwn-clothing-be` (this repo: API + datasets + evaluation
+ docs). Each is its own Render service connected to that repo's `main` branch.

### 8.2 Render (API) — service config

The API service (mirrored by `render.yaml` as a Blueprint, though the live
service is configured in the dashboard):

- **Plan: free** — spins down after ~15 min idle; the first request after idle
  cold-starts in ~30–60 s. **Warm it up before a demo.**
- **Region:** frankfurt. **Runtime:** node.
- **Build:** `npm install --include=dev && npx tsc` → compiles `src/` → `dist/`
  (`outDir: ./dist`; `--include=dev` so TypeScript is available at build time).
- **Start:** `node dist/index.js`.
- **rootDir:** `.` (the repo root *is* the API), **autoDeploy: on**,
  **healthCheckPath:** `/`.
- **Database:** the free Postgres injects `DB_HOST/PORT/USER/PASSWORD/NAME` into
  the service automatically.

> The free Postgres expires 90 days after creation — migrate to Neon for
> durability (see [DEPLOYMENT.md](DEPLOYMENT.md) §6); point `DB_*` at the Neon
> connection string and redeploy.

### 8.3 Deploying via the Render API (what we actually use)

`autoDeploy` is on, but you can also trigger and watch a deploy programmatically
with a Render API key (Account → API Keys). This is how deploys were driven in
development:

```bash
SVC=srv-d8g2u8t8nd3s7396kmlg
# trigger a deploy of the latest main commit
curl -s -X POST -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$SVC/deploys" -d '{"clearCache":"do_not_clear"}'
# poll status until "live"
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$SVC/deploys/<deployId>"
# set/update an env var (e.g. the Stripe secret), then it redeploys
curl -s -X PUT -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$SVC/env-vars/STRIPE_SECRET_KEY" \
  -d '{"value":"sk_live_…"}'
```

The free **Static Site** (front-end) has no equivalent build-from-API trigger —
redeploy it from the dashboard (**Manual Deploy**) or by pushing to its `main`.

> A data-only change (seeding/migrating Postgres) needs **no redeploy** — the
> running API reads it immediately. A **schema** change (new column) *does* need
> a redeploy, because Sequelize only selects model-defined columns.

### 8.4 Verifying a deploy

```bash
# API on new code? (should be JSON 200, not 404)
curl https://crwn-clothing-api-a0wa.onrender.com/insights/population
# product schema picked up new columns? (look for "gender")
curl https://crwn-clothing-api-a0wa.onrender.com/products/<categoryId>
```

### 8.4b CI — `.github/workflows/ci.yml`

GitHub Actions (build/verify only — it does **not** deploy): a `frontend` job
(`npm ci` → `npm run build`), a `backend` job (`npm ci` → `npx tsc --noEmit`),
and an `evaluation` job (`node run-all.js`, uploads `results.json` + `RESULTS.md`).

> The workflow file currently sits in the untracked `uni/.github/` and is
> written monorepo-style (`working-directory: crwn-clothing-be|crwn-clothing-fe|
> evaluation`). Since `evaluation/` now lives inside this repo, committing a
> repo-local `.github/workflows/ci.yml` here (backend + evaluation jobs, paths
> relative to the repo root) would make CI actually run on push.

### 8.5 Environment variables

| Service | Variable | Purpose |
|---------|----------|---------|
| API (Render) | `DB_HOST/PORT/USER/PASSWORD/NAME`, `DB_SSL` | Postgres connection (auto-wired by the Blueprint DB) |
| API (Render) | `JWT_SECRET` | Auth token signing (`generateValue: true`) |
| API (Render Web Service) | `appOrigin` | CORS allow-origin — **set to the deployed FE URL** |
| API (Render Web Service) | **`STRIPE_SECRET_KEY`** | **Required for checkout** (`sk_...`) |
| FE (Render Static Site) | `REACT_APP_API_BASE_URL` | API base URL |
| FE (Render Static Site) | **`REACT_APP_STRIPE_PUBLISHABLE_KEY`** | **Required for checkout** (`pk_...`) |

> Checkout will not work until both Stripe keys are set on their respective
> Render services. With keys absent, the API returns a clear 500 ("Stripe is
> not configured") rather than crashing.

### 8.6 Operational notes

- **API** is deployed and current: the FFIT model, Fit Insights, the Stripe
  endpoint, gender, and the larger catalog are all live (verified via
  `/insights/population` and `/products/<id>` returning `gender`).
- **Front-end** redeploys from its Render Static Site on push to `main`; trigger
  a Manual Deploy if a push doesn't auto-build.
- **Stripe** keys (`STRIPE_SECRET_KEY` on the API, `REACT_APP_STRIPE_PUBLISHABLE_KEY`
  on the FE) still need to be set for checkout to function.
