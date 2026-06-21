// REAL-DATA body shape classification evaluation (ANSUR II).
//
// Methodology — this is the thesis's real-world validation of the body-shape
// classifier, complementing the synthetic suite in body-shape-eval.js:
//
//   1. Each ANSUR II subject's tape-measured bust/waist/hip circumferences are
//      treated as ground truth. Running the FFIT classifier on these clean
//      measurements yields the GOLD shape label for that real body.
//   2. We then simulate the in-browser pose-estimation pipeline's measurement
//      error by adding zero-mean Gaussian noise to each circumference. The
//      noise SD is set to the pipeline's observed circumference MAE (~3 cm).
//   3. The classifier is run again on the NOISY measurements to produce the
//      PREDICTED label.
//   4. Agreement between gold and predicted (Accuracy / Precision / Recall / F1
//      + confusion matrix) measures how robustly shape survives the real CV
//      pipeline's noise on a real, non-synthetic population of 6,068 bodies.
//
// This answers reviewer concern #3 (ground the claims in a real benchmark
// dataset) with measurable numbers rather than a design sketch.

import { inferBodyShape } from "./lib/measurements.js";
import { loadAnsurPeople } from "./ansur-loader.js";
import { classificationReport, formatConfusionMatrix, fmtPct } from "./metrics.js";

const SHAPES = ["hourglass", "inverted-triangle", "triangle", "oval", "rectangle"];

// Deterministic PRNG (mulberry32) + Box–Muller, so runs are reproducible.
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const standardNormal = (rng) => {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

export const runBodyShapeEvaluationAnsur = ({
  seed = 42,
  // Circumference measurement noise SD in cm — matches the pose pipeline's
  // observed MAE on girth measurements.
  noiseSdCm = 3,
  dir,
} = {}) => {
  const people = loadAnsurPeople({ dir });
  const rng = mulberry32(seed);

  const yTrue = [];
  const yPred = [];
  for (const p of people) {
    const gold = inferBodyShape(p);
    if (!gold) continue;

    const noisy = {
      chestCm: p.chestCm + standardNormal(rng) * noiseSdCm,
      waistCm: p.waistCm + standardNormal(rng) * noiseSdCm,
      hipCm: p.hipCm + standardNormal(rng) * noiseSdCm,
    };
    const predicted = inferBodyShape(noisy);
    if (!predicted) continue;

    yTrue.push(gold);
    yPred.push(predicted);
  }

  const report = classificationReport(SHAPES, yTrue, yPred);
  return {
    component: "body-shape-classifier-ansur",
    dataset: "ANSUR II (US Army 2012)",
    population: people.length,
    samples: yTrue.length,
    skipped: people.length - yTrue.length,
    noiseSdCm,
    ...report,
  };
};

const formatReport = (r) => {
  const lines = [];
  lines.push(
    `Body Shape Classifier — REAL DATA: ${r.dataset} — n = ${r.samples} ` +
      `(noise σ = ${r.noiseSdCm} cm)`
  );
  lines.push("─".repeat(70));
  lines.push(`Accuracy            : ${fmtPct(r.accuracy)}`);
  lines.push(`Macro Precision     : ${fmtPct(r.macroPrecision)}`);
  lines.push(`Macro Recall        : ${fmtPct(r.macroRecall)}`);
  lines.push(`Macro F1            : ${fmtPct(r.macroF1)}`);
  lines.push(`Weighted F1         : ${fmtPct(r.weightedF1)}`);
  lines.push("");
  lines.push("Per-class:");
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
  process.argv[1]?.endsWith("body-shape-eval-ansur.js");

if (isMain) {
  console.log(formatReport(runBodyShapeEvaluationAnsur()));
}

export { formatReport };
