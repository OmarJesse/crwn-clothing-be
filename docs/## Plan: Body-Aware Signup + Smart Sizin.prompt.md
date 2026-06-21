## Plan: Body-Aware Signup + Smart Sizing + Full UI Refresh

Build an MVP where users sign up, complete a multi-step body onboarding with camera/photo capture, get inferred metrics (mock AI), and receive automatic size recommendations on product experiences. This is full-stack across both repos, includes seeded sizing data for launch/demo readiness, and includes a full frontend redesign.

### Steps

1. Phase 1: Backend schema + recommendation engine foundation.
2. Extend user body profile fields in [crwn-clothing-be/src/models/User.ts](../src/models/User.ts) with heightCm, weightKg, bmi, chestCm, waistCm, hipCm, inseamCm, shoulderCm, bodyShape, preferredFit, onboardingCompletedAt, recommendationVersion.
3. Extend product sizing metadata in [crwn-clothing-be/src/models/Product.ts](../src/models/Product.ts) with sizeChartJson, fitType, recommendationTags, and accessory-specific fit hints.
4. Add explicit migrations and stop relying on runtime alter-sync behavior in [crwn-clothing-be/src/index.ts](../src/index.ts). This blocks safe rollout.
5. Expand launch-ready seed data in [crwn-clothing-be/src/seed-data.ts](../src/seed-data.ts) to include realistic size charts and fit metadata for all current categories.
6. Add a rule-based recommendation engine service (new service module) that outputs recommendedSize, alternates, confidence, and explanation by category (tops, bottoms, outerwear, accessories).
7. Phase 2: Backend APIs for onboarding + recommendations.
8. Add user onboarding/profile endpoints in [crwn-clothing-be/src/routes/userRoutes.ts](../src/routes/userRoutes.ts) and new user resolvers:
9. POST /me/onboarding/infer (accepts image + optional manual values; no photo persistence)
10. PUT /me/body-profile
11. GET /me/body-profile
12. GET /me/recommendations/categories
13. Extend product recommendation output in [crwn-clothing-be/src/controllers/product/getProductByIdResolver.ts](../src/controllers/product/getProductByIdResolver.ts) and route registration in [crwn-clothing-be/src/routes/productRoutes.ts](../src/routes/productRoutes.ts), plus optional POST /products/:id/recommend-size.
14. Add request validation and normalized error contracts for new endpoints so the FE can show per-step validation cleanly.
15. Phase 3: Frontend onboarding + personalization state.
16. Extend user state model and actions in [crwn-clothing-fe/src/store/user/user.types.js](../../crwn-clothing-fe/src/store/user/user.types.js), [crwn-clothing-fe/src/store/user/user.action.js](../../crwn-clothing-fe/src/store/user/user.action.js), [crwn-clothing-fe/src/store/user/user.reducer.js](../../crwn-clothing-fe/src/store/user/user.reducer.js), and [crwn-clothing-fe/src/store/user/user.saga.js](../../crwn-clothing-fe/src/store/user/user.saga.js) for onboarding lifecycle + recommendation payloads.
17. Add FE network methods in [crwn-clothing-fe/src/store/network/user.js](../../crwn-clothing-fe/src/store/network/user.js) for infer/profile/recommendation APIs.
18. Update signup handoff in [crwn-clothing-fe/src/components/sign-up-form/sign-up-form.component.jsx](../../crwn-clothing-fe/src/components/sign-up-form/sign-up-form.component.jsx) and route orchestration in [crwn-clothing-fe/src/App.js](../../crwn-clothing-fe/src/App.js) to redirect first-time users into onboarding.
19. Implement multi-step onboarding UI (camera capture + file fallback + manual edit + summary + completion) from auth entry in [crwn-clothing-fe/src/routes/authentication/authentecation.component.jsx](../../crwn-clothing-fe/src/routes/authentication/authentecation.component.jsx).
20. Phase 4: Product integration + full visual redesign.
21. Add recommendation badge and preselected size behavior in [crwn-clothing-fe/src/components/quick-view/quick-view.component.jsx](../../crwn-clothing-fe/src/components/quick-view/quick-view.component.jsx), with manual override preserved.
22. Add category-level recommendation surfaces in shop route/component tree rooted at [crwn-clothing-fe/src/routes/shop/shop.component.jsx](../../crwn-clothing-fe/src/routes/shop/shop.component.jsx).
23. Full UI redesign pass across auth, onboarding, home, navigation, shop/category, product quick view/detail, and checkout using and extending [crwn-clothing-fe/src/styles/theme.js](../../crwn-clothing-fe/src/styles/theme.js) for consistency.
24. Phase 5: rollout safety + acceptance.
25. Ensure recommendation fields are optional and gracefully absent for users without onboarding.
26. Run end-to-end smoke checks for desktop and mobile camera scenarios.

### Actor-Specific API Matrix

| Actor | Endpoints | Outcome |
|---|---|---|
| Guest | POST /register, POST /login | Account creation and authentication only |
| Authenticated user (no onboarding) | GET /me, GET /products/product/:id | Normal browse, no enforced recommendation |
| Authenticated user (onboarding) | POST /me/onboarding/infer, PUT/GET /me/body-profile | Body profile creation and updates |
| Authenticated user (shopping) | GET /products/product/:id, GET /me/recommendations/categories, POST /products/:id/recommend-size | Product and category fit recommendations, auto-size defaults |
| Admin | Existing product CRUD + sizing metadata fields | Can maintain catalog sizing rules and fit tags |

### Concrete API Usage Examples

1. Signup response should include onboardingRequired: true so FE routes to onboarding immediately.
2. Infer request example: POST /me/onboarding/infer with multipart image plus optional height/weight hints.
3. Infer response example fields: heightCm, weightKg, bmi, bodyShape, confidence, recommendationVersion.
4. Product response extension: product + recommendation object with recommendedSize, alternates, confidence, explanation.
5. Category recommendation response: ranked list like tops-first or bottoms-first based on profile fit scores.

### Frontend JSX-Level Examples To Implement

1. Onboarding step container in new onboarding route should render step index, step title, progress bar, and next/back actions.
2. Camera step component should render live preview button when available and file upload fallback when unavailable.
3. Product size selector should mark one option as Recommended and initialize selected size from API recommendation.
4. Account/profile summary component should render inferred metrics with confidence chip and edit action.

### Full Screen-Coverage Strategy

1. Auth screen: convert current dual-pane auth into modern entry point with clear onboarding promise.
2. New onboarding screens: step-by-step flow with mobile-first camera UX.
3. Home screen: reinforce personalized shopping CTA after onboarding completion.
4. Navigation: global visual refresh and clearer profile/recommendation entry points.
5. Shop/category pages: recommended collections and fit-aware sorting/badging.
6. Product quick view/detail: recommended size, explanation, and auto-select behavior.
7. Checkout: preserve selected recommended size and show fit confidence where relevant.
8. Profile/account area: body summary + recompute/edit profile controls.

### Verification

1. Backend endpoint smoke tests: register -> onboarding infer -> profile save -> product recommendation -> category recommendations.
2. FE flow tests: signup to onboarding redirect, camera fallback behavior, onboarding completion redirect, recommended size preselection.
3. Responsive manual QA on mobile/tablet/desktop for onboarding and product experiences.
4. FE checks in [crwn-clothing-fe/package.json](../../crwn-clothing-fe/package.json): npm run build and npm test.
5. BE runtime checks in [crwn-clothing-be/package.json](../package.json): npm start plus endpoint smoke tests (no automated test suite currently).

### Decisions Captured

1. Inference mode: backend rule-based mock inference for MVP.
2. Photo policy: do not store photos after inference.
3. Access model: signed-in users only.
4. MVP recommendation scope: per-product recommended size, account body summary, auto-size on add-to-cart, category-level recommendations.
5. UI scope: full frontend redesign.
6. Seed scope: include realistic mock size data for launch/demo.

If you want, I can now produce the implementation handoff version split into execution tickets (BE ticket list + FE ticket list + API contract checklist) so coding can start immediately.