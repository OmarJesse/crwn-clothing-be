// Size recommendation evaluation against a synthetic Trendyol-shape catalog.
// For each (person, product) pair, computes the ground-truth ideal size
// (minimum measurement delta), runs our getRecommendedSize, and reports
// Top-1 / Top-2 / Top-3 Accuracy and Mean Reciprocal Rank.

import { getRecommendedSize } from "./lib/size-recommendation.js";
import {
  generateSyntheticPeople,
  generateSyntheticCatalog,
  trueIdealSize,
} from "./synthetic-data.js";
import { topKAccuracy, meanReciprocalRank, fmtPct, fmtNum } from "./metrics.js";

export const runSizeRecommendationEvaluation = ({
  people = 500,
  productsPerCat = 25,
  categories = 4,
  peopleSeed = 11,
  catalogSeed = 7,
} = {}) => {
  const allPeople = generateSyntheticPeople(people, peopleSeed);
  const catalog = generateSyntheticCatalog(categories, productsPerCat, catalogSeed);

  const yTrue = [];
  const yPredRanked = [];
  const perCategory = {};

  for (const person of allPeople) {
    for (const product of catalog) {
      const truth = trueIdealSize(person, product);
      if (!truth) continue;
      const rec = getRecommendedSize(product, person);
      const ranked = [rec.recommendedSize, ...(rec.alternates || [])].filter(Boolean);
      if (ranked.length === 0) continue;

      yTrue.push(truth);
      yPredRanked.push(ranked);

      const cat = product.category;
      if (!perCategory[cat]) perCategory[cat] = { yTrue: [], yPredRanked: [] };
      perCategory[cat].yTrue.push(truth);
      perCategory[cat].yPredRanked.push(ranked);
    }
  }

  const overall = {
    samples: yTrue.length,
    top1: Number(topKAccuracy(yTrue, yPredRanked, 1).toFixed(4)),
    top2: Number(topKAccuracy(yTrue, yPredRanked, 2).toFixed(4)),
    top3: Number(topKAccuracy(yTrue, yPredRanked, 3).toFixed(4)),
    mrr: Number(meanReciprocalRank(yTrue, yPredRanked).toFixed(4)),
  };

  const byCategory = {};
  for (const [cat, data] of Object.entries(perCategory)) {
    byCategory[cat] = {
      samples: data.yTrue.length,
      top1: Number(topKAccuracy(data.yTrue, data.yPredRanked, 1).toFixed(4)),
      top2: Number(topKAccuracy(data.yTrue, data.yPredRanked, 2).toFixed(4)),
      top3: Number(topKAccuracy(data.yTrue, data.yPredRanked, 3).toFixed(4)),
      mrr: Number(meanReciprocalRank(data.yTrue, data.yPredRanked).toFixed(4)),
    };
  }

  return {
    component: "size-recommendation",
    config: { people, productsPerCat, categories, peopleSeed, catalogSeed },
    overall,
    byCategory,
  };
};

const formatReport = (r) => {
  const lines = [];
  lines.push(`Size Recommendation — n = ${r.overall.samples} (person × product pairs)`);
  lines.push("─".repeat(70));
  lines.push(`Top-1 Accuracy : ${fmtPct(r.overall.top1)}`);
  lines.push(`Top-2 Accuracy : ${fmtPct(r.overall.top2)}`);
  lines.push(`Top-3 Accuracy : ${fmtPct(r.overall.top3)}`);
  lines.push(`MRR            : ${fmtNum(r.overall.mrr, 4)}`);
  lines.push("");
  lines.push("By category:");
  lines.push("category    n       Top-1    Top-2    Top-3    MRR");
  for (const [cat, m] of Object.entries(r.byCategory)) {
    lines.push(
      cat.padEnd(12) +
        String(m.samples).padStart(6) +
        " " +
        fmtPct(m.top1).padStart(8) +
        " " +
        fmtPct(m.top2).padStart(8) +
        " " +
        fmtPct(m.top3).padStart(8) +
        " " +
        fmtNum(m.mrr, 4).padStart(7)
    );
  }
  return lines.join("\n");
};

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("size-recommendation-eval.js");

if (isMain) {
  const report = runSizeRecommendationEvaluation();
  console.log(formatReport(report));
}

export { formatReport };
