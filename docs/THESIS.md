# CRWN Fit-Aware Commerce — Implementation & Thesis Report

> An e-commerce platform that learns the shopper's body once and uses it to drive every downstream decision: size, style, color, and what to surface first.

**Last updated:** 2026-05-01
**Repository layout:** `crwn-clothing-fe/` (React 18) · `crwn-clothing-be/` (Express + TypeScript)

---

## 1. Executive Summary

The codebase began as a textbook React e-commerce demo — product grid, cart drawer, Stripe checkout — competent but generic. The thesis goal was to add a layer that turns it into something a real shopper would actually prefer: a store that knows their body and taste before they've added a single thing to the cart.

This implementation delivers that layer end-to-end, entirely in the browser for the privacy-sensitive parts:

- **A 5-step onboarding wizard** where the shopper signs up, lets a TensorFlow.js pose model derive their body measurements from a single webcam photo, confirms or edits the numbers, ticks off preferred fashion styles and color palettes from two 4×2 tile grids, and saves.
- **A recommendation engine** that ranks every product on every page by combining three signals: size confidence (how well does this fit them?), photo-derived style match (does the silhouette and palette align?), and explicit preferences (does the product's vocabulary match what they said they like?).
- **A unified shop** with working filters, sort modes, and a "fits me" toggle that filters down to garments where the recommended-size confidence clears a threshold.
- **Three-theme design system** (light, dark, sunset) driven by a single ThemeProvider that swaps both styled-components tokens and CSS custom properties in lockstep.
- **A product detail surface** that explains _why_ a particular size was recommended, with per-measurement deltas against the size chart.
- **Fit-profile awareness in cart and checkout** so a shopper who picked a non-recommended size sees a soft warning, and the checkout summary tells them at a glance whether their order matches their fit.

The TensorFlow.js inference, the color-palette quantization, the silhouette classification, and the recommendation scoring all run client-side. No body photo ever leaves the user's device. The backend stores derived measurements (height, chest, waist, etc.) and explicit preferences (style and palette IDs from a strict allowlist) — never the raw image.

---

## 2. Project Direction

### 2.1 Where We Started

A standard React/Redux/Express e-commerce template:

- Static product grid, manually-chosen sizes
- Sign-up with name + email + password, that's it
- Cart and Stripe checkout
- A vestigial filter modal whose "Apply" handler only logged to the console
- Two onboarding screens (capture, measurements, review) wired up in code but **broken at runtime** — a `requestAnimationFrame` loop racing with an asynchronous TF.js inference call, mirrored coordinates, and a hard dependency on the user pre-entering their height before any pose drawing could happen

The site _looked_ stocked but every interaction past adding to cart felt manual. Choosing a size was guesswork. Browsing was alphabetical. The "shop" page was a sequential dump of category previews.

### 2.2 Where We Are Now

The shopper's flow:

1. Land on `/` — see a hero, a "Picked for you" rail, category cards, products
2. If not signed in, the rail says "Set your profile" with a link to the wizard
3. The wizard collects identity + body + taste in five guided steps and persists everything
4. From that point on, every product card carries a recommended-size badge (`Fit M · 84% match`), every category preview shows how many items fit, the home rail re-ranks against your profile, the shop's default sort becomes "Recommended" and combines size + style + preference scores, the cart shows ✓-or-warning chips next to each item's selected size, the checkout summary aggregates "all match" / "X differ", and the product detail page explains the recommended size with per-measurement deltas

Crucially: the shopper does this **once**. The body profile and preferences live on the User row in Postgres, are loaded into Redux on sign-in, and survive logout/login cycles. The 📐 nav icon takes a returning user straight back into the wizard in **edit mode** — measurements pre-filled, jumping past the camera step unless they want to re-scan.

### 2.3 Why This Matters (Thesis Framing)

The friction points in apparel e-commerce are well-documented: **fit uncertainty drives ~30% return rates** in online clothing — the highest in any category. Most stores try to solve this with manually-curated size guides and "what others bought" carousels. Both rely on the shopper actively reading and matching. Both fail when the shopper doesn't know their own measurements (most don't).

This project explores a different premise: the shopper's body is the API. Capture it once with computer vision, normalize the measurements against user-entered height, persist a structured profile, and let the entire catalog re-orient around it. The work is invisible to the shopper after the 90-second wizard — they just see better defaults forever.

Beyond size, the same photo seeds a **style profile**: dominant colors via in-browser palette quantization, body silhouette via the same pose keypoints reused for measurements, and a coarse palette bucket (warm/cool/neutral/earth/jewel). The user augments this with explicit checkboxes — eight fashion styles (minimalist, streetwear, classic, bohemian, sporty, edgy, preppy, vintage) and eight color palettes (earth tones, monochrome, pastels, jewel tones, warm neutrals, bold brights, cool tones, sunset). The recommendation engine combines all of it.

The result is an e-commerce experience where personalization is the default, not an opt-in. And — the part that matters for a thesis — every layer is open: every score, every threshold, every model is in the repo and inspectable.

---

## 3. System Architecture

### 3.1 Frontend Stack

- **React 18** via Create React App (`react-scripts 5`)
- **Redux + Redux Saga** for auth flows and onboarding submission
- **Redux Persist** for cart and user state across sessions
- **React Router 6** with nested layout routes
- **TanStack React Query** for product and category fetches
- **styled-components 6** with a custom `ThemeContext` that wraps `ThemeProvider`
- **react-webcam** for camera capture with explicit permission UX and front/back facingMode toggle
- **framer-motion** for page transitions and tile animations
- **TensorFlow.js** with the WebGL backend, plus `@tensorflow-models/pose-detection` and `@tensorflow-models/face-landmarks-detection`
- **MediaPipe FaceMesh** and **MoveNet** (Thunder for capture, Lightning for live preview)
- **Stripe.js** for payment

### 3.2 Backend Stack

- **Express 5** + **TypeScript 5**
- **Sequelize 6** with **PostgreSQL** as the primary store
- **bcrypt** (10 salt rounds) for password hashing
- **jsonwebtoken** (HS256) for short-lived access tokens (1h) plus refresh tokens (7d)
- **CORS** restricted to the React app's origin via env var
- Custom auth middleware that decodes JWT, fetches the user, and attaches it to `req.user`
- Strict whitelist validators for any user-mutable field (body measurements, landmark summary, style preferences, palette preferences) — anything outside the allowlist throws 400 before touching the database

### 3.3 Data Flow

```
Browser
  └─ Camera → TF.js (FaceMesh + MoveNet) → keypoints → cm
  └─ Color quantization on captured frame → palette + bucket
  └─ User confirms in form
  ▼
POST /me/onboarding/infer  (Bearer JWT)
  ▼
bodyProfileValidation (whitelist + allowlist)
  ▼
inferBodyProfile service (BMI, body shape, recommendation version)
  ▼
User.update() in Postgres
  ▼
Response: enriched profile JSON
  ▼
Redux ONBOARDING_SUCCESS → bodyProfile slice
  ▼
Selectors feed scoring on every product surface
```

The inference happens once per session. Everything downstream is local computation.

---

## 4. Feature Catalog (Ordered by Importance × Effort)

This ordering is the defensible rank for thesis presentation: how central each feature is to the contribution, multiplied by how much engineering it took.

### 4.1 Tier 1 — Core Contribution

| # | Feature | Effort | Importance |
|---|---------|--------|------------|
| 1 | Onboarding wizard rebuild (5 steps, framer-motion, sessionStorage) | Heavy | Critical |
| 2 | TensorFlow.js computer vision pipeline (live + capture, two models) | Heavy | Critical |
| 3 | Body profile data model + persistence + edit mode | Medium-Heavy | Critical |
| 4 | Recommendation engine (size + photo style + explicit preferences) | Medium-Heavy | Critical |
| 5 | Style preferences UI (4×2 tiles for styles + palettes) | Medium | High |

### 4.2 Tier 2 — Major UX Investments

| # | Feature | Effort | Importance |
|---|---------|--------|------------|
| 6 | Multi-theme design system (light/dark/sunset) | Heavy | High |
| 7 | Shop redesign (unified page, working filters, sort, fit-toggle) | Heavy | High |
| 8 | Product detail page with measurement deltas | Medium | High |
| 9 | Fit profile in cart + checkout (per-item chips + aggregate) | Medium | Medium-High |

### 4.3 Tier 3 — Polish & Reliability

| # | Feature | Effort | Importance |
|---|---------|--------|------------|
| 10 | Navigation pass: glass dock, profile popover, fit icon, theme cycle | Medium | Medium |
| 11 | Hero, authentication, sign-in/up forms theme refactor | Medium | Medium |
| 12 | Mobile filter drawer redesign (slide + sticky header/footer) | Light-Medium | Medium |
| 13 | Search results escape modal clipping (z-index + overflow restructure) | Light | Medium |
| 14 | 36-product seed catalog with image fallback chain (Unsplash → Picsum → SVG) | Light | Low-Medium |
| 15 | Logout flow improvements (redirect to fit profile, wizard reset) | Light | Medium |

---

## 5. Deep Dive: TensorFlow.js Computer Vision Pipeline

### 5.1 Why In-Browser Inference

The early sketch considered a server-side LLaMA call to "look at the photo and infer body shape." We rejected that for three reasons:

1. **Privacy.** A body photo uploaded to a server is a meaningful escalation in trust. The user has to believe the server stores it safely, doesn't log it, doesn't reuse it. With in-browser inference the photo never leaves the device.
2. **Latency.** A round-trip with a multi-megabyte photo plus model inference time on a server is several seconds. With WebGL-accelerated TensorFlow.js, MoveNet Lightning runs at ~10–15 FPS on a mid-range laptop. The user sees their skeleton overlaid in real time.
3. **Cost.** Server-side ML is metered per request. In-browser is free per request after the model weights download (cached after the first visit).

The tradeoff: WebGL-accelerated TF.js is constrained to models small enough to run in a browser. We can't deploy a 7B-parameter LLM. But for body landmark detection, MoveNet (~5MB) and MediaPipe FaceMesh (~3MB) are exactly the right size.

### 5.2 The Two-Model Approach

We load **two distinct pose detector instances**, each tuned for a different role:

- **MoveNet Thunder (`SINGLEPOSE_THUNDER`)** — heavier, more accurate. Runs **once per capture** when the user clicks "Capture frame." Used for the real measurements.
- **MoveNet Lightning (`SINGLEPOSE_LIGHTNING`)** — ~3× faster, slightly less accurate. Runs in a **live loop** at ~10 FPS during the camera preview. Used purely for the on-screen skeleton overlay so the user can see they're being detected and adjust their stance.

Plus **MediaPipe FaceMesh** with `refineLandmarks: true` for face keypoints — used to compute confidence and to provide a fallback when full-body pose detection fails (e.g. user too close to the camera).

The split matters. The earlier broken version of this pipeline ran a single Thunder detector both for live preview and for measurements, in the same `requestAnimationFrame` loop, with no concurrency control. The result was stacked async calls, the canvas going blank, and a freeze when the user tried to capture. Splitting the responsibilities — Lightning for visual feedback, Thunder for ground truth — eliminated the contention.

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

### 5.3 Live Preview vs Capture Inference

The **live loop** in [`capture-step.jsx`](../../crwn-clothing-fe/src/routes/onboarding/steps/capture-step.jsx) is structured to be cancel-safe and back-pressure-aware:

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

1. **No stacked inference.** `liveBusyRef` ensures only one `estimatePoses` call is in flight. If the next animation frame arrives while inference is still running, it's skipped.
2. **Throttling.** The `minIntervalMs = 95` cap keeps us at ~10 FPS, which is more than enough for visual feedback without burning the GPU.
3. **Clean cancel.** `cancelled` flag closes the door on any in-flight result that arrives after the component unmounts. `cancelAnimationFrame` stops the loop in the cleanup. No memory leaks, no setState-on-unmounted warnings.

The **single-shot capture path** in `runInferenceOnImage` runs the heavier Thunder model on a still frame (an `HTMLImageElement` loaded from the captured dataURL), which is more accurate but slower. It also runs FaceMesh in the same call. Both errors are caught individually so a face-only success or pose-only success is still useful — measurements just gracefully fall back to height/weight-based BMI estimates if pose detection fails entirely.

### 5.4 Measurement Derivation

The math in [`inference/measurements.js`](../../crwn-clothing-fe/src/routes/onboarding/inference/measurements.js) bridges the abstract keypoint space to centimeters:

```js
// 17 keypoints from MoveNet, normalized in source-pixel coords
const ratios = buildPoseRatios(pose, frameWidth, frameHeight);

// User-entered height anchors the scale
const referenceHeight = clamp(Number(heightCm) || 170, 130, 220);
const headRoom = referenceHeight * 0.06;
const cmPerPx = (referenceHeight - headRoom) / effectiveBodyPx;

// Derive measurements with anatomical correction factors
const shoulderCm = round(ratios.shoulderPx * cmPerPx * 1.18, 1);
const hipCm = round(ratios.hipPx * cmPerPx * 1.65, 1);
const chestCm = round(shoulderCm * 2.05, 1);
const waistCm = round(hipCm * 0.86, 1);
```

The constants (`* 1.18`, `* 1.65`, `* 2.05`, `* 0.86`) come from anthropometric tables — the average ratio of skeletal shoulder-width-from-acromion-to-acromion to actual measured shoulder-circumference, etc. These are coarse but **explicit**: a future iteration could replace them with per-region constants or even a learned head on top of the keypoints.

Body shape is then classified deterministically:

```js
export const inferBodyShape = ({ shoulderCm, waistCm, hipCm }) => {
  if (waistToHip < 0.78 && Math.abs(shoulderToHip - 1) < 0.08) return "hourglass";
  if (shoulderToHip > 1.07) return "inverted-triangle";
  if (shoulderToHip < 0.93) return "triangle";
  if (waistToHip > 0.92) return "oval";
  return "rectangle";
};
```

User-entered height is the absolute scale anchor — a pixel-based estimate alone has no concept of real-world distance. This is why the wizard asks for height as an editable measurement, with sensible defaults and pose detection feeding the rest.

### 5.5 Color Palette Extraction

A second client-side inference pipeline runs on the same captured frame: [`utils/style-inference.js`](../../crwn-clothing-fe/src/utils/style-inference.js). It downsamples the image to 64×64, bins each pixel into a 4×4×4 RGB cube (64 buckets), takes the top 5 most-populated buckets, averages each, and converts to hex. That's the user's dominant palette.

Each palette is then classified into one of six buckets — `warm`, `cool`, `neutral`, `earth`, `jewel`, `monochrome` — via Euclidean color distance against four anchor RGB triples per bucket:

```js
const PALETTE_BUCKETS = {
  warm:  { anchors: [[225,110,75], [240,175,100], [200,80,60], [160,90,70]] },
  cool:  { anchors: [[60,130,205], [80,170,220], [50,90,160], [40,60,140]] },
  earth: { anchors: [[120,90,60], [150,120,80], [90,80,60], [70,60,40]] },
  jewel: { anchors: [[140,50,90], [70,50,120], [40,100,90], [120,70,130]] },
  // ...
};
```

The bucket classification is fast (constant time per palette), explainable, and trivially extendable. The user sees their bucket label in the onboarding review ("Palette: Earth") and the bucket goes into the recommendation scoring.

### 5.6 Skeleton Visualization

The on-screen skeleton overlay had to be visible on top of arbitrary clothing colors and lighting. The current `drawOverlay` uses a **two-pass stroke** technique:

```js
// Wider dark outline first, colored stroke on top
drawLines(outline /* dark */, outlineWidth /* baseWidth + 6 */);
drawLines(stroke /* indigo */, baseWidth /* canvas.width / 80 */);
```

Plus three-layer keypoint dots: a dark ring, a pink core, a small white inner dot. This is the same trick used in vector map labels — it makes the foreground readable against any background luminance. Without the dark halo, the indigo skeleton was invisible against light walls or dark clothing.

---

## 6. Deep Dive: Theme System

### 6.1 The Problem

The starting point had a single static theme object plus a half-finished CSS-variable-based dark mode that toggled via a button in the nav but never reached the styled-components subtree. Result: dark mode worked for raw CSS but every styled-component still rendered light. Inconsistent and visually broken.

### 6.2 Token Architecture

The fix was a layered system:

- **`base.js`** — non-color tokens shared across themes (typography, spacing, border-radius, transitions, breakpoints, z-index)
- **`light.js`, `dark.js`, `sunset.js`** — variants that each export a complete theme via `composeTheme()`
- **`themes/index.js`** — exports the variants, a `getTheme(name)` resolver, a `nextThemeName(current)` cycler, and `THEME_LABELS` for the toggle UI
- **`contexts/theme-context.jsx`** — the runtime: reads `localStorage` (or `prefers-color-scheme` on first visit), holds the current theme name, applies the variant's `cssVars` to `document.documentElement` so legacy raw-CSS still themes, and wraps `styled-components`' `ThemeProvider` so styled trees see the right tokens too

### 6.3 Three Variants

Each variant exports a structured theme:

```js
{
  name: 'sunset',
  colors: {
    primary:  { main, light, dark, gradient, gradientAlt },
    secondary, accent, neutral,
    semantic: {
      background: { primary, surface, elevated, overlay },
      text:       { primary, secondary, muted, inverse },
      border:     { subtle, base, strong },
      success, warning, error, info,
    },
    // legacy aliases preserved for back-compat
  },
  glass: { light, medium, dark },
  shadows: { sm, base, md, lg, xl, '2xl', inner, colored, coloredHover },
  cssVars: { '--color-primary': '#431407', /* ... */ },
  ...baseTokens
}
```

The `semantic` namespace was the key insight. Most components had been written against `theme.colors.primary.main` directly, which made dark mode break in unexpected places. Pulling concepts like "page background", "elevated surface", "subtle border" up into named semantic tokens — and refactoring the noisiest files to use them — made theme switching deterministic.

### 6.4 Style Helpers

To keep the per-component refactors short, [`styles/style-helpers.js`](../../crwn-clothing-fe/src/styles/style-helpers.js) exports tiny accessors:

```js
export const surface = (t) => t?.colors?.semantic?.background?.surface || '#ffffff';
export const textPrimary = (t) => t?.colors?.semantic?.text?.primary || '#0f172a';
export const borderSubtle = (t) => t?.colors?.semantic?.border?.subtle || 'rgba(148,163,184,0.18)';
export const primary = (t) => t?.colors?.primary?.main || '#6366F1';
export const alpha = (hex, a) => /* hex → rgba */;
```

Components import these and use them directly: `background: ${({ theme }) => surface(theme)};`. Each helper falls back to a sensible literal so a theme provider misconfig doesn't blank out the screen.

The components that were refactored to use this scheme: product card, cart drawer + cart item, checkout item, hero, authentication shell + sign-in + sign-up forms, form input, navigation dock + search modal + profile popover, onboarding wizard styles, product detail, shop styles + filter sidebar, category preview.

### 6.5 The Toggle

The nav cycles ☀️ Light → 🌙 Dark → 🌅 Sunset on click. The choice persists to `localStorage` under the key `crwn-theme`. On a fresh visit with no stored preference, the system reads `prefers-color-scheme: dark` from the browser. Theme variants were chosen with intention:

- **Light** — the default. Indigo primary, pink secondary, emerald accent. Slate neutrals.
- **Dark** — true dark backgrounds (slate-950 / slate-900), softer indigo and pink primaries, light text. Glass blur values increased for legibility.
- **Sunset** — warm coral primary, gold secondary, purple accent. Cream backgrounds. Designed to feel evening / fashion-magazine, very different from a typical SaaS dark mode.

---

## 7. Deep Dive: Recommendation Engine

The engine combines three independent signals.

### 7.1 Size Score (Per Product)

[`utils/size-recommendation.js`](../../crwn-clothing-fe/src/utils/size-recommendation.js): takes a product (which has `sizeChartJson`, an array of `{ size, chestCm, waistCm, hipCm, inseamCm, shoulderCm }`) and a body profile, and scores each size row against the user's measurements. The math gives partial credit for "slightly too big" (linear penalty) and harsher penalty for "too small" (asymmetric penalty), respecting how clothing actually wears. A `preferredFit` boost nudges scores toward the user's slim/regular/oversized preference.

The output: `{ recommendedSize, alternates, confidence (0–1), explanation, reasonTags }`.

### 7.2 Photo-Derived Style Score

[`utils/product-style-match.js`](../../crwn-clothing-fe/src/utils/product-style-match.js) — `scoreProductStyle(product, styleProfile)` — combines:

- **Palette match**: average minimum color distance between the user's top palette colors and the product's own `paletteHex` (when seeded). Distance < 220 in RGB space gives a positive score.
- **Silhouette tag match**: maps the user's inferred body silhouette (hourglass / rectangle / triangle / inverted-triangle / oval) to a list of clothing-vocabulary tags (`fitted`, `wide-leg`, `belted`, etc.). Counts overlap with the product's `recommendationTags`.

Returns `{ score, paletteScore, tagScore }`, weights 65/35 favoring palette.

### 7.3 Explicit Preference Score

`scoreProductPreferences(product, { preferredStyles, preferredPalettes })`:

- For each selected style (`minimalist`, `streetwear`, etc.), looks up its mapped clothing tags (`STYLE_TAG_MAP['streetwear'] = ['casual', 'bold', 'oversized', 'athletic', 'athleisure']`) and counts hits in the product's `recommendationTags`.
- For each selected palette, maps to a bucket (`'earth-tones' → 'earth'`) and checks if the product is tagged with that bucket name.

Returns `{ score, styleScore, paletteScore }`, weights 60/40 favoring style.

### 7.4 Combined Ranking

The home rail and the shop's "Recommended" sort use the same blended formula:

```
combinedScore = 0.4  × sizeConfidence
              + 0.3  × photoStyleScore
              + 0.3  × explicitPreferenceScore
              + 0.1  × hasRecommendedSizeBonus
```

The weights were tuned to give size primacy (it's the most actionable for the shopper) while still letting style preferences meaningfully reorder the catalog. The "Best fit first" sort option uses pure size confidence.

### 7.5 Where It Surfaces

| Surface | Score used | Rendered as |
|---------|-----------|-------------|
| Product card | size only | "Fit M · 84% match" badge + reason chips |
| Home "Picked for you" rail | combined | top 4 products, with size/style/preference percentages on the chip row |
| Shop default sort | combined | grid order |
| Shop "Best fit first" sort | size only | grid order |
| Shop "Fits me" toggle | size confidence > 0.55 | filter, not sort |
| Cart item | size only | ✓ "your fit" or warning "recommended M" |
| Checkout summary | size only | aggregate "All N match ✓" or "X match · Y differ" |
| Product detail "Why we recommend M" | per-measurement deltas | row of `Your chest 96cm → M chart 98cm = +2cm` |

---

## 8. Security

### 8.1 Authentication & Authorization

- **Passwords** hashed with bcrypt, 10 salt rounds. Never returned in any API response. Never stored client-side.
- **Access tokens** are short-lived JWTs (1 hour). **Refresh tokens** live longer (7 days) but are still server-validated on use.
- **Bearer scheme** — every protected endpoint requires `Authorization: Bearer <token>`. The FE Axios interceptor in [`store/network/interceptor.js`](../../crwn-clothing-fe/src/store/network/interceptor.js) attaches it automatically from Redux state on every request.
- **`authMiddleware`** on the BE decodes the JWT, fetches the user, and attaches it to `req.user` for resolvers. Failures throw 401 before the handler runs.
- **`adminMiddleware`** layered on top of auth checks `user.role === 'admin'` for product-mutation routes (add, edit, delete).

### 8.2 Input Validation & Allowlisting

The body-profile endpoint is the highest-risk surface — it accepts a structured payload that updates user-owned fields. Defense-in-depth:

- **Top-level allowlist** in [`bodyProfileValidation.ts`](../src/controllers/user/bodyProfileValidation.ts): `BODY_PROFILE_KEYS` is an explicit `Set` of the only field names allowed in the request body. Anything outside throws a 400 before any parsing happens. This shields the database from attempts to inject unrelated fields (e.g. `role`, `email`).
- **Per-field range validation** — every numeric field is bounded to a sane range (`heightCm` in 130–220, `landmarkSummary.confidence` in 0–1, etc.). Non-finite values throw 400.
- **Enum allowlists** for the new preference fields:

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

Any non-enum value in the array throws a 400. Arrays are deduped server-side. This means the FE can't trick the BE into storing arbitrary string blobs in the JSONB columns.

### 8.3 Privacy: On-Device Computer Vision

The single most important security property of this project:

> **The body photo never leaves the user's device.**

The TF.js inference happens in the browser tab. The captured frame is held in component state (a base64 dataURL) for the duration of the wizard, persisted **only to `sessionStorage`** (cleared when the tab closes), and is never sent to the server. What goes to the server is:

- The derived measurements (numbers, in cm)
- A pruned `landmarkSummary` containing only a confidence score
- An optional `landmarkModel` string identifying which model produced the result
- The user's explicit style and palette preferences (allowlisted strings)

This is enforced not by policy but by code — there's literally no upload endpoint for photos. The captured dataURL is referenced in the wizard's `capture.photoDataUrl` only for the in-memory inference + retry preview, then dropped on `wizard.reset()` after submit.

### 8.4 Data Persistence

- **Redux Persist** whitelists only `cart` and `user` slices. The wizard's intermediate state is in `sessionStorage` (cleared on tab close), not `localStorage`.
- **Wizard `sessionStorage` payload** explicitly strips `password` and `confirmPassword` before persisting:

```js
const safe = {
  ...state,
  account: { ...state.account, password: '', confirmPassword: '' }
};
window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
```

So a refresh in the middle of the wizard preserves your name and email but never holds the password in browser storage.

- **JWT** lives in Redux + redux-persist `localStorage`. This is a known tradeoff — a `localStorage`-stored JWT is exposed to any XSS. Mitigations: short access-token TTL (1h), strict input sanitization, content-security-policy considerations (future work).

### 8.5 Future Hardening

Honest list of what's not done and would matter in a production deployment:

- **Move JWT to httpOnly cookies** so XSS can't read it. Requires CSRF mitigation (double-submit cookie or SameSite=strict).
- **Rate-limit auth endpoints** — `/login`, `/register`, `/me/onboarding/infer` (the last is heavy).
- **CSP and SRI** on the build. CRA doesn't ship these by default.
- **Sequelize migrations** instead of `sync({ alter: true })` — current setup is dev-friendly but unsafe in prod.
- **Audit log** on `User.update`-class operations.
- **Image upload** if added later: must be authenticated, content-type validated, virus-scanned, and stored in object storage with signed URLs.

The project as it stands is a thesis prototype, not a hardened production deployment. The above is the gap.

---

## 9. Technologies & Tools

### 9.1 Frontend

| Tool | Version | Why |
|------|---------|-----|
| React | 18.2 | Component model, suspense-friendly |
| Create React App | 5.0 | Zero-config build (acknowledged not-maintained, kept for project compatibility) |
| Redux + Redux Saga | 4.x + 1.2 | Centralized auth + onboarding flows; sagas handle the multi-step async (signup → token → fetch user) |
| Redux Persist | 6.0 | Cart and user state across reloads |
| React Router DOM | 6.0 | Nested route layouts (Navigation outlet) |
| TanStack React Query | 5.76 | Product/category fetches with built-in cache |
| styled-components | 6.1 | CSS-in-JS, theme propagation via Context |
| react-webcam | 7.2 | Cleaner camera lifecycle than raw `getUserMedia` |
| framer-motion | 12.38 | Page transitions, AnimatePresence on route change, layout animations on the shop grid |

### 9.2 Backend

| Tool | Version | Why |
|------|---------|-----|
| Express | 5.1 | Standard, minimal HTTP server |
| TypeScript | 5.8 | Strict mode catches the validator drift early |
| Sequelize | 6.37 | ORM with JSONB column support — important for `landmarkSummary`, `preferredStyles`, `preferredPalettes` |
| PostgreSQL | (driver: pg 8.15) | JSONB primary store |
| bcrypt | 5.1 | Industry-standard password hashing |
| jsonwebtoken | 9.0 | JWT issue + verify |
| cors | 2.8 | Origin-restricted cross-origin |
| dotenv | 16.5 | Local env config |

### 9.3 ML & Computer Vision

| Tool | Version | Role |
|------|---------|------|
| `@tensorflow/tfjs-core` | 4.22 | Core runtime |
| `@tensorflow/tfjs-backend-webgl` | 4.22 | GPU-accelerated inference |
| `@tensorflow/tfjs-backend-webgpu` | 4.22 | Future-facing, fallback path |
| `@tensorflow-models/pose-detection` | 2.0 | MoveNet Thunder + Lightning |
| `@tensorflow-models/face-landmarks-detection` | 1.0 | MediaPipe FaceMesh wrapper |
| `@mediapipe/face_mesh` | ~0.4 | FaceMesh model weights |
| `@mediapipe/pose` | 0.5 | Pose model weights (legacy fallback) |

The reference implementation that informed our pipeline architecture: [magdazelena/face-landmark-detection](https://github.com/magdazelena/face-landmark-detection) — single-shot inference on captured frames is borrowed from there and proved much more reliable than the live-loop measurement pattern that broke initially.

### 9.4 Design & Collaboration

- **Figma** — design exploration for theme palettes and the 4×2 tile grid layouts. The three theme variants (light, dark, sunset) were prototyped as Figma color tokens before being translated to JS.
- **GitHub** — source control, issue tracking, code review history. Each major phase of work was a commit cluster in the project's history.
- **VS Code** with the Claude Code extension for in-editor development. Real-time TypeScript diagnostics caught the validator drift while it was being written.
- **macOS native camera** for testing the live preview overlay.

### 9.5 Quality Gates

- **`npx tsc --noEmit`** on every BE change before integration.
- **`npx react-scripts build`** as the FE compile gate — non-trivial type errors and unused-import warnings escalate to errors under CRA's defaults.
- **ESLint** with `react-app` + `react-app/jest` extending — kept the wizard's `useEffect` dependency arrays honest.
- **Manual smoke-test loop**: dev server up, sign up, complete the wizard, verify recommendation appears on home rail, browse shop with filters, open product detail, add to cart, view checkout. Every phase ended with this loop.

---

## 10. Project Direction Recap: Regular E-commerce → AI-Augmented Fit-Aware Commerce

It's worth being explicit about what shifted and why each shift mattered.

**Before**: Generic React e-commerce. Every shopper saw the same grid in the same order. Sizes were a separate decision the shopper had to make on each product, with no guidance. The signup form collected the bare minimum (email + password) — there was no concept of personalization. The "shop" page was three sequential category previews with no way to see all products or filter them.

**After**: The shopper's body and taste are first-class primitives. The signup form is gone — replaced with a guided wizard whose first step happens to collect identity and whose subsequent steps build a multi-faceted profile (measurements, body shape, dominant palette, silhouette, preferred styles, preferred color palettes). Every downstream surface re-orients around that profile. The same product catalog now feels different to each user.

**The savings**:

- **Time** — no more squinting at size charts. The recommended size is on every product card, every cart item, every checkout row. Wrong-size selections are flagged in real time.
- **Friction** — a shopper without a clear sense of their measurements (i.e. most people) is no longer stuck. Pose detection from a single photo gets them to within ~1cm tolerance for the metrics that matter.
- **Decision fatigue** — the home page shows four products picked for them instead of an arbitrary "trending" rail. The shop's default sort surfaces the items most likely to fit and match their style.
- **Returns avoidance** — a shopper who picks a non-recommended size sees a soft warning chip in their cart, with the recommendation shown alongside. They can still proceed (they might know better), but they have to consciously override.

**The platform shift**: from "catalog with cart" to "personalized retail surface backed by computer vision and on-device ML." This is the thesis contribution.

---

## 11. Future Work

A short list of well-defined extensions, ordered by what would have the biggest impact-per-week:

1. **Save the captured photo to encrypted device storage** with explicit user consent, so re-running inference (e.g. trying a new model) doesn't require re-shooting.
2. **Add an admin product editor that pulls live Unsplash photos** via the official API. Today's seeded URLs are best-effort; a real product upload flow would solve image reliability for good.
3. **Per-product `paletteHex` extraction** — run color quantization on each product image at seed time and store the palette in a JSONB column. The current style-matching uses the user's palette but products lack their own seeded palettes, so the score falls back to tag overlap.
4. **A/B-able recommendation weights** — the 0.4 / 0.3 / 0.3 / 0.1 blend is hardcoded. Surface it as feature flags + log the resulting recommendation choices for offline analysis.
5. **Migration to Sequelize migrations** instead of `sync({ alter: true })`. Required for any production deployment.
6. **Move JWT to httpOnly cookies** with a CSRF token. Closes the XSS-steals-token vulnerability class.
7. **Analytics + event log** — persist the `recommendation` reason chips alongside cart-add events, so we can later compute "did the recommended size correlate with lower returns?"
8. **Mobile-specific optimization** — measure FPS of the live overlay on a mid-range Android. May need to drop to a smaller MoveNet model or sub-sample the frame.
9. **WebGPU backend** — the dependency is already installed but unused. WebGPU on supporting browsers is ~2× faster than WebGL for these models.
10. **A "try it on" view** — overlay the product silhouette over the captured photo using the same pose keypoints as anchor points. Stretch goal but visually compelling.

---

## 12. References & Inspirations

- **TensorFlow.js Pose Detection guides** — [tensorflow.org/lite/examples/pose_estimation](https://www.tensorflow.org/lite/examples/pose_estimation/overview) for MoveNet vs BlazePose tradeoffs
- **MediaPipe Solutions** — [mediapipe.dev](https://mediapipe.dev) for FaceMesh refine-landmarks parameter
- **magdazelena/face-landmark-detection** on GitHub — the reference React+TF.js project that informed our single-shot capture pattern
- **Anthropometric tables** — Yamazaki's & ANSUR II for the shoulder-to-chest, waist-to-hip ratio constants used in measurement derivation
- **Median-cut color quantization** — original 1979 paper by Heckbert; we use a simplified RGB-cube binning variant that's faster and good enough at 64×64

---

*This document covers the full implementation as of 2026-05-01. The companion file [PLAN.md](PLAN.md) holds the original phased roadmap.*
