# CRWN Fit-Aware Commerce — Changes Report

> A focused write-up of what was added, rebuilt, or replaced during this body-aware-commerce phase of the project. For the broader architecture and end-to-end product narrative see [THESIS.md](THESIS.md).

**Last updated:** 2026-06-22

---

## 0. Latest phase — datasets, FFIT, gender, catalog & ops (2026-06-22)

A second build-out, focused on grounding the system in **real datasets**, a
literature-backed body-shape model, and operational polish:

- **Datasets brought into the repo and the pipeline.** The project now uses, and
  documents, several real datasets end-to-end:
  - **ANSUR II** (US Army 2012, 6,068 subjects) — committed at
    `datasets/ansur2/`; seeded into the `users` table as realistic bodies and
    used as gold labels for the body-shape evaluation.
  - **H&M Personalized Fashion Recommendations** (Kaggle, 105k articles) —
    imported into the live catalog (~517 products) and used for product gender.
  - **COCO Keypoints, DeepFashion, Trendyol** — wired into the Python
    benchmark scripts (pose accuracy, palette F1, real-catalog validation).
- **TensorFlow / Keras training pipeline** (`evaluation/python/`) — a trainable
  Keras head `(pose keypoints + height) → 6 body measurements`, plus
  dataset-specific evaluators (COCO/DeepFashion/H&M) and a Colab notebook. Run
  logs print the dataset, sample counts, and MAE/RMSE / F1 / NDCG metrics.
- **FFIT body-shape model** — replaced the BMI-driven heuristic (which collapsed
  ~49% of bodies into one class) with the literature-standard FFIT taxonomy,
  shared across API, onboarding, and the evaluation harness. Real-data accuracy
  is now reported (95.7% synthetic / 61.1% on noisy ANSUR, with a noise sweep).
- **Fit Insights** — population-analytics API + dashboard over the seeded bodies.
- **Gender** — user (male/female/unspecified) and product (men/women/unisex)
  gender across signup, onboarding, `/me`, and a shop filter; backfilled on the
  live DB.
- **Performance & ops** — paginated shop grid (was rendering ~500 cards at once),
  fixed broken H&M images, a real Stripe PaymentIntent endpoint, bcrypt cost
  raised to 12, and the API/FE deployed on Render (datasets + evaluation + docs
  consolidated into this repo).

---

## 1. Changes Summary

The codebase entered this phase as a competent but generic React/Express e-commerce template — product grid, cart drawer, Stripe checkout, alphabetical browse. It exited as an AI-augmented fit-aware retail surface. The work breaks into five concrete contributions:

- **A working onboarding wizard.** The previous version was in the repo but didn't run — a `requestAnimationFrame` loop racing with an asynchronous TF.js inference call, mirrored coordinate bugs, and a hard dependency on user-entered height before any pose drawing could happen. We deleted ~1,200 lines of glue code and replaced it with a clean five-step wizard whose camera step lazy-loads the right TF.js detector for the right purpose.
- **A real computer-vision pipeline.** Two TensorFlow.js pose models running side by side: MoveNet Lightning at ~10 FPS for the live skeleton overlay, MoveNet Thunder for the single-shot capture used for ground-truth measurements. Plus MediaPipe FaceMesh for landmark confidence and an in-browser median-cut color quantizer for palette extraction. All client-side: no body photo ever leaves the user's device.
- **A recommendation engine that surfaces everywhere.** Three independent signals (size confidence, photo-derived style match, explicit user preferences) blended into a single combined score that drives the home rail's "Picked for you" ordering, the shop's default sort, the product card's fit chip, the cart's per-item warning, the checkout's aggregate summary, and the product detail page's per-measurement deltas.
- **A multi-theme design system.** Three coherent theme variants (light, dark, sunset) driven by a single ThemeProvider that swaps both styled-components tokens and CSS custom properties in lockstep. The previous half-finished dark mode toggled CSS vars but never reached the styled-components subtree.
- **A unified shop with working filters.** The previous shop was a sequential dump of category previews backed by a filter modal whose "Apply" handler only logged to the console. The new shop is one page with sticky toolbar, working filters (search, sort, category, sizes, fit type, price, palette), a "Fits me" toggle, deep-linkable category URLs, animated grid transitions, and a polished mobile drawer.

The work was done on two codebases in parallel: extensions to the FE component tree and Redux flow, and additive changes to the BE schema and validators. None of the BE auth, payment, or order surfaces were touched — those remain untouched and unchanged.

---

## 2. The Starting State

For context, here's what didn't work or didn't exist before:

- The existing `onboarding.component.jsx` (~673 lines) and `landmark-inference.js` (~549 lines) were broken at runtime. Camera permission flow was bare. Live inference loops leaked frames, mirrored coordinates, and froze on capture.
- The shop was just `<CategoriesPreview />` followed by `<Category />` with a filter modal that didn't filter, a category page header in `color: white` (invisible on light backgrounds), and a Floating Action Button that scroll-to-topped and toast-spammed.
- `theme.js` was a single static object. Dark mode lived only in CSS custom properties — styled-components never re-rendered against it.
- There was no concept of a recommendation. Sizes were a manual decision on every product. Style and color preferences had no representation in the schema.
- Cart and checkout knew nothing about the user's body. Selected sizes were stored but never validated against a fit profile.
- Authentication collected name + email + password. There was no second step, no profile.

---

## 3. Changes Catalog (Ordered by Importance × Effort)

Defensible rank for review: how central each change is to the contribution, multiplied by how much engineering it took.

### 3.1 Tier 1 — Core Contribution

| # | Change | Effort | Importance |
|---|--------|--------|------------|
| 1 | Onboarding wizard rebuild (5 steps, framer-motion, sessionStorage) | Heavy | Critical |
| 2 | TensorFlow.js computer vision pipeline (live + capture, two models) | Heavy | Critical |
| 3 | Body profile data model + persistence + edit mode | Medium-Heavy | Critical |
| 4 | Recommendation engine (size + photo style + explicit preferences) | Medium-Heavy | Critical |
| 5 | Style preferences UI (4×2 tiles for styles + palettes) | Medium | High |

### 3.2 Tier 2 — Major UX Investments

| # | Change | Effort | Importance |
|---|--------|--------|------------|
| 6 | Multi-theme design system (light/dark/sunset) | Heavy | High |
| 7 | Shop redesign (unified page, working filters, sort, fit-toggle) | Heavy | High |
| 8 | Product detail page with measurement deltas | Medium | High |
| 9 | Fit profile in cart + checkout (per-item chips + aggregate) | Medium | Medium-High |

### 3.3 Tier 3 — Polish & Reliability

| # | Change | Effort | Importance |
|---|--------|--------|------------|
| 10 | Navigation pass: glass dock, profile popover, fit icon, theme cycle | Medium | Medium |
| 11 | Hero, authentication, sign-in/up forms theme refactor | Medium | Medium |
| 12 | Mobile filter drawer redesign (slide + sticky header/footer) | Light-Medium | Medium |
| 13 | Search results escape modal clipping (z-index + overflow restructure) | Light | Medium |
| 14 | 36-product seed catalog with image fallback chain (Unsplash → Picsum → SVG) | Light | Low-Medium |
| 15 | Logout flow improvements (redirect to fit profile, wizard reset) | Light | Medium |

---

## 4. The Big Subsystem Changes

### 4.1 Onboarding Wizard — Rebuilt

**Problem.** The existing implementation was a 670-line component that ran live pose inference and live measurement computation in the same `requestAnimationFrame` loop, depended on `flipHorizontal: true` on the model (which inverted the keypoint coordinates and made the skeleton land on the wrong limbs), and required the user to type their height before any drawing could happen.

**What replaced it.** A clean folder structure under `src/routes/onboarding/`:

```
onboarding/
  onboarding.route.jsx           ← shell, framer-motion step transitions
  onboarding.styles.jsx          ← shared styled tokens
  preferences-options.js         ← single source of truth for the 8 styles + 8 palettes
  hooks/use-wizard-state.js      ← reducer + sessionStorage persistence
  inference/
    landmarks.js                 ← TF.js detector loaders + drawOverlay
    measurements.js              ← pose ratios → cm, BMI, body shape
  steps/
    account-step.jsx             ← signup form (also acts as edit-mode entry)
    capture-step.jsx             ← react-webcam + permission UX + live overlay
    measurements-step.jsx        ← editable inferred values
    preferences-step.jsx         ← 4×2 style + 4×2 palette tile grids
    review-step.jsx              ← submit + per-measurement summary
```

The wizard now has five steps and can be entered in two modes:

- **New user.** Lands on Account step with a sign-up form. After successful registration the saga puts SIGN_UP_SUCCESS, and the component auto-advances to Camera.
- **Returning user with existing profile.** Hitting the 📐 nav icon prefills measurements + preferences from `bodyProfile` and jumps directly to Measurements (skipping Camera unless the user wants to re-scan).

State is held in a `useReducer` keyed off explicit action types and persisted to `sessionStorage` (cleared on tab close, with `password` and `confirmPassword` explicitly stripped before serialization). A refresh during the wizard preserves identity-non-sensitive progress.

### 4.2 TensorFlow.js Pipeline — Added

**Two distinct detector instances**, each tuned for a different role:

- **MoveNet Thunder (`SINGLEPOSE_THUNDER`)** — heavier, more accurate. Runs **once per capture**. Used for the real measurements.
- **MoveNet Lightning (`SINGLEPOSE_LIGHTNING`)** — ~3× faster, slightly less accurate. Runs in a **live loop** at ~10 FPS during the camera preview. Used purely for the on-screen skeleton overlay so the user can see they're being detected.

Plus **MediaPipe FaceMesh** with `refineLandmarks: true` for face keypoints — used to compute confidence and to provide a fallback signal when full-body pose detection fails (user too close, partially out of frame).

The split was the key correctness win. The previous broken version had used a single Thunder detector both for live preview and for measurements, in the same `requestAnimationFrame` loop, with no concurrency control. Stacked async calls, a blanking canvas, and a freeze on capture were the result. The new structure cleanly separates "live tracking for visual feedback" from "single-shot inference for ground truth."

```js
// crwn-clothing-fe/src/routes/onboarding/inference/landmarks.js
let posePromise;       // Thunder, lazy
let livePosePromise;   // Lightning, lazy

export const loadLivePoseDetector = async () => {
  // Lightning: 192×192 input, ~3MB, ~3× faster
};

export const estimateLivePose = async (videoEl) => {
  if (!videoEl || videoEl.readyState < 2) return null;
  const detector = await loadLivePoseDetector();
  return (await detector.estimatePoses(videoEl, { flipHorizontal: false }))[0] ?? null;
};

export const runInferenceOnImage = async (dataUrl, { onProgress }) => {
  // Thunder: 256×256 input, runs once per capture, returns pose + face
};
```

The live loop in [`capture-step.jsx`](../../crwn-clothing-fe/src/routes/onboarding/steps/capture-step.jsx) is structured to be cancel-safe and back-pressure-aware:

```js
const tick = async (ts) => {
  if (cancelled) return;
  rafRef.current = requestAnimationFrame(tick);

  const minIntervalMs = 95;
  if (ts - lastFrameAtRef.current < minIntervalMs) return;
  if (liveBusyRef.current) return;             // single in-flight inference

  const video = webcamRef.current?.video;
  if (!video || video.readyState < 2) return;

  lastFrameAtRef.current = ts;
  liveBusyRef.current = true;
  try {
    const pose = await estimateLivePose(video);
    if (cancelled) return;
    drawOverlay(liveCanvasRef.current, video, pose);
  } finally {
    liveBusyRef.current = false;
  }
};
```

Three guarantees this provides:

1. **No stacked inference.** The `liveBusyRef` flag ensures only one `estimatePoses` call is in flight. If the next animation frame arrives while inference is still running, it's skipped.
2. **Throttling.** The `minIntervalMs = 95` cap keeps us at ~10 FPS, more than enough for visual feedback without burning the GPU.
3. **Clean cancel.** The `cancelled` flag closes the door on any in-flight result that arrives after the component unmounts. `cancelAnimationFrame` stops the loop in cleanup.

The skeleton renderer uses a **two-pass stroke** so it stays visible against any background lighting:

```js
// Wider dark outline first, colored stroke on top
drawLines(outline /* dark */, outlineWidth /* baseWidth + 6 */);
drawLines(stroke /* indigo */, baseWidth /* canvas.width / 80 */);
```

Three-layer keypoint dots (dark ring → pink core → small white inner) give the joints similar contrast against any clothing color.

### 4.3 Measurement Math — Added

The math in [`inference/measurements.js`](../../crwn-clothing-fe/src/routes/onboarding/inference/measurements.js) bridges abstract keypoint space to centimeters using the user's height as the scale anchor:

```js
const referenceHeight = clamp(Number(heightCm) || 170, 130, 220);
const headRoom = referenceHeight * 0.06;
const cmPerPx = (referenceHeight - headRoom) / effectiveBodyPx;

const shoulderCm = round(ratios.shoulderPx * cmPerPx * 1.18, 1);
const hipCm = round(ratios.hipPx * cmPerPx * 1.65, 1);
const chestCm = round(shoulderCm * 2.05, 1);
const waistCm = round(hipCm * 0.86, 1);
```

The constants come from anthropometric tables (skeletal-to-circumferential ratios). They're coarse but **explicit**: a future iteration can replace them with per-region constants or even a learned head on top of the keypoints. Body shape is then classified deterministically from the resulting ratios into one of `hourglass | inverted-triangle | triangle | oval | rectangle`.

### 4.4 Color Palette Extraction — Added

A second client-side inference pipeline runs on the same captured frame: [`utils/style-inference.js`](../../crwn-clothing-fe/src/utils/style-inference.js). It downsamples the image to 64×64, bins each pixel into a 4×4×4 RGB cube (64 buckets), takes the top 5 most-populated buckets, averages each, and converts to hex. That's the user's dominant palette.

Each palette is then classified into one of six buckets — `warm`, `cool`, `neutral`, `earth`, `jewel`, `monochrome` — via Euclidean color distance against four anchor RGB triples per bucket. The bucket classification is fast (constant time per palette), explainable, and trivially extendable. The user sees their bucket label in the onboarding review ("Palette: Earth") and the bucket goes into the recommendation scoring.

### 4.5 Body Profile Schema — Extended

The User table picked up new columns:

- `heightCm`, `weightKg`, `bmi`, `chestCm`, `waistCm`, `hipCm`, `inseamCm`, `shoulderCm` — `FLOAT, nullable`
- `preferredFit`, `bodyShape` — `STRING, nullable`
- `landmarkSummary`, `landmarkModel` — `JSONB / STRING, nullable`
- `recommendationVersion` — `STRING, nullable`
- `onboardingCompletedAt` — `DATE, nullable` (the truthiness driver for "set up" vs "update" wording across the app)
- **New this phase:** `preferredStyles`, `preferredPalettes` — `JSONB, nullable`

Server-side validation in [`bodyProfileValidation.ts`](../src/controllers/user/bodyProfileValidation.ts) was hardened:

- Top-level whitelist `BODY_PROFILE_KEYS` rejects any unknown field with a 400 before parsing.
- Per-field range validation on every numeric (`heightCm` ∈ [130, 220], confidence ∈ [0, 1], etc.).
- New enum allowlists for the preference fields:

```ts
const STYLE_OPTIONS = new Set([
  'minimalist', 'streetwear', 'classic', 'bohemian',
  'sporty', 'edgy', 'preppy', 'vintage'
]);
const PALETTE_OPTIONS = new Set([
  'earth-tones', 'monochrome', 'pastels', 'jewel-tones',
  'warm-neutrals', 'bold-brights', 'cool-tones', 'sunset'
]);
```

Any non-enum value throws 400. Arrays are deduped server-side.

### 4.6 Recommendation Engine — Added

Three independent signals composed into a single rank.

**Size score** ([`utils/size-recommendation.js`](../../crwn-clothing-fe/src/utils/size-recommendation.js)) — for each size row in the product's `sizeChartJson`, scores against the user's measurements with asymmetric penalties (linear for "too big", harsher for "too small") and a `preferredFit` boost. Returns `{ recommendedSize, alternates, confidence (0–1), explanation, reasonTags }`.

**Photo-derived style score** ([`utils/product-style-match.js`](../../crwn-clothing-fe/src/utils/product-style-match.js)) — `scoreProductStyle(product, styleProfile)` combines:

- **Palette match**: average minimum color distance between the user's top palette colors and the product's `paletteHex` (when seeded).
- **Silhouette tag match**: maps inferred silhouette (`hourglass`, `rectangle`, etc.) to clothing-vocabulary tags (`fitted`, `wide-leg`, `belted`) and counts overlap with the product's `recommendationTags`.

Returns `{ score, paletteScore, tagScore }`, weighted 65/35 favoring palette.

**Explicit preference score** — `scoreProductPreferences(product, { preferredStyles, preferredPalettes })`:

- Each selected style maps to clothing tags (`STYLE_TAG_MAP['streetwear'] = ['casual', 'bold', 'oversized', 'athletic']`) and counts hits in `recommendationTags`.
- Each selected palette maps to a bucket (`'earth-tones' → 'earth'`) and checks if the product carries that bucket name as a tag.

Weighted 60/40 favoring style. Returns `{ score, styleScore, paletteScore }`.

**Combined formula** used by the home rail and the shop's "Recommended" sort:

```
combinedScore = 0.4  × sizeConfidence
              + 0.3  × photoStyleScore
              + 0.3  × explicitPreferenceScore
              + 0.1  × hasRecommendedSizeBonus
```

The weights give size primacy (it's the most actionable for the shopper) while still letting style preferences meaningfully reorder the catalog.

**Where it surfaces:**

| Surface | Score used | Rendered as |
|---------|-----------|-------------|
| Product card | size only | "Fit M · 84% match" badge + reason chips |
| Home "Picked for you" rail | combined | top 4 products with size/style/preference percentages |
| Shop default sort | combined | grid order |
| Shop "Best fit first" sort | size only | grid order |
| Shop "Fits me" toggle | size confidence > 0.55 | filter, not sort |
| Cart item | size only | ✓ "your fit" or warning "recommended M" |
| Checkout summary | size only | aggregate "All N match ✓" or "X match · Y differ" |
| Product detail "Why we recommend M" | per-measurement deltas | row-by-row `Your chest 96 → M chart 98 = +2 cm` |

### 4.7 Style Preferences (4×2 Tiles) — Added

A new wizard step ([`preferences-step.jsx`](../../crwn-clothing-fe/src/routes/onboarding/steps/preferences-step.jsx)) with two 4×2 tile grids (responsive 2×4 on mobile):

- **Preferred styles**: Minimalist, Streetwear, Classic, Bohemian, Sporty, Edgy, Preppy, Vintage. Each tile has an emoji, label, and one-line description.
- **Color palettes**: Earth Tones, Monochrome, Pastels, Jewel Tones, Warm Neutrals, Bold Brights, Cool Tones, Sunset. Each tile renders four actual color swatches you can see.

Multi-select; selected tiles get a primary border, light fill, and a checkmark badge in the corner. Counter under each grid heading: "X selected." Optional — primary CTA flips between "Skip — review profile" and "Continue to review" based on selection count.

[`preferences-options.js`](../../crwn-clothing-fe/src/routes/onboarding/preferences-options.js) is the single source of truth for these IDs, descriptions, and recommendation-tag mappings. Adding a 9th style is a one-line addition. The BE validator's allowlists mirror these IDs.

### 4.8 Multi-Theme Design System — Added

A layered system replacing the previous half-finished dark mode:

- **`base.js`** — non-color tokens shared across themes (typography, spacing, border-radius, transitions, breakpoints, z-index).
- **`light.js`, `dark.js`, `sunset.js`** — variants that each export a complete theme via `composeTheme()`.
- **`themes/index.js`** — exports the variants, `getTheme(name)`, `nextThemeName(current)`, and `THEME_LABELS` for the toggle UI.
- **`contexts/theme-context.jsx`** — the runtime: reads `localStorage` (or `prefers-color-scheme` on first visit), holds the current theme name, applies the variant's `cssVars` to `document.documentElement` so legacy raw-CSS still themes, and wraps `styled-components`' `ThemeProvider` so styled trees see the right tokens.

Each variant exports a structured theme:

```js
{
  name: 'sunset',
  colors: {
    primary, secondary, accent, neutral,
    semantic: {
      background: { primary, surface, elevated, overlay },
      text:       { primary, secondary, muted, inverse },
      border:     { subtle, base, strong },
      success, warning, error, info,
    },
  },
  glass: { light, medium, dark },
  shadows: { sm, base, md, lg, xl, '2xl', inner, colored, coloredHover },
  cssVars: { '--color-primary': '#431407', /* ... */ },
  ...baseTokens
}
```

The `semantic` namespace was the key insight — most components had been written against `theme.colors.primary.main` directly, which made dark mode break in unexpected places. Pulling concepts like "page background", "elevated surface", and "subtle border" up into named semantic tokens, then refactoring the noisiest files, made theme switching deterministic.

[`styles/style-helpers.js`](../../crwn-clothing-fe/src/styles/style-helpers.js) exports tiny accessors so per-component refactors stayed short:

```js
export const surface = (t) => t?.colors?.semantic?.background?.surface || '#ffffff';
export const textPrimary = (t) => t?.colors?.semantic?.text?.primary || '#0f172a';
export const borderSubtle = (t) => t?.colors?.semantic?.border?.subtle || 'rgba(148,163,184,0.18)';
export const primary = (t) => t?.colors?.primary?.main || '#6366F1';
export const alpha = (hex, a) => /* hex → rgba */;
```

Components refactored to consume these: product card, cart drawer + cart item, checkout item, hero, authentication shell + sign-in + sign-up forms, form input, navigation dock + search modal + profile popover, onboarding wizard styles, product detail, shop styles + filter sidebar, category preview.

The nav cycles ☀️ Light → 🌙 Dark → 🌅 Sunset on click. The choice persists to `localStorage` under `crwn-theme`. Theme variants:

- **Light** — default. Indigo primary, pink secondary, emerald accent. Slate neutrals.
- **Dark** — true dark backgrounds (slate-950 / slate-900), softer indigo and pink primaries, light text.
- **Sunset** — warm coral primary, gold secondary, purple accent. Cream backgrounds. Designed to feel evening / fashion-magazine, deliberately different from a typical SaaS dark mode.

### 4.9 Shop Page — Rebuilt

Old shop: `<CategoriesPreview />` over `<Category />` with a non-functional filter modal and a Floating Action Button. New shop ([`routes/shop/`](../../crwn-clothing-fe/src/routes/shop/)):

- Single unified component handles both `/shop` and `/shop/:category` (URL drives initial category filter, all other filters in component state).
- Sticky glass toolbar at the top: search input, sort dropdown (Recommended / Best fit / Price ↑↓ / Name), and a "✨ Fits me" toggle that's disabled until the user has scanned (with explanatory tooltip).
- **Sort = "Recommended"** combines size confidence + style score + preference score; otherwise alphabetical when no profile.
- Sidebar filters that **actually filter**:
  - Category chips (all + each category) with item counts
  - Sizes (XS–XXL) — products must offer at least one selected size
  - Fit type (slim/regular/oversized)
  - Price min/max
  - 🎨 "My palette" toggle (only appears once a style profile exists)
- Active filter chips above the grid, each with `×` to remove individually, plus a "Clear all" button.
- Results bar: `42 results · 14 fit your size` (the green count appears once a profile exists).
- Empty state with a "Clear filters" CTA.
- Mobile drawer: `☰ Filters` button opens the sidebar as a slide-in overlay with sticky header (title + close) and sticky footer (Reset + "Show N results"). Auto-shows inline on desktop.
- Animated grid: framer-motion staggered fade-in, plus `layout` so re-sorting feels smooth instead of janky.

Removed orphan code: `routes/category/` (its `color: white` title was invisible on light theme), `routes/categories-preview/`, `components/filter-panel/` (the modal whose apply handler just `console.log`-ed), `components/floating-action-button/` (toast-spam scroll-to-top). Routes simplified from `shop/*` + nested Routes to two flat routes.

### 4.10 Product Detail Page — Added

New route `/product/:productId` — [`routes/product-detail/`](../../crwn-clothing-fe/src/routes/product-detail/). Layout: hero gallery left, info right (title, price, description, fit-type pill, recommended-size pill, style-match percentage), size picker (recommended size is starred), full size chart with the active row highlighted, and a **"Why we recommend size X" panel** showing per-measurement deltas:

```
Your chest 96 cm → M chart 98 cm = +2 cm
Your waist 82 cm → M chart 88 cm = +6 cm
```

Plus a style-match panel showing the user's palette swatches alongside the product's match score. ProductCard image + footer click navigates here; QuickView modal stays accessible as a secondary action.

### 4.11 Cart & Checkout Fit Awareness — Added

[`cart-item.component.jsx`](../../crwn-clothing-fe/src/components/cart-item/cart-item.component.jsx) and [`checkout-item.component.jsx`](../../crwn-clothing-fe/src/components/checkout-item/checkout-item.component.jsx) — show "✓ your fit" or warning "recommended M" chips next to the selected size based on a real-time `getRecommendedSize(cartItem, bodyProfile)` call.

[`checkout.component.jsx`](../../crwn-clothing-fe/src/routes/checkout/checkout.component.jsx) — the order summary now aggregates fit status: "All N match your fit ✓" or "X match · Y differ from recommendation". The whole checkout page was also restructured into a two-column desktop layout (items left, sticky summary + payment right) that stacks cleanly on mobile.

### 4.12 Navigation Pass — Reworked

[`navigation.styles.jsx`](../../crwn-clothing-fe/src/routes/navigation/navigation.styles.jsx) + [`navigation.component.jsx`](../../crwn-clothing-fe/src/routes/navigation/navigation.component.jsx):

- All hardcoded color literals replaced with semantic theme tokens, so dark and sunset themes render correctly across the dock, brand badge, search modal, and profile menu.
- Brand badge uses the theme's primary gradient + colored shadow.
- New **profile dropdown** for signed-in users showing height, fit, body shape, and palette bucket — with a quick "Re-scan fit profile" link and a sign-out button. Closes on outside click.
- The "Fit Profile" text link in the dock was replaced with a 📐 icon button with a tooltip. A small green dot badge sits on the icon's top-right when a complete profile exists. Clicking takes returning users into edit mode (measurements pre-filled, jumping past the camera step unless they want to re-scan).
- Page transitions: the `<Outlet />` is wrapped in `AnimatePresence` keyed on `location.pathname`. Each route fades + slides in 220ms.

### 4.13 Hero, Authentication, Forms — Theme Refactored

The hero on the home page had a hardcoded "Update Fit Profile" CTA regardless of profile state. Now it reads from Redux: the button label and subtitle text both flip between "Set up fit profile" + welcome-new-user copy and "Update fit profile" + "Welcome back…" copy based on `bodyProfile?.onboardingCompletedAt`.

Authentication shell, sign-in form, and sign-up form: switched off hardcoded `#0f172a` / `#475569` / `rgba(255,255,255, *)` literals onto theme tokens via the style-helper accessors. The floating-label form input was rebuilt the same way.

A subtle but important fix in the user reducer: on `SIGN_IN_SUCCESS` / `SIGN_UP_SUCCESS`, `bodyProfile` is now populated from the user object **only if** `onboardingCompletedAt` is set. Returning users with completed profiles see their data immediately on login; the wording across nav, hero, and home rails is consistently "Update / Edit / Re-scan" or "Set up" based on a single source of truth.

### 4.14 Logout Flow — Tightened

`handleSignOut` in the navigation now navigates to `/onboarding` immediately after dispatching `signOutStart`. Since the wizard's account step contains the sign-up form (with a "I already have an account" deep link to `/auth`), the post-logout state lands the user on the most useful screen: the entry point of the app.

Plus an auth guard in [`onboarding.route.jsx`](../../crwn-clothing-fe/src/routes/onboarding/onboarding.route.jsx) — when `isAuthenticated` flips false, the wizard force-resets to `step: "account"`. Otherwise the previous user's wizard state could resume on a later step (it's persisted in `sessionStorage`), letting them see capture/measurements without being signed in.

### 4.15 Search & Filter Drawer — Polished

Search dropdown was getting clipped because `SearchResults` was `position: absolute` inside a `SearchModalCard` with `overflow: auto`. Two-part fix:

- [`search-bar.styles.jsx`](../../crwn-clothing-fe/src/components/search-bar/search-bar.styles.jsx) — `SearchResults` is now flowing inline below the input (relative position), with z-index bumped to 1700.
- [`navigation.styles.jsx`](../../crwn-clothing-fe/src/routes/navigation/navigation.styles.jsx) + component — split the modal into a fixed `SearchModalCard` shell and an inner `SearchModalBody` that owns the scrolling. Header stays pinned, results scroll with the body.

Mobile filter drawer redesign in the new shop ([`shop.styles.jsx`](../../crwn-clothing-fe/src/routes/shop/shop.styles.jsx)):

- Slides in from the right with a 320ms ease curve.
- Sticky header at the top with "Filters" title and `×` close button.
- Sticky footer at the bottom with "Reset" and a primary "Show N results" CTA that closes the drawer.
- Backdrop fades in/out with the drawer.
- Body content scrolls with the bottom CTA always visible (extra `padding-bottom` prevents the last filter from being hidden).

### 4.16 Catalog Expansion — Done

The seed catalog tripled from 12 to 36 products (9 per category) in [`seed-data.ts`](../src/seed-data.ts). New products span:

- **Shirts & Tops**: Striped Polo, Linen Button-Up, Hoodie, Turtleneck, Tank, Flannel
- **Pants**: Cargo, Wide-Leg Linen, Joggers, Pleated Dress Pants, Cropped Skinny, Corduroy
- **Outerwear**: Pea Coat, Puffer, Trench, Bomber, Windbreaker, Sherpa Vest
- **Accessories**: Beanie, Crossbody Bag, Sunglasses, Pocket Square, Wallet, Gloves

Each product carries a real `sizeChartJson` and `recommendationTags` so the recommendation engine has signal to work with.

Image reliability: a small curated pool of well-known Unsplash photo IDs is rotated across the 36 products by garment type. The product card now has a **two-step image fallback chain** ([`product-card.component.jsx`](../../crwn-clothing-fe/src/components/product-card/product-card.component.jsx)):

1. Try the seeded Unsplash URL → real fashion photo when it works
2. If Unsplash 404s, fall back to a Picsum URL with the product's seed → guaranteed-loading deterministic image
3. Only after both fail does it show the default illustration SVG

Worst case is a generic Picsum image (still always loads), best case is the real fashion photo — never a broken-image icon. The BE seed loop overwrites picsum/loremflickr/unsplash URLs on re-seed but leaves admin-edited URLs alone.

---

## 5. New Technologies Added

These were not in the codebase before this phase:

| Tool | Version | Why |
|------|---------|-----|
| `react-webcam` | 7.2 | Cleaner camera lifecycle than raw `getUserMedia` — handles facingMode toggling, `getScreenshot()` API, error events |
| `framer-motion` | 12.38 | Page transitions, `AnimatePresence` on route change, layout animations on the shop grid, wizard step transitions |
| `@tensorflow-models/pose-detection` | 2.0 | MoveNet Thunder + Lightning |
| `@tensorflow-models/face-landmarks-detection` | 1.0 | MediaPipe FaceMesh wrapper |
| `@tensorflow/tfjs-core`, `@tensorflow/tfjs-backend-webgl` | 4.22 | Runtime + GPU backend |
| `@mediapipe/face_mesh`, `@mediapipe/pose` | 0.4 / 0.5 | Model weights |

The reference implementation that informed our pipeline architecture: [magdazelena/face-landmark-detection](https://github.com/magdazelena/face-landmark-detection) on GitHub — single-shot inference on captured frames is borrowed from there and proved much more reliable than the live-loop measurement pattern that broke initially.

Existing tools that were leaned on more heavily this phase (already in the project, not newly added): styled-components, Redux Saga (for the multi-step async signup → token → fetch user flow), Redux Persist, TanStack React Query, Sequelize JSONB columns.

---

## 6. New Security Considerations

The auth and payment surfaces were not modified. New security-relevant additions:

### 6.1 On-Device Computer Vision

The single most important security property of the new work:

> **The body photo never leaves the user's device.**

The TF.js inference happens in the browser tab. The captured frame is held in component state (a base64 dataURL) for the duration of the wizard, persisted **only to `sessionStorage`** (cleared when the tab closes), and is never sent to the server. What goes to the server is:

- The derived measurements (numbers, in cm)
- A pruned `landmarkSummary` containing only a confidence score
- An optional `landmarkModel` string identifying which model produced the result
- The user's explicit style and palette preferences (allowlisted strings)

This is enforced not by policy but by code — there's literally no upload endpoint for photos. The captured dataURL is referenced in the wizard's `capture.photoDataUrl` only for the in-memory inference + retry preview, then dropped on `wizard.reset()` after submit.

### 6.2 Allowlisted Preference Inputs

The new `preferredStyles` and `preferredPalettes` fields are JSONB columns — without strict validation, they'd be a free-form string-blob injection target. Defense:

- **Top-level whitelist** in `BODY_PROFILE_KEYS` rejects any unknown field.
- **Enum allowlists** (`STYLE_OPTIONS` / `PALETTE_OPTIONS` `Set<string>`) reject any value the FE doesn't render.
- **Type checking** rejects non-array, non-string, or empty entries.
- **Dedup** server-side prevents inflating the array.

Net effect: the only thing that can land in those JSONB columns is one of the 16 known IDs.

### 6.3 Wizard-State Persistence

The wizard's `sessionStorage` payload **explicitly strips passwords** before serialization:

```js
const safe = {
  ...state,
  account: { ...state.account, password: '', confirmPassword: '' }
};
window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
```

A refresh in the middle of the wizard preserves your name and email but never holds the password in browser storage.

### 6.4 Wizard Auth Guard

The new logout-flow guard in [`onboarding.route.jsx`](../../crwn-clothing-fe/src/routes/onboarding/onboarding.route.jsx) force-resets the wizard to step 1 when authentication is lost. Otherwise, the previous user's wizard state in `sessionStorage` could let an unauthenticated user see capture/measurements steps.

### 6.5 What's Still Open (Pre-Existing, Not New)

These existed before and were not addressed:

- JWT lives in `localStorage` via redux-persist → exposed to XSS. Mitigation: short access-token TTL (1h).
- No rate-limiting on auth endpoints.
- No CSP / SRI on the build.
- `sequelize.sync({ alter: true })` runs at boot — dev-friendly but unsafe in prod.

---

## 7. Future Work Generated By These Changes

A short list of well-defined extensions, ordered by impact-per-week:

1. **Per-product `paletteHex` extraction** — run color quantization on each product image at seed time and store the palette in a JSONB column. The current style-matching uses the user's palette but products lack their own seeded palettes, so the score falls back to tag overlap.
2. **A/B-able recommendation weights** — the 0.4 / 0.3 / 0.3 / 0.1 blend is hardcoded. Surface it as feature flags + log the resulting recommendation choices for offline analysis.
3. **Save the captured photo to encrypted device storage** with explicit user consent, so re-running inference (e.g. trying a new model) doesn't require re-shooting.
4. **Mobile-specific optimization** — measure FPS of the live overlay on a mid-range Android. May need to drop to a smaller MoveNet model or sub-sample the frame.
5. **WebGPU backend** — the dependency is already installed but unused. WebGPU on supporting browsers is ~2× faster than WebGL for these models.
6. **A "try it on" view** — overlay the product silhouette over the captured photo using the same pose keypoints as anchor points. Stretch goal but visually compelling.
7. **Analytics + event log** — persist the `recommendation` reason chips alongside cart-add events, so we can later compute "did the recommended size correlate with lower returns?"
8. **Admin product editor that pulls live Unsplash photos** via the official API. Today's seeded URLs are best-effort; a real product upload flow would solve image reliability for good.

---

*This document captures the implementation contributions of this phase. For the broader project narrative — the e-commerce → fit-aware framing, the system architecture, the technology stack overview, and the full security and future-work treatment — see [THESIS.md](THESIS.md).*
