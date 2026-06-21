# Body-Aware Commerce — Implementation Plan

Last updated: 2026-04-30

---

## 0. Where we paused

- **Status:** Discovery complete. **No code has been changed yet.**
- **Critical signal from user:** the existing camera/onboarding flow is *in the repo but not working*. So Phase 1 below is a **clean rebuild** of the capture + inference + measurement step, not a refactor.
- **Next concrete action when we resume:** answer the open questions in §5, then start Phase 1 (rebuild).

---

## 1. What's in the repo today

This is the lay of the land before we rebuild. We **keep** the bits with stable contracts (DB schema, recommendation scoring, route shapes), and **replace** the bits that don't work (the camera UI + inference glue).

| Area | Where it lives | Decision |
|------|---------------|----------|
| Camera capture + TF.js inference | [crwn-clothing-fe/src/routes/onboarding/onboarding.component.jsx](../../crwn-clothing-fe/src/routes/onboarding/onboarding.component.jsx), [crwn-clothing-fe/src/utils/landmark-inference.js](../../crwn-clothing-fe/src/utils/landmark-inference.js) | **REBUILD** — user reports broken. Replace with `react-webcam` + a fresh, smaller TF.js pipeline modeled on [magdazelena/face-landmark-detection](https://github.com/magdazelena/face-landmark-detection). |
| 3-step onboarding (capture → measurements → review) | [crwn-clothing-fe/src/routes/onboarding/onboarding.component.jsx](../../crwn-clothing-fe/src/routes/onboarding/onboarding.component.jsx) | **REBUILD** as a 4-step wizard merged with signup. |
| Body fields on User (heightCm, weightKg, bmi, chestCm, waistCm, hipCm, inseamCm, shoulderCm, bodyShape, preferredFit, landmarkSummary JSONB, onboardingCompletedAt) | [crwn-clothing-be/src/models/User.ts](../src/models/User.ts) | **KEEP** — schema is fine; we'll add a few new fields for style. |
| Onboarding endpoints (`POST /me/onboarding/infer`, `PUT /me/body-profile`, `GET /me/body-profile`) | [crwn-clothing-be/src/routes/userRoutes.ts](../src/routes/userRoutes.ts) | **KEEP** — payload shape stays compatible; we'll extend with style fields. |
| Size scoring (per-size match against user metrics + preferredFit boost) | [crwn-clothing-fe/src/utils/size-recommendation.js](../../crwn-clothing-fe/src/utils/size-recommendation.js), [crwn-clothing-be/src/services/bodySizing.ts](../src/services/bodySizing.ts) | **KEEP** — works, useful. |
| "Fit M" chip on product cards | [crwn-clothing-fe/src/components/product-card/product-card.component.jsx:37](../../crwn-clothing-fe/src/components/product-card/product-card.component.jsx#L37) | **KEEP**, restyle in Phase 7. |
| Theme tokens | [crwn-clothing-fe/src/styles/theme.js](../../crwn-clothing-fe/src/styles/theme.js) | **EXPAND** — single static theme today; add light/dark/alt variants in Phase 4. |

**Net:** the FE capture/onboarding gets a clean rebuild. The BE stays. The recommendation logic stays.

---

## 2. Gaps the user explicitly called out

1. **Existing flow is broken — rebuild it** (cleaner code, fewer dependencies, mobile-first).
2. **Image-based recommendation** (not just measurements) — infer style/palette from the photo and use it to rank products.
3. **`react-webcam` with explicit permission UX**, mirroring the [magdazelena/face-landmark-detection](https://github.com/magdazelena/face-landmark-detection) reference.
4. **Recommendation surfaced in cart and checkout**, not just on cards.
5. **Product detail page** with the full "Why we recommend M" explanation.
6. **UI pass** on navigation, category previews, checkout.
7. **Multi-theme** + snappy interactions.

---

## 3. Phased work

### 3.1 Phase 1 — Rebuild capture + onboarding wizard *(start here)*

**Goal:** a working, mobile-friendly multi-step signup that ends with body metrics persisted.

**Scope of rebuild:**
- Remove (or stop using) [crwn-clothing-fe/src/routes/onboarding/onboarding.component.jsx](../../crwn-clothing-fe/src/routes/onboarding/onboarding.component.jsx) and the heavy `landmark-inference.js`.
- New folder structure:
  ```
  src/routes/onboarding/
    onboarding.route.jsx         <- route shell, owns wizard state
    steps/
      account-step.jsx           <- email / password / displayName
      capture-step.jsx           <- react-webcam + permission pre-prompt
      measurements-step.jsx      <- inferred values, editable
      style-step.jsx             <- palette + silhouette preview (Phase 3)
      review-step.jsx            <- final confirm + submit
    hooks/
      use-wizard-state.js        <- reducer + sessionStorage persistence
      use-camera-permission.js   <- prompt / granted / denied / error
      use-pose-inference.js      <- single-shot inference on captured frame
    inference/
      landmarks.js               <- thin TF.js wrapper, lazy-loaded
      measurements.js            <- pure functions: ratios -> cm
      style.js                   <- palette + silhouette (Phase 3)
  ```

**New dependencies (FE):**
- `react-webcam` — camera lifecycle, facingMode, screenshot.
- Reuse already-installed `@tensorflow/tfjs-core`, `@tensorflow/tfjs-backend-webgl`, `@tensorflow-models/face-landmarks-detection`.
- *Optional* `framer-motion` for step transitions (deferred to Phase 7).

**Inference plan (deliberately small):**
- One model only on the critical path: **MediaPipe FaceMesh via TF.js**, mirroring the reference repo. Single-shot inference on a still frame, not on a live loop — much simpler and reliable.
- Derive ratios from face landmarks (interpupillary distance, jaw width) and from optional pose keypoints if we add a second model later.
- User-supplied **height** anchors the absolute scale (cm) so we don't pretend to know real distances from pixels alone.
- Output: `{ heightCm, weightKg (user-entered), bmi (computed), shoulderCm, chestCm, waistCm, hipCm, inseamCm, bodyShape, confidence }`.

**Permission UX (modeled on the reference repo):**
- Pre-prompt screen with three buttons:
  - **Use camera** → triggers `getUserMedia` via `react-webcam`.
  - **Upload photo** → file input fallback.
  - **Skip — type my measurements** → bypass capture.
- On permission denied: show a short recovery message + auto-fall-back to upload.
- Mobile: `facingMode: { ideal: "user" }` with a flip-camera button when `enumerateDevices` reports >1 camera.

**Routes & navigation:**
- `/auth` keeps sign-in only.
- `/onboarding` becomes the multi-step signup. Steps are query params (`?step=account|capture|measurements|style|review`) for shareable/back-button-friendly state.
- Existing redirect logic in [crwn-clothing-fe/src/App.js:30-48](../../crwn-clothing-fe/src/App.js#L30-L48) stays — it already routes to `/onboarding` when `requiresOnboarding=true`.

**BE work in this phase:** none beyond verifying `POST /me/onboarding/infer` accepts the payload. If it errors, we patch the validator in [crwn-clothing-be/src/controllers/user/bodyProfileValidation.ts](../src/controllers/user/bodyProfileValidation.ts).

**Done means:**
- Sign up from `/onboarding?step=account` → take or upload a photo → see measurements → submit → land on `/` with `bodyProfile` populated in Redux and persisted on the BE.
- Works on Chrome desktop and Safari iOS.

---

### 3.2 Phase 2 — Image-based style inference

**Why:** measurements drive *size*; we also want the photo to drive *which products to recommend*.

**Tradeoff on "LLaMA-style" models:** running an LLM in the browser is impractical (multi-GB weights, slow). And a server-side LLM costs money + adds infra. We stay client-side TF.js. None of these has to be "good" — just deterministic, explainable, and fast:

- **Color quantization** on the captured photo (median-cut, ~30 LOC, no model) → top-5 hex + a coarse palette bucket (`warm | cool | neutral | earth | jewel`).
- **Pose-derived silhouette** from shoulder/waist/hip ratios → `rectangle | triangle | inverted-triangle | hourglass | oval`.
- **MobileNet** image classification (already in the TF.js zoo) → top-5 ImageNet labels filtered to clothing-relevant tokens. Optional, behind a feature flag.

**Frontend deliverables:**
- `src/routes/onboarding/inference/style.js` exports `inferStyle(imageDataUrl, poseRatios)` returning `{ palette, paletteBucket, silhouette, tags, confidence }`.
- `src/utils/product-style-match.js` exports `scoreProductStyle(product, styleProfile)` — color distance + tag overlap, returns 0–1.
- New home rail: **"Picked for you"** sorts products by `scoreProductStyle * sizeMatchConfidence`.

**Backend deliverables:**
- Add fields to [crwn-clothing-be/src/models/User.ts](../src/models/User.ts): `stylePalette JSONB`, `styleBucket STRING`, `styleSilhouette STRING`, `styleConfidence FLOAT`.
- Extend `bodyProfileValidation.ts` whitelist + the resolver.
- Add `paletteHex JSONB` to seed products in [crwn-clothing-be/src/seed-data.ts](../src/seed-data.ts) so we have something to match against.

---

### 3.3 Phase 3 — Multi-theme

- Split [crwn-clothing-fe/src/styles/theme.js](../../crwn-clothing-fe/src/styles/theme.js) into `theme.light.js`, `theme.dark.js`, and one fun alt (`theme.sunset.js` or `theme.midnight.js` — user picks).
- `ThemeContext` + `localStorage` persistence under key `crwn:theme`.
- Theme toggle button in the nav cycling through variants.
- Audit hardcoded `#fff` / `#0f172a` literals (the old onboarding component is full of them — gone after Phase 1, but check `Authentication`, `Checkout`, `CategoryPreview`).

---

### 3.4 Phase 4 — Recommendation in cart & checkout

- [crwn-clothing-fe/src/components/cart-item/cart-item.component.jsx](../../crwn-clothing-fe/src/components/cart-item/cart-item.component.jsx): show "Recommended: M"; warn softly if `cartItem.size !== recommended.recommendedSize`.
- Same for [crwn-clothing-fe/src/components/cart-dropdown/cart-dropdown.component.jsx](../../crwn-clothing-fe/src/components/cart-dropdown/cart-dropdown.component.jsx).
- [crwn-clothing-fe/src/routes/checkout/checkout.component.jsx](../../crwn-clothing-fe/src/routes/checkout/checkout.component.jsx): summary header — "All sizes match your profile ✓" / "2 items differ".
- Stretch: "Resize all to recommended" button.

---

### 3.5 Phase 5 — Product detail page

- New route `/product/:productId` → `src/routes/product-detail/product-detail.component.jsx`.
- Hero gallery + info + size chart + **"Why we recommend M"** panel showing per-measurement deltas (`Your chest 96cm → M chart 98cm = +2cm`) using `recommendation.explanation`.
- Backend `GET /products/:id` already exists in [crwn-clothing-be/src/controllers/product/getProductByIdResolver.ts](../src/controllers/product/getProductByIdResolver.ts).
- ProductCard click → detail page; QuickView demoted to a secondary button.

---

### 3.6 Phase 6 — Broader UI pass

- **Navigation** ([crwn-clothing-fe/src/routes/navigation/navigation.component.jsx](../../crwn-clothing-fe/src/routes/navigation/navigation.component.jsx)): sticky, glass blur, theme toggle, profile dropdown with body-profile snapshot + "Re-scan" link.
- **Category previews** ([crwn-clothing-fe/src/components/category-preview/category-preview.component.jsx](../../crwn-clothing-fe/src/components/category-preview/category-preview.component.jsx)): hover-lift card grid; "X items match your fit" count.
- **Checkout** ([crwn-clothing-fe/src/routes/checkout/checkout.component.jsx](../../crwn-clothing-fe/src/routes/checkout/checkout.component.jsx)): two-column desktop; sticky summary right; collapsible mobile.
- **Snappiness:** `framer-motion` for page + step transitions, list stagger, skeleton loaders for grid (already a `skeleton/` component — wire it in).

---

## 4. Suggested execution order

1. **Phase 1 — rebuild capture + onboarding wizard.** Nothing else makes sense without this.
2. **Phase 3 — multi-theme.** Do early so subsequent phases use theme tokens consistently and avoid hardcoded colors.
3. **Phase 2 — style inference.** Adds the photo-driven product ranking the user asked for.
4. **Phase 5 — product detail page.** Needs Phase 2 to fill the "Why" panel richly.
5. **Phase 4 — cart/checkout recommendation.** Small, high-impact.
6. **Phase 6 — broader UI pass.** Final coat of polish.

---

## 5. Open questions for the user (please answer before Phase 1 starts)

1. **What specifically is broken right now** in the existing onboarding? Camera permission denied? Inference crashes? Submit fails? Helps us avoid re-introducing the same bug. (If you don't know, fine — we'll find out by running it once before deleting.)
2. **Style model choice for Phase 2** — confirm the all-client-side TF.js approach (MobileNet + color quantization + pose-ratio silhouette) is acceptable, vs. a server LLM call?
3. **Photo persistence** — keep captured photo only on device (sessionStorage), or upload to BE so we can re-run inference later? Default plan = device-only for privacy.
4. **Theme variants** — light + dark are mandatory. Want one alt? Pick: `sunset` / `midnight` / `mono` / none.
5. **`framer-motion` ok as a new FE dep?** (Otherwise we stick with CSS transitions.)
6. **Backend rebuild scope** — leaving BE schema + onboarding endpoints intact in the rebuild. OK? Or do you want the BE controllers regenerated too?
