// Extracted pure-form copy of
// crwn-clothing-fe/src/utils/size-recommendation.js
// for Node-side evaluation.

const fitOrder = ["XS", "S", "M", "L", "XL", "XXL"];

export const normalizeSizeChart = (sizeChartJson) => {
  if (!Array.isArray(sizeChartJson)) return [];
  return sizeChartJson.filter((entry) => entry && typeof entry.size === "string");
};

const scoreSize = (entry, profile) => {
  let score = 0;
  const comparisons = [
    [entry.chestCm, profile?.chestCm],
    [entry.waistCm, profile?.waistCm],
    [entry.hipCm, profile?.hipCm],
    [entry.inseamCm, profile?.inseamCm],
    [entry.shoulderCm, profile?.shoulderCm],
  ];

  comparisons.forEach(([target, actual]) => {
    if (typeof target !== "number" || typeof actual !== "number") return;
    const delta = target - actual;
    if (delta >= 0) {
      score += Math.max(0, 30 - delta);
    } else {
      score += Math.max(0, 20 + delta);
    }
  });

  if (profile?.preferredFit === "oversized" && ["L", "XL", "XXL"].includes(entry.size)) score += 6;
  if (profile?.preferredFit === "slim" && ["XS", "S", "M"].includes(entry.size)) score += 6;

  return score;
};

const sortAlternates = (sizes) =>
  [...sizes].sort((left, right) => {
    const li = fitOrder.indexOf(left);
    const ri = fitOrder.indexOf(right);
    if (li === -1 && ri === -1) return left.localeCompare(right);
    if (li === -1) return 1;
    if (ri === -1) return -1;
    return li - ri;
  });

export const getRecommendedSize = (product, bodyProfile) => {
  const sizeChart = normalizeSizeChart(product?.sizeChartJson);
  if (sizeChart.length === 0) {
    return { recommendedSize: null, alternates: [], confidence: 0 };
  }

  const ranked = sizeChart
    .map((entry) => ({ size: entry.size, score: scoreSize(entry, bodyProfile) }))
    .sort((left, right) => right.score - left.score);

  const recommendedSize = ranked[0]?.size ?? sizeChart[0]?.size ?? null;
  const alternates = sortAlternates(ranked.slice(1, 4).map((entry) => entry.size));

  return {
    recommendedSize,
    alternates,
    rankedSizes: ranked.map((r) => r.size),
    confidence: Number(Math.min(0.98, 0.5 + (ranked[0]?.score || 0) / 120).toFixed(2)),
  };
};
