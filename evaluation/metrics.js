// Standard ML evaluation metrics. Pure functions, no dependencies.
// Implements: Accuracy, Precision (per-class + macro + weighted),
// Recall, F1, Confusion Matrix, MAE, RMSE, Top-K Accuracy, NDCG@k.

const safeDiv = (a, b) => (b === 0 ? 0 : a / b);

/* -------------------- Classification -------------------- */

export const accuracy = (yTrue, yPred) => {
  if (yTrue.length !== yPred.length) throw new Error("length mismatch");
  if (yTrue.length === 0) return 0;
  let correct = 0;
  for (let i = 0; i < yTrue.length; i++) if (yTrue[i] === yPred[i]) correct++;
  return correct / yTrue.length;
};

export const confusionMatrix = (classes, yTrue, yPred) => {
  const idx = Object.fromEntries(classes.map((c, i) => [c, i]));
  const m = classes.map(() => classes.map(() => 0));
  for (let i = 0; i < yTrue.length; i++) {
    const t = idx[yTrue[i]];
    const p = idx[yPred[i]];
    if (t === undefined || p === undefined) continue;
    m[t][p]++;
  }
  return { classes, matrix: m };
};

/**
 * Per-class precision/recall/F1 + macro + weighted averages.
 * Reports tp, fp, fn so the caller can audit.
 */
export const classificationReport = (classes, yTrue, yPred) => {
  const cm = confusionMatrix(classes, yTrue, yPred);
  const support = classes.map((_, i) =>
    cm.matrix[i].reduce((acc, n) => acc + n, 0)
  );
  const perClass = classes.map((cls, i) => {
    const tp = cm.matrix[i][i];
    const fp = cm.matrix.reduce((acc, row, r) => acc + (r === i ? 0 : row[i]), 0);
    const fn = cm.matrix[i].reduce((acc, n, c) => acc + (c === i ? 0 : n), 0);
    const precision = safeDiv(tp, tp + fp);
    const recall = safeDiv(tp, tp + fn);
    const f1 = safeDiv(2 * precision * recall, precision + recall);
    return {
      class: cls,
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1: Number(f1.toFixed(4)),
      support: support[i],
      tp,
      fp,
      fn,
    };
  });

  const totalSupport = support.reduce((a, b) => a + b, 0);
  const macro = (key) =>
    classes.length === 0 ? 0 : perClass.reduce((acc, r) => acc + r[key], 0) / classes.length;
  const weighted = (key) =>
    totalSupport === 0
      ? 0
      : perClass.reduce((acc, r, i) => acc + r[key] * support[i], 0) / totalSupport;

  return {
    accuracy: Number(accuracy(yTrue, yPred).toFixed(4)),
    macroPrecision: Number(macro("precision").toFixed(4)),
    macroRecall: Number(macro("recall").toFixed(4)),
    macroF1: Number(macro("f1").toFixed(4)),
    weightedPrecision: Number(weighted("precision").toFixed(4)),
    weightedRecall: Number(weighted("recall").toFixed(4)),
    weightedF1: Number(weighted("f1").toFixed(4)),
    perClass,
    confusionMatrix: cm,
    totalSamples: totalSupport,
  };
};

/* -------------------- Regression -------------------- */

export const mae = (yTrue, yPred) => {
  if (yTrue.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < yTrue.length; i++) sum += Math.abs(yTrue[i] - yPred[i]);
  return sum / yTrue.length;
};

export const rmse = (yTrue, yPred) => {
  if (yTrue.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const d = yTrue[i] - yPred[i];
    sum += d * d;
  }
  return Math.sqrt(sum / yTrue.length);
};

export const r2 = (yTrue, yPred) => {
  if (yTrue.length === 0) return 0;
  const mean = yTrue.reduce((a, b) => a + b, 0) / yTrue.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < yTrue.length; i++) {
    ssRes += Math.pow(yTrue[i] - yPred[i], 2);
    ssTot += Math.pow(yTrue[i] - mean, 2);
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
};

export const regressionReport = (yTrue, yPred) => ({
  mae: Number(mae(yTrue, yPred).toFixed(4)),
  rmse: Number(rmse(yTrue, yPred).toFixed(4)),
  r2: Number(r2(yTrue, yPred).toFixed(4)),
  n: yTrue.length,
});

/* -------------------- Ranking -------------------- */

/**
 * topKAccuracy(yTrue, yPredRanked, k)
 * yPredRanked[i] is an ordered array of predicted candidates.
 * Returns the fraction of samples where yTrue[i] appears in yPredRanked[i][0..k).
 */
export const topKAccuracy = (yTrue, yPredRanked, k) => {
  if (yTrue.length === 0) return 0;
  let hit = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const ranked = yPredRanked[i] || [];
    if (ranked.slice(0, k).includes(yTrue[i])) hit++;
  }
  return hit / yTrue.length;
};

export const meanReciprocalRank = (yTrue, yPredRanked) => {
  if (yTrue.length === 0) return 0;
  let sumRR = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const ranked = yPredRanked[i] || [];
    const r = ranked.indexOf(yTrue[i]);
    if (r >= 0) sumRR += 1 / (r + 1);
  }
  return sumRR / yTrue.length;
};

/* -------------------- Formatting helpers -------------------- */

export const formatConfusionMatrix = ({ classes, matrix }) => {
  const colWidth = Math.max(8, ...classes.map((c) => c.length + 1));
  const pad = (s) => String(s).padStart(colWidth, " ");
  const header = " ".repeat(colWidth) + classes.map(pad).join("");
  const rows = matrix.map(
    (row, i) => classes[i].padStart(colWidth) + row.map((n) => pad(n)).join("")
  );
  return [header, ...rows].join("\n");
};

export const fmtPct = (x) => `${(x * 100).toFixed(2)}%`;
export const fmtNum = (x, p = 4) => Number(x).toFixed(p);
