/**
 * Seed the `users` table with realistic fit profiles derived from the real
 * ANSUR II anthropometric survey (US Army 2012).
 *
 * Each ANSUR subject becomes one synthetic user whose measurements are the
 * subject's actual body dimensions (converted mm→cm). The derived fields —
 * `bmi`, `bodyShape`, `recommendationVersion`, `confidence` — are produced by
 * the SAME `inferBodyProfile` service the live onboarding endpoint uses, so
 * seeded users are indistinguishable from real ones to the recommendation
 * engine. This gives the thesis a population of 6,000 ground-truth bodies to
 * validate body-shape classification and size recommendation against.
 *
 * Idempotent: each user's UUID is derived deterministically (uuidv5) from the
 * ANSUR subject id, and email carries the reserved `@ansur.local` domain, so
 * re-running no-ops on existing rows and never touches real accounts.
 *
 * Usage:
 *   cd crwn-clothing-be
 *   npx ts-node --project tsconfig.json scripts/seed-users-from-ansur.ts [options]
 *
 * Options:
 *   --limit N    seed at most N users total   (default 1000; use --all for everyone)
 *   --all        seed the full ~6,068 population
 *   --reset      delete previously-seeded ANSUR users first (real users untouched)
 *   --dir PATH   directory containing the ANSUR_II_*.csv files
 */

import "dotenv/config";
import bcrypt from "bcrypt";
import { v5 as uuidv5 } from "uuid";
import { Op } from "sequelize";
import sequelize from "../src/models/sequelize";
import User from "../src/models/User";
import "../src/models";
import { inferBodyProfile } from "../src/services/bodySizing";
import { loadAnsurPeople, AnsurPerson } from "./ansur-loader";

const NAMESPACE = "a5c0d1e2-3f4a-5b6c-9d8e-9f0a1b2c3d4e"; // fixed namespace for ANSUR users (RFC-valid variant)
const SEED_DOMAIN = "ansur.local"; // reserved domain — marks rows as seed data
const SEED_PASSWORD = "Ansur!seed1"; // shared dev password for every seeded user

// Allowlists, mirrored from the body-profile validation layer.
const STYLE_OPTIONS = [
  "minimalist", "streetwear", "classic", "bohemian",
  "sporty", "edgy", "preppy", "vintage",
];
const PALETTE_OPTIONS = [
  "earth-tones", "monochrome", "pastels", "jewel-tones",
  "warm-neutrals", "bold-brights", "cool-tones", "sunset",
];
const FIT_OPTIONS = ["slim", "regular", "oversized"];

// Deterministic 32-bit hash of a string — drives reproducible "random" choices
// so a given subject always gets the same preferences across runs.
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const pick = <T>(arr: T[], seed: number): T => arr[seed % arr.length];

// Pick `count` distinct items deterministically from `arr`.
const pickMany = <T>(arr: T[], seed: number, count: number): T[] => {
  const out: T[] = [];
  let s = seed;
  const pool = [...arr];
  for (let i = 0; i < count && pool.length; i++) {
    s = (Math.imul(s, 48271) + 1) >>> 0;
    out.push(pool.splice(s % pool.length, 1)[0]);
  }
  return out;
};

const buildUserRow = (p: AnsurPerson, passwordHash: string) => {
  const seed = hash(p.subjectId + p.sex);

  // Run the body profile through the real inference service.
  const profile = inferBodyProfile({
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    chestCm: p.chestCm,
    waistCm: p.waistCm,
    hipCm: p.hipCm,
    inseamCm: p.inseamCm,
    shoulderCm: p.shoulderCm,
    preferredFit: pick(FIT_OPTIONS, seed),
    preferredStyles: pickMany(STYLE_OPTIONS, seed >> 3, 2 + (seed % 2)),
    preferredPalettes: pickMany(PALETTE_OPTIONS, seed >> 7, 1 + (seed % 2)),
  });

  const shortId = p.subjectId.padStart(5, "0");
  const sexTag = p.sex === "female" ? "f" : "m";

  return {
    id: uuidv5(`ansur:${p.sex}:${p.subjectId}`, NAMESPACE),
    name: `ANSUR ${p.sex === "female" ? "F" : "M"}-${shortId}`,
    email: `ansur.${sexTag}.${shortId}@${SEED_DOMAIN}`,
    password: passwordHash,
    role: "user" as const,
    heightCm: profile.heightCm ?? null,
    weightKg: profile.weightKg ?? null,
    bmi: profile.bmi ?? null,
    chestCm: profile.chestCm ?? null,
    waistCm: profile.waistCm ?? null,
    hipCm: profile.hipCm ?? null,
    inseamCm: profile.inseamCm ?? null,
    shoulderCm: profile.shoulderCm ?? null,
    preferredFit: profile.preferredFit ?? null,
    bodyShape: profile.bodyShape ?? null,
    onboardingCompletedAt: new Date(),
    recommendationVersion: profile.recommendationVersion,
    landmarkSummary: null,
    landmarkModel: "ansur-ii-ground-truth",
    preferredStyles: profile.preferredStyles ?? null,
    preferredPalettes: profile.preferredPalettes ?? null,
  };
};

const run = async () => {
  const argv = process.argv.slice(2);
  const has = (flag: string) => argv.includes(flag);
  const valueOf = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const all = has("--all");
  const limit = all ? Infinity : Number(valueOf("--limit") ?? 1000);
  const reset = has("--reset");
  const dir = valueOf("--dir");

  console.log("Loading ANSUR II population…");
  const everyone = loadAnsurPeople({ dir });
  const people = Number.isFinite(limit) ? everyone.slice(0, limit) : everyone;
  console.log(
    `  parsed ${everyone.length} subjects, seeding ${people.length}` +
      (all ? " (all)" : ` (--limit ${limit})`)
  );

  console.log("Connecting to database…");
  await sequelize.authenticate();
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await sequelize.sync({ alter: false });

  if (reset) {
    const removed = await User.destroy({
      where: { email: { [Op.like]: `%@${SEED_DOMAIN}` } },
    });
    console.log(`Reset: removed ${removed} previously-seeded ANSUR users.`);
  }

  console.log("Hashing shared seed password…");
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const rows = people.map((p) => buildUserRow(p, passwordHash));

  // Report the body-shape distribution we're about to insert — a useful sanity
  // check for the thesis (should track published shape frequencies).
  const dist = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.bodyShape || "unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  console.log("Body-shape distribution:");
  for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(10)} ${v}  (${((v / rows.length) * 100).toFixed(1)}%)`);
  }

  console.log(`\nInserting ${rows.length} users (ignoreDuplicates)…`);
  const created = await User.bulkCreate(rows as any, { ignoreDuplicates: true });
  console.log(`✓ Done. Inserted/skipped ${created.length} rows.`);

  const total = await User.count({
    where: { email: { [Op.like]: `%@${SEED_DOMAIN}` } },
  });
  console.log(`Total ANSUR seed users now in DB: ${total}`);
  console.log(`\nLogin for any seeded user:  <their email>  /  ${SEED_PASSWORD}`);

  await sequelize.close();
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
