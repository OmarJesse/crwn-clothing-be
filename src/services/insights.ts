/**
 * Fit Insights — population analytics over the seeded body population.
 *
 * Turns the thousands of real (ANSUR II–derived) bodies in the `users` table
 * into "people like you" intelligence: how the wider population is shaped, and
 * exactly where a given shopper sits within it. This is what lets the UI say
 * things like "you're taller than 78% of people with your build" and "62% of
 * your fit-cohort prefer a regular fit".
 *
 * The population read is cached in-process for a few minutes — the seeded
 * cohort changes rarely and the aggregation touches every row.
 */

import { Op } from "sequelize";
import User from "../models/User";
import { BODY_SHAPES, BodyShape } from "./bodyShape";

const MEASURE_KEYS = [
  "heightCm",
  "weightKg",
  "chestCm",
  "waistCm",
  "hipCm",
  "inseamCm",
  "shoulderCm",
] as const;
type MeasureKey = (typeof MEASURE_KEYS)[number];

type Row = {
  bodyShape: string | null;
  preferredFit: string | null;
} & Record<MeasureKey, number | null>;

export type PopulationStats = {
  totalBodies: number;
  shapeDistribution: { shape: string; count: number; pct: number }[];
  fitDistribution: { fit: string; count: number; pct: number }[];
  // sorted ascending measurement samples per key, for percentile lookups
  measures: Record<MeasureKey, number[]>;
  measureSummary: Record<
    MeasureKey,
    { min: number; p10: number; p50: number; p90: number; max: number; mean: number }
  >;
  computedAt: number;
};

let cache: PopulationStats | null = null;
const TTL_MS = 5 * 60 * 1000;

const pctl = (sortedAsc: number[], q: number): number => {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Fraction of the sorted sample that is ≤ value (a percentile rank in [0,1]). */
export const percentileRank = (sortedAsc: number[], value: number): number => {
  if (sortedAsc.length === 0) return 0;
  // binary search for the count of elements <= value
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedAsc.length;
};

export const getPopulationStats = async (
  force = false
): Promise<PopulationStats> => {
  if (!force && cache && Date.now() - cache.computedAt < TTL_MS) {
    return cache;
  }

  const rows = (await User.findAll({
    attributes: ["bodyShape", "preferredFit", ...MEASURE_KEYS],
    where: { bodyShape: { [Op.ne]: null } },
    raw: true,
  })) as unknown as Row[];

  const total = rows.length;

  // Shape distribution (stable order: known shapes first, then any extras).
  const shapeCounts = new Map<string, number>();
  const fitCounts = new Map<string, number>();
  const measures = Object.fromEntries(
    MEASURE_KEYS.map((k) => [k, [] as number[]])
  ) as Record<MeasureKey, number[]>;

  for (const r of rows) {
    if (r.bodyShape) shapeCounts.set(r.bodyShape, (shapeCounts.get(r.bodyShape) || 0) + 1);
    if (r.preferredFit) fitCounts.set(r.preferredFit, (fitCounts.get(r.preferredFit) || 0) + 1);
    for (const k of MEASURE_KEYS) {
      const v = r[k];
      if (typeof v === "number" && Number.isFinite(v)) measures[k].push(v);
    }
  }

  for (const k of MEASURE_KEYS) measures[k].sort((a, b) => a - b);

  const orderedShapes = [
    ...BODY_SHAPES,
    ...[...shapeCounts.keys()].filter(
      (s) => !(BODY_SHAPES as readonly string[]).includes(s)
    ),
  ];
  const shapeDistribution = orderedShapes
    .filter((s) => shapeCounts.has(s))
    .map((shape) => ({
      shape,
      count: shapeCounts.get(shape)!,
      pct: round1((shapeCounts.get(shape)! / total) * 100),
    }));

  const fitDistribution = [...fitCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([fit, count]) => ({ fit, count, pct: round1((count / total) * 100) }));

  const measureSummary = Object.fromEntries(
    MEASURE_KEYS.map((k) => {
      const s = measures[k];
      const mean = s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
      return [
        k,
        {
          min: round1(s[0] ?? 0),
          p10: round1(pctl(s, 0.1)),
          p50: round1(pctl(s, 0.5)),
          p90: round1(pctl(s, 0.9)),
          max: round1(s[s.length - 1] ?? 0),
          mean: round1(mean),
        },
      ];
    })
  ) as PopulationStats["measureSummary"];

  cache = {
    totalBodies: total,
    shapeDistribution,
    fitDistribution,
    measures,
    measureSummary,
    computedAt: Date.now(),
  };
  return cache;
};

/** The public payload — omit the heavy raw `measures` arrays. */
export const getPublicPopulation = async () => {
  const s = await getPopulationStats();
  return {
    totalBodies: s.totalBodies,
    shapeDistribution: s.shapeDistribution,
    fitDistribution: s.fitDistribution,
    measureSummary: s.measureSummary,
  };
};

export type PersonalInsights = {
  bodyShape: string | null;
  cohort: { shape: string | null; size: number; pctOfPopulation: number };
  percentiles: Partial<Record<MeasureKey, number>>;
  fitTwins: number;
  cohortFitPreference: { fit: string; pct: number } | null;
  totalBodies: number;
};

type ProfileLike = Partial<Record<MeasureKey, number | null>> & {
  bodyShape?: string | null;
  id?: string;
};

/**
 * Position one shopper within the population: per-measurement percentile rank,
 * cohort size for their body shape, and the number of close "fit twins"
 * (bodies within a small Euclidean distance across the core girths).
 */
export const getPersonalInsights = async (
  profile: ProfileLike
): Promise<PersonalInsights> => {
  const stats = await getPopulationStats();

  const percentiles: Partial<Record<MeasureKey, number>> = {};
  for (const k of MEASURE_KEYS) {
    const v = profile[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      percentiles[k] = Math.round(percentileRank(stats.measures[k], v) * 100) / 100;
    }
  }

  const cohortEntry = stats.shapeDistribution.find((d) => d.shape === profile.bodyShape);
  const cohort = {
    shape: profile.bodyShape ?? null,
    size: cohortEntry?.count ?? 0,
    pctOfPopulation: cohortEntry?.pct ?? 0,
  };

  // Fit twins: bodies within 5 cm RMS across chest/waist/hip. Re-read the raw
  // rows once (cheap at this scale) to compute distances.
  let fitTwins = 0;
  let cohortFitPreference: PersonalInsights["cohortFitPreference"] = null;
  const { chestCm, waistCm, hipCm } = profile;
  if (
    typeof chestCm === "number" &&
    typeof waistCm === "number" &&
    typeof hipCm === "number"
  ) {
    const rows = (await User.findAll({
      attributes: ["chestCm", "waistCm", "hipCm", "preferredFit"],
      where: { bodyShape: profile.bodyShape ?? { [Op.ne]: null } },
      raw: true,
    })) as unknown as Row[];

    const fitTally = new Map<string, number>();
    for (const r of rows) {
      if (
        typeof r.chestCm !== "number" ||
        typeof r.waistCm !== "number" ||
        typeof r.hipCm !== "number"
      )
        continue;
      const d = Math.sqrt(
        ((r.chestCm - chestCm) ** 2 + (r.waistCm - waistCm) ** 2 + (r.hipCm - hipCm) ** 2) / 3
      );
      if (d <= 5) {
        fitTwins += 1;
        if (r.preferredFit) fitTally.set(r.preferredFit, (fitTally.get(r.preferredFit) || 0) + 1);
      }
    }
    const top = [...fitTally.entries()].sort((a, b) => b[1] - a[1])[0];
    const twinTotal = [...fitTally.values()].reduce((a, b) => a + b, 0);
    if (top && twinTotal > 0) {
      cohortFitPreference = { fit: top[0], pct: Math.round((top[1] / twinTotal) * 100) };
    }
  }

  return {
    bodyShape: profile.bodyShape ?? null,
    cohort,
    percentiles,
    fitTwins,
    cohortFitPreference,
    totalBodies: stats.totalBodies,
  };
};
