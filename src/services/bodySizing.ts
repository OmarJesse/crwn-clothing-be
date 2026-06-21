import Product from "../models/Product";
import { classifyBodyShape } from "./bodyShape";

type SizeChartEntry = {
  size: string;
  chestCm?: number;
  waistCm?: number;
  hipCm?: number;
  inseamCm?: number;
  shoulderCm?: number;
};

export type BodyProfileInput = {
  heightCm?: number | null;
  weightKg?: number | null;
  chestCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  inseamCm?: number | null;
  shoulderCm?: number | null;
  preferredFit?: string | null;
  landmarkSummary?: {
    shoulderWidthRatio?: number;
    torsoWidthRatio?: number;
    faceAspectRatio?: number;
    faceWidthRatio?: number;
    confidence?: number;
  } | null;
  landmarkModel?: string | null;
  preferredStyles?: string[] | null;
  preferredPalettes?: string[] | null;
};

export type BodyProfile = BodyProfileInput & {
  bmi?: number | null;
  bodyShape?: string | null;
  recommendationVersion: string;
  confidence: number;
};

type RecommendationReason = {
  code: string;
  label: string;
};

const asFiniteNumber = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
};

const inRange = (value: number | null, min: number, max: number) => {
  if (value === null) {
    return null;
  }

  if (value < min || value > max) {
    return null;
  }

  return value;
};

const sanitizeLandmarkSummary = (
  summary: BodyProfileInput["landmarkSummary"]
): BodyProfileInput["landmarkSummary"] => {
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const shoulderWidthRatio = inRange(asFiniteNumber(summary.shoulderWidthRatio), 0.12, 0.45);
  const torsoWidthRatio = inRange(asFiniteNumber(summary.torsoWidthRatio), 0.12, 0.6);
  const faceAspectRatio = inRange(asFiniteNumber(summary.faceAspectRatio), 0.6, 2.8);
  const faceWidthRatio = inRange(asFiniteNumber(summary.faceWidthRatio), 0.15, 0.7);
  const confidence = inRange(asFiniteNumber(summary.confidence), 0, 1);

  const sanitized = {
    shoulderWidthRatio: shoulderWidthRatio ?? undefined,
    torsoWidthRatio: torsoWidthRatio ?? undefined,
    faceAspectRatio: faceAspectRatio ?? undefined,
    faceWidthRatio: faceWidthRatio ?? undefined,
    confidence: confidence ?? undefined,
  };

  if (Object.values(sanitized).every((value) => typeof value === "undefined")) {
    return null;
  }

  return sanitized;
};

const enrichFromLandmarks = (input: BodyProfileInput) => {
  const enriched: BodyProfileInput = {
    ...input,
    landmarkSummary: sanitizeLandmarkSummary(input.landmarkSummary),
  };
  const heightCm = input.heightCm ?? null;
  const summary = enriched.landmarkSummary;

  if (heightCm && summary?.shoulderWidthRatio && !input.shoulderCm) {
    enriched.shoulderCm = Number((heightCm * summary.shoulderWidthRatio).toFixed(1));
  }

  if (heightCm && summary?.torsoWidthRatio && !input.chestCm) {
    enriched.chestCm = Number((heightCm * summary.torsoWidthRatio * 1.85).toFixed(1));
  }

  if (heightCm && summary?.torsoWidthRatio && !input.waistCm) {
    enriched.waistCm = Number((heightCm * summary.torsoWidthRatio * 1.65).toFixed(1));
  }

  return enriched;
};

const SIZE_WEIGHT_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];

const calculateBmi = (weightKg?: number | null, heightCm?: number | null) => {
  if (!weightKg || !heightCm) {
    return null;
  }

  const heightMeters = heightCm / 100;
  return Number((weightKg / (heightMeters * heightMeters)).toFixed(1));
};

// Body shape is the literature-grounded FFIT classification (bust/waist/hip),
// shared verbatim with the seed and the evaluation harness. See bodyShape.ts.
const inferBodyShape = (profile: BodyProfileInput & { bmi?: number | null }) =>
  classifyBodyShape({
    chestCm: profile.chestCm,
    waistCm: profile.waistCm,
    hipCm: profile.hipCm,
  });

export const inferBodyProfile = (input: BodyProfileInput): BodyProfile => {
  const enrichedInput = enrichFromLandmarks(input);
  const bmi = calculateBmi(enrichedInput.weightKg, enrichedInput.heightCm);
  const knownSignals = [
    enrichedInput.heightCm,
    enrichedInput.weightKg,
    enrichedInput.chestCm,
    enrichedInput.waistCm,
    enrichedInput.hipCm,
  ].filter(Boolean).length / 5;
  const landmarkBoost = typeof enrichedInput.landmarkSummary?.confidence === "number"
    ? Math.min(0.2, enrichedInput.landmarkSummary.confidence * 0.2)
    : 0;

  return {
    ...enrichedInput,
    bmi,
    bodyShape: inferBodyShape({ ...enrichedInput, bmi }),
    recommendationVersion: enrichedInput.landmarkSummary ? "vision-mock-v2" : "mock-v1",
    confidence: Number((Math.min(0.98, 0.55 + knownSignals * 0.35 + landmarkBoost)).toFixed(2)),
  };
};

const scoreSize = (entry: SizeChartEntry, profile: BodyProfile) => {
  let score = 0;
  let matches = 0;

  const comparisons: Array<[number | undefined, number | undefined]> = [
    [entry.chestCm, profile.chestCm ?? undefined],
    [entry.waistCm, profile.waistCm ?? undefined],
    [entry.hipCm, profile.hipCm ?? undefined],
    [entry.inseamCm, profile.inseamCm ?? undefined],
    [entry.shoulderCm, profile.shoulderCm ?? undefined],
  ];

  comparisons.forEach(([target, actual]) => {
    if (typeof target !== "number" || typeof actual !== "number") {
      return;
    }

    matches += 1;
    const delta = target - actual;
    if (delta >= 0) {
      score += Math.max(0, 30 - delta);
    } else {
      score += Math.max(0, 20 + delta);
    }
  });

  return { score, matches };
};

const resolveFallbackSize = (sizeChart: SizeChartEntry[]) => {
  if (sizeChart.length === 0) {
    return null;
  }

  return sizeChart[Math.floor(sizeChart.length / 2)]?.size ?? sizeChart[0]?.size ?? null;
};

export const recommendProductSize = (product: Product, profile: BodyProfile) => {
  const sizeChart = (product.sizeChartJson as SizeChartEntry[] | null | undefined) ?? [];

  if (sizeChart.length === 0) {
    return {
      recommendedSize: null,
      alternates: [],
      confidence: 0.2,
      explanation: "This product does not yet have a size chart.",
      reasonTags: [],
    };
  }

  const rankedSizes = sizeChart
    .map((entry) => {
      const { score, matches } = scoreSize(entry, profile);
      return {
        size: entry.size,
        score: score + matches * 5,
      };
    })
    .sort((left, right) => right.score - left.score);

  const recommendedSize = rankedSizes[0]?.size ?? resolveFallbackSize(sizeChart);
  const alternates = rankedSizes.slice(1, 3).map((entry) => entry.size);
  const fitNote = profile.preferredFit ? ` with a ${profile.preferredFit} fit preference` : "";
  const topScore = rankedSizes[0]?.score ?? 24;
  const reasons: RecommendationReason[] = [];

  if (profile.preferredFit) {
    reasons.push({
      code: "preferred-fit",
      label: `Preferred fit: ${profile.preferredFit}`,
    });
  }

  if (profile.chestCm || profile.waistCm || profile.hipCm) {
    reasons.push({
      code: "measurement-match",
      label: "Matches your body measurements",
    });
  }

  if (profile.landmarkSummary?.confidence) {
    reasons.push({
      code: "vision-confidence",
      label: `Vision confidence ${Math.round(profile.landmarkSummary.confidence * 100)}%`,
    });
  }

  return {
    recommendedSize,
    alternates,
    confidence: Number(Math.min(0.98, 0.55 + topScore / 120).toFixed(2)),
    explanation: `Recommended size ${recommendedSize}${fitNote} based on the current body profile.`,
    reasonTags: reasons,
  };
};

export const normalizeSizeChart = (sizeChartJson: unknown) => {
  if (!Array.isArray(sizeChartJson)) {
    return [] as SizeChartEntry[];
  }

  return sizeChartJson
    .map((entry) => entry as SizeChartEntry)
    .filter((entry) => typeof entry?.size === "string");
};

export const sortCategorySizes = (sizeValues: string[]) => {
  return [...sizeValues].sort((left, right) => {
    const leftIndex = SIZE_WEIGHT_ORDER.indexOf(left);
    const rightIndex = SIZE_WEIGHT_ORDER.indexOf(right);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });
};