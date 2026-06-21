// Palette bucket classifier evaluation.
// Generates synthetic palettes drawn from each bucket's "ground truth" anchor
// distribution + noise, runs our classifier on them, reports
// Accuracy / Precision / Recall / F1.

import { classificationReport, formatConfusionMatrix, fmtPct } from "./metrics.js";

const PALETTE_BUCKETS = {
  warm: { anchors: [[225, 110, 75], [240, 175, 100], [200, 80, 60], [160, 90, 70]] },
  cool: { anchors: [[60, 130, 205], [80, 170, 220], [50, 90, 160], [40, 60, 140]] },
  neutral: { anchors: [[230, 230, 230], [180, 180, 180], [110, 110, 110], [50, 50, 50]] },
  earth: { anchors: [[120, 90, 60], [150, 120, 80], [90, 80, 60], [70, 60, 40]] },
  jewel: { anchors: [[140, 50, 90], [70, 50, 120], [40, 100, 90], [120, 70, 130]] },
  monochrome: { anchors: [[20, 20, 20], [60, 60, 60], [200, 200, 200], [240, 240, 240]] },
};

const BUCKETS = Object.keys(PALETTE_BUCKETS);

const colorDistance = (a, b) => {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const classifyPalette = (palette) => {
  const scores = {};
  for (const [name, info] of Object.entries(PALETTE_BUCKETS)) {
    let total = 0;
    for (const { rgb, count } of palette) {
      const closest = info.anchors.reduce(
        (min, anchor) => Math.min(min, colorDistance(rgb, anchor)),
        Infinity
      );
      total += count / (1 + closest);
    }
    scores[name] = total;
  }
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
};

export const runPaletteEvaluation = ({ samplesPerBucket = 200, seed = 99, noiseLevel = 25 } = {}) => {
  const rng = mulberry32(seed);
  const yTrue = [];
  const yPred = [];

  for (const trueBucket of BUCKETS) {
    const anchors = PALETTE_BUCKETS[trueBucket].anchors;
    for (let i = 0; i < samplesPerBucket; i++) {
      const palette = anchors.map((anchor) => ({
        rgb: anchor.map((c) =>
          Math.max(0, Math.min(255, Math.round(c + (rng() - 0.5) * 2 * noiseLevel)))
        ),
        count: 1000 + Math.round(rng() * 500),
      }));
      const predicted = classifyPalette(palette);
      yTrue.push(trueBucket);
      yPred.push(predicted);
    }
  }

  const report = classificationReport(BUCKETS, yTrue, yPred);
  return {
    component: "palette-bucket-classifier",
    samples: yTrue.length,
    noiseLevel,
    ...report,
  };
};

const formatReport = (r) => {
  const lines = [];
  lines.push(`Palette Bucket Classifier — n = ${r.samples} (noise ±${r.noiseLevel})`);
  lines.push("─".repeat(70));
  lines.push(`Accuracy            : ${fmtPct(r.accuracy)}`);
  lines.push(`Macro F1            : ${fmtPct(r.macroF1)}`);
  lines.push(`Weighted F1         : ${fmtPct(r.weightedF1)}`);
  lines.push("");
  lines.push("class                 P        R       F1   support");
  for (const row of r.perClass) {
    lines.push(
      row.class.padEnd(20) +
        fmtPct(row.precision).padStart(7) +
        " " +
        fmtPct(row.recall).padStart(7) +
        " " +
        fmtPct(row.f1).padStart(7) +
        " " +
        String(row.support).padStart(6)
    );
  }
  lines.push("");
  lines.push("Confusion matrix (rows = true, cols = predicted):");
  lines.push(formatConfusionMatrix(r.confusionMatrix));
  return lines.join("\n");
};

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("palette-eval.js");

if (isMain) {
  const report = runPaletteEvaluation();
  console.log(formatReport(report));
}

export { formatReport };
