# Deployment Guide — Free-Tier Hosting for Uni Submission

> Step-by-step setup for the cheapest practical hosting that will deliver a working demo for thesis review. Frontend on **Vercel** (free), backend on **Render** (free), Postgres on **Render** (90-day free → migrate to **Neon** for long-term durability). CI/CD via **GitHub Actions** on every push.

**Last updated:** 2026-05-01

---

## 1. Cost Summary

| Component | Provider | Free-tier limits | Replacement if exhausted |
|-----------|----------|------------------|--------------------------|
| Frontend (React) | Vercel | 100 GB bandwidth/month, unlimited builds | Netlify / Cloudflare Pages |
| Backend (Express) | Render Web Service | Spins down after 15 min idle, first request slow | Railway / Fly.io |
| Database (Postgres) | Render Postgres | 90 days, 1 GB storage | **Neon** (no expiration) / Supabase |
| CI/CD | GitHub Actions | 2000 minutes/month on free GitHub | More than enough for this project |
| Domain | Vercel | Free `*.vercel.app` subdomain | Vercel-purchased custom domain (~$15/yr) |
| TLS | Vercel + Render | Auto-issued Let's Encrypt | n/a |

**Total expected cost: $0/month** during the thesis review window.

---

## 2. Prerequisites

- A GitHub account with the project repository pushed up.
- A Vercel account ([vercel.com](https://vercel.com), sign in with GitHub).
- A Render account ([render.com](https://render.com), sign in with GitHub).
- Optional: a Neon account ([neon.tech](https://neon.tech)) if you want a Postgres that doesn't expire.

No credit card is required for any of the free tiers below.

---

## 3. Pre-flight: Verify the Repo Is Ready

The deployment configs that this guide depends on are already in the repo:

```
.github/workflows/ci.yml              ← runs FE build + BE typecheck + eval on every push
crwn-clothing-fe/vercel.json          ← SPA fallback + static caching headers
crwn-clothing-be/render.yaml          ← Render Blueprint for web service + Postgres
evaluation/                           ← runnable evaluation harness (Node ESM)
evaluation/python/                    ← Keras + HF + Trendyol stubs
```

Verify locally that everything still works:

```bash
# Frontend
cd crwn-clothing-fe
npm install --legacy-peer-deps
npm run build
# Output: build/ with hashed JS bundles.

# Backend
cd ../crwn-clothing-be
npm install
npx tsc --noEmit
# Output: clean (no errors). To actually compile: `npx tsc` → ./dist/

# Evaluation
cd ../evaluation
node run-all.js
# Output: prints metrics, writes results/results.json and results/RESULTS.md
```

If any of these fail locally, fix before deploying — the GitHub Actions will fail in the same way.

---

## 4. Step-by-Step: Backend on Render

### 4.1 Create the Postgres Database

1. Go to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** → **PostgreSQL**.
3. Settings:
   - Name: `crwn-postgres`
   - Database: `crwn`
   - User: `crwn`
   - Region: pick the one closest to your defense location (e.g. **Frankfurt** for EU/TR).
   - Plan: **Free**.
4. Click **Create Database**. Wait ~1 minute for provisioning.
5. **Copy the Internal Database URL** from the dashboard — you'll need it in §4.2.

> ⏰ **90-day expiration warning.** Render's free Postgres deletes after 90 days. If your thesis defense is more than 60 days out, see §7 to use **Neon** instead, which has no expiration.

### 4.2 Create the Web Service

1. Click **New +** → **Web Service**.
2. Pick **Build and deploy from a Git repository**, then select your GitHub repo.
3. Settings (most are auto-detected from `crwn-clothing-be/render.yaml`):
   - Name: `crwn-clothing-api`
   - Region: same as the database
   - Root Directory: `crwn-clothing-be`
   - Runtime: Node
   - Build Command: `npm install && npx tsc`
   - Start Command: `node dist/index.js`
   - Plan: **Free**
4. Set environment variables:

| Var | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `appOrigin` | Set after FE is deployed — see §5.4 |
| `JWT_SECRET` | Click **Generate** (Render makes a random secret) |
| `DB_HOST` | (auto from Render DB) |
| `DB_PORT` | (auto from Render DB) |
| `DB_USER` | (auto from Render DB) |
| `DB_PASSWORD` | (auto from Render DB) |
| `DB_NAME` | (auto from Render DB) |

5. Click **Create Web Service**. Render will build (~3–5 min on first deploy).
6. Once live, copy the public URL — it'll look like `https://crwn-clothing-api.onrender.com`.

> ⚠ **15-min idle spin-down.** Render free services sleep after 15 minutes of no traffic. The first request after sleep takes ~30 s to wake up. For demo day, hit the URL once 30 s before showing it.

### 4.3 Verify the API Is Live

```bash
curl https://crwn-clothing-api.onrender.com/categories
# Expected: JSON list of seeded categories.
```

If you get 502s, check Render's **Logs** tab — most likely the Postgres env vars aren't wired correctly.

---

## 5. Step-by-Step: Frontend on Vercel

### 5.1 Connect the Repo

1. Go to [vercel.com/new](https://vercel.com/new).
2. Import your GitHub repo.
3. Vercel auto-detects Create React App. Settings:
   - **Root Directory**: `crwn-clothing-fe`
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `build` (default)
   - **Install Command**: `npm install --legacy-peer-deps` ← **change this** (CRA's old react-redux needs the flag)

### 5.2 Set the API Base URL

Add an environment variable in the Vercel project settings:

| Var | Value |
|-----|-------|
| `REACT_APP_API_BASE_URL` | `https://crwn-clothing-api.onrender.com` (from §4.2) |

This is consumed by the Axios interceptor in [`crwn-clothing-fe/src/store/network/interceptor.js`](../../crwn-clothing-fe/src/store/network/interceptor.js).

### 5.3 Deploy

Click **Deploy**. First build takes ~4 minutes.

Once live, your URL will be something like `https://crwn-clothing.vercel.app` or `https://<repo-name>.vercel.app`.

### 5.4 Wire Backend CORS

Go back to Render → your `crwn-clothing-api` web service → **Environment** → set:

```
appOrigin = https://crwn-clothing.vercel.app   (or whatever Vercel gave you)
```

Render will redeploy automatically (~30 s).

### 5.5 End-to-End Smoke Test

Visit your Vercel URL:

1. Sign up with email + password.
2. Click "Use camera" in the wizard step — confirm the AI models load (status pill below the cards).
3. Capture, accept the inferred measurements, pick a few style preferences, submit.
4. Confirm the home page "Picked for you" rail appears with recommendations.

If step 4 fails, open browser DevTools → Network tab and verify the API calls hit the Render URL and return 200s.

---

## 6. CI/CD: GitHub Actions

The workflow in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and PR:

| Job | What it does |
|-----|--------------|
| `frontend` | `npm ci --legacy-peer-deps` → `npm run build` → uploads `build/` artifact (retained 7 days) |
| `backend` | `npm ci` → `npx tsc --noEmit` (typecheck only — no compilation in CI) |
| `evaluation` | `node run-all.js` → uploads `results/RESULTS.md` and `results.json` (retained 90 days) |

The evaluation artifact is the one to download for thesis use — it contains the latest metric numbers automatically every time you push.

### 6.1 No Additional Setup Needed

GitHub Actions on a public repo or a free private repo runs with the default `GITHUB_TOKEN`. No secrets to set unless you want auto-deploy beyond Vercel's + Render's built-in GitHub integrations.

### 6.2 Deploy on Push (Already Set Up)

- **Vercel**: deploys every push to `main` automatically (configured in §5).
- **Render**: deploys every push to `main` automatically (`autoDeploy: true` in `render.yaml`).

So pushing to `main` does this in parallel:

1. GitHub Actions runs the three jobs (~2 min).
2. Vercel builds and deploys the FE (~3 min).
3. Render builds and deploys the BE (~4 min).

---

## 7. Migrating Postgres to Neon (Optional but Recommended)

Render's free Postgres expires after 90 days. **Neon** offers a free Postgres with no expiration. Switch by changing only the env vars on Render.

1. Go to [console.neon.tech](https://console.neon.tech), sign up, create a project.
2. From the dashboard, copy the connection string. It looks like:
   ```
   postgresql://crwn:••••••@ep-cool-bird-12345.eu-central-1.aws.neon.tech/crwn
   ```
3. Parse it into the five env vars Render needs:
   - `DB_HOST`: `ep-cool-bird-12345.eu-central-1.aws.neon.tech`
   - `DB_PORT`: `5432`
   - `DB_USER`: `crwn`
   - `DB_PASSWORD`: (the password section)
   - `DB_NAME`: `crwn`
4. On Render → your web service → Environment → **disconnect** the auto-bound database, then set the five vars manually to the Neon values.
5. Click **Manual Deploy** to re-deploy with the new DB.

Sequelize's `sync({ alter: true })` will re-create the schema on first start.

---

## 8. Troubleshooting

### "API returns 502 for ~30 seconds after the first request"

Render's free tier spun down. This is expected. Wait it out or warm with a `curl` 30s before demoing.

### "TF.js doesn't load — model 404"

The TF.js model weights are fetched from `tfhub.dev` and `cdn.jsdelivr.net` at runtime — they're not bundled with the FE build. Check the browser console for CORS errors or blocked requests. If your university firewall blocks these CDNs, see [TF.js model hosting docs](https://www.tensorflow.org/js/guide/save_load) for the alternative of bundling weights with the build (~10 MB to `public/models/`).

### "Postgres connection refused"

Most likely cause: SSL. Render's Postgres requires SSL but the FE's Sequelize config might not have `dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }`. If you see SSL-related errors in Render logs, add this to `crwn-clothing-be/src/models/sequelize.ts`:

```ts
new Sequelize({
  // ...existing config...
  dialectOptions: process.env.NODE_ENV === "production"
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : undefined,
});
```

### "CORS error in browser console"

The `appOrigin` env var on the backend must match the Vercel URL **exactly**, including `https://` and no trailing slash.

### "Vercel build fails with `Cannot find module 'react-redux'`"

The Install Command must use `--legacy-peer-deps`. See §5.1.

### "evaluation job fails on GitHub Actions"

Run `cd evaluation && node run-all.js` locally — if it works there, the only way it fails on CI is a Node version mismatch. The workflow pins to Node 20; if your local Node is older, upgrade.

---

## 9. Deployment Checklist (Print This for Demo Day)

- [ ] Postgres created on Render or Neon
- [ ] Web service deployed on Render, `appOrigin` set
- [ ] FE deployed on Vercel with `REACT_APP_API_BASE_URL` set
- [ ] First request smoke-tested (sign up → wizard → recommendation)
- [ ] CI workflow runs green on `main`
- [ ] Latest `evaluation/results/RESULTS.md` downloaded from GitHub Actions artifact
- [ ] If demoing live: warm the Render service 30 s before
- [ ] If on a tight network: have a local backup running

---

## 10. Future Hardening (Beyond Free Tier)

If the project graduates beyond uni and starts handling real users:

| Concern | Fix |
|---------|-----|
| Backend spin-down | Render Starter plan ($7/mo) eliminates idle sleep |
| Postgres expiration | Neon free indefinite, or Supabase free with 500 MB |
| JWT in localStorage | Move to httpOnly cookies with CSRF token |
| No migrations | Replace `sync({ alter: true })` with Sequelize CLI migrations |
| No rate-limiting | Add `express-rate-limit` on `/login`, `/register`, `/me/onboarding/infer` |
| No CDN for FE | Vercel already provides one |
| Postgres backups | Render Pro / Neon paid |
| Custom domain + email | ~$15/year domain + SendGrid free tier |

Total to upgrade to "small SaaS production-ready": ~$10–15/month.

---

*Companion docs: [THESIS.md](THESIS.md) (full project narrative), [CHANGES.md](CHANGES.md) (implementation phase), [EVALUATION.md](EVALUATION.md) (reviewer-response methodology), [evaluation/results/RESULTS.md](../evaluation/results/RESULTS.md) (latest metrics).*
