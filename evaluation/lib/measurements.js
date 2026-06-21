// Extracted pure-form copy of
// crwn-clothing-fe/src/routes/onboarding/inference/measurements.js
// Re-exported here so the eval harness can run in plain Node without the FE build.
// If the runtime version is updated, this file should be kept in sync.

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;

export const computeBmi = (heightCm, weightKg) => {
  if (!heightCm || !weightKg) return null;
  const m = Number(heightCm) / 100;
  if (!m) return null;
  return round(Number(weightKg) / (m * m), 1);
};

// FFIT body-shape classification (bust=chest / waist / hip). Kept in sync with
// crwn-clothing-be/src/services/bodyShape.ts and the FE measurements.js.
const BALANCE_TOL = 0.07;
const DEFINED_WAIST = 0.85;
const UNDEFINED_WAIST_WHR = 0.9;

export const inferBodyShape = ({ chestCm, waistCm, hipCm }) => {
  const bust = Number(chestCm);
  const waist = Number(waistCm);
  const hip = Number(hipCm);
  if (!bust || !waist || !hip) return null;

  const bustHipDiff = bust - hip;
  const balanced = Math.abs(bustHipDiff) <= BALANCE_TOL * hip;
  const whr = waist / hip;
  const wbr = waist / bust;
  const definedWaist = whr <= DEFINED_WAIST && wbr <= DEFINED_WAIST;

  if (definedWaist) {
    if (balanced) return "hourglass";
    return hip > bust ? "triangle" : "inverted-triangle";
  }
  if (bustHipDiff > BALANCE_TOL * hip) return "inverted-triangle";
  if (bustHipDiff < -BALANCE_TOL * hip) return "triangle";
  if (whr > UNDEFINED_WAIST_WHR || waist >= bust) return "oval";
  return "rectangle";
};

export const fallbackMeasurementsFromHeightWeight = (heightCm, weightKg) => {
  const h = clamp(Number(heightCm) || 170, 130, 220);
  const w = clamp(Number(weightKg) || 70, 35, 200);
  const bmi = w / Math.pow(h / 100, 2);
  const bmiFactor = clamp(bmi / 22, 0.75, 1.4);

  return {
    shoulderCm: round(h * 0.245 * Math.pow(bmiFactor, 0.5), 1),
    chestCm: round(h * 0.51 * bmiFactor, 1),
    waistCm: round(h * 0.45 * bmiFactor, 1),
    hipCm: round(h * 0.53 * bmiFactor, 1),
    inseamCm: round(h * 0.45, 1),
  };
};
