// Body shape classification evaluation.
// Generates synthetic people with anthropometrically-realistic measurements
// + a stochastic "true" body shape label, then runs our inferBodyShape
// classifier and reports Accuracy / Precision / Recall / F1 (per-class +
// macro + weighted) plus the full confusion matrix.

import { inferBodyShape } from "./lib/measurements.js";
import { generateSyntheticPeople } from "./synthetic-data.js";
import { classificationReport, formatConfusionMatrix, fmtPct } from "./metrics.js";

const SHAPES = ["hourglass", "inverted-triangle", "triangle", "oval", "rectangle"];

export const runBodyShapeEvaluation = ({ n = 2000, seed = 42 } = {}) => {
  const people = generateSyntheticPeople(n, seed);

  const yTrue = [];
  const yPred = [];
  for (const p of people) {
    const predicted = inferBodyShape(p);
    if (!predicted) continue;       // skip if classifier abstains
    yTrue.push(p.trueShape);
    yPred.push(predicted);
  }

  const report = classificationReport(SHAPES, yTrue, yPred);
  return {
    component: "body-shape-classifier",
    samples: yTrue.length,
    skipped: people.length - yTrue.length,
    ...report,
  };
};

const formatReport = (r) => {
  const lines = [];
  lines.push(`Body Shape Classifier — n = ${r.samples} (skipped ${r.skipped})`);
  lines.push("─".repeat(70));
  lines.push(`Accuracy            : ${fmtPct(r.accuracy)}`);
  lines.push(`Macro Precision     : ${fmtPct(r.macroPrecision)}`);
  lines.push(`Macro Recall        : ${fmtPct(r.macroRecall)}`);
  lines.push(`Macro F1            : ${fmtPct(r.macroF1)}`);
  lines.push(`Weighted Precision  : ${fmtPct(r.weightedPrecision)}`);
  lines.push(`Weighted Recall     : ${fmtPct(r.weightedRecall)}`);
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
  process.argv[1]?.endsWith("body-shape-eval.js");

if (isMain) {
  const report = runBodyShapeEvaluation();
  console.log(formatReport(report));
}

export { formatReport };
