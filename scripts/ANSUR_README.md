# ANSUR II user seed

Seeds the `users` table with realistic fit profiles derived from the real
**ANSUR II** anthropometric survey (US Army 2012) — 4,082 men + 1,986 women,
93 body measurements each.

## Get the data

Download the two public CSVs and place them in a `datasets/ansur2/` directory
(by default the loader looks in `<repo>/datasets/ansur2` and
`<repo>/../datasets/ansur2`):

- `ANSUR_II_MALE.csv`
- `ANSUR_II_FEMALE.csv`

Canonical source: <https://www.openlab.psu.edu/ansur2/> (Penn State OPEN Design
Lab). A public mirror used during development:
<https://github.com/senihberkay/US-Army-ANSUR-II>.

Override the location with `--dir <path>` or the `ANSUR_DIR` env var.

## How the data is formatted to our model

Raw ANSUR dimensions are in **millimetres** (except `weightkg`, which is in
**deci-kilograms**). [`ansur-loader.ts`](ansur-loader.ts) converts to the
cm / kg units our schema uses and maps columns:

| ANSUR column           | Our field    |
| ---------------------- | ------------ |
| `stature`              | `heightCm`   |
| `chestcircumference`   | `chestCm`    |
| `waistcircumference`   | `waistCm`    |
| `buttockcircumference` | `hipCm`      |
| `crotchheight`         | `inseamCm`   |
| `biacromialbreadth`    | `shoulderCm` |
| `weightkg` / 10        | `weightKg`   |

Derived fields (`bmi`, `bodyShape`, `recommendationVersion`, `confidence`) are
produced by the same `inferBodyProfile` service the live onboarding endpoint
uses, so seeded users are identical in shape to real ones.

## Run

```bash
npm run seed:ansur            # 1,000 balanced users (default)
npm run seed:ansur -- --all   # full ~6,068 population
npm run seed:ansur -- --reset # remove previously-seeded ANSUR users, then reseed
```

Seeded users are marked by the reserved `@ansur.local` email domain and a
deterministic UUID, so runs are idempotent and never touch real accounts.
Login for any seeded user: `<their email>` / `Ansur!seed1`.
