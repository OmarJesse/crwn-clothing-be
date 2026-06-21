/**
 * Body-shape classification — FFIT taxonomy.
 *
 * Implements a simplified, ratio-based form of the **Female Figure Identification
 * Technique (FFIT for Apparel)** described by Simmons, Istook & Devarajan (2004),
 * the de-facto academic standard for somatotype classification in apparel
 * research. We collapse FFIT's nine categories into the five that are visually
 * and garment-relevant and that our synthetic-data generator already targets:
 *
 *   hourglass           bust ≈ hip, clearly defined waist
 *   inverted-triangle   bust dominant (top-heavy)
 *   triangle (pear)     hip dominant (bottom-heavy)
 *   oval (apple)        waist is the widest / undefined waist with high WHR
 *   rectangle           bust ≈ hip, little waist definition
 *
 * Inputs are circumferences in cm: bust (=chest), waist, hip. This is exactly
 * what tape-measure anthropometric surveys (e.g. ANSUR II) provide, so the same
 * function classifies real survey bodies and live onboarding measurements
 * identically — a single source of truth shared by the API, the seed, and the
 * evaluation harness.
 *
 * Reference: Simmons K., Istook C.L., Devarajan P. (2004). "Female Figure
 * Identification Technique (FFIT) for Apparel." Journal of Textile and Apparel,
 * Technology and Management, 4(1).
 */

export const BODY_SHAPES = [
  "hourglass",
  "inverted-triangle",
  "triangle",
  "oval",
  "rectangle",
] as const;

export type BodyShape = (typeof BODY_SHAPES)[number] | "unknown";

export type ShapeMeasurements = {
  // bust girth — we use chest circumference as the bust proxy
  chestCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
};

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Calibration constants. FFIT's published thresholds are absolute inch
 * differences tuned to a general female population measured at the *bust*.
 * ANSUR provides chest (not bust) circumference and is a fitter-than-average
 * military cohort, so we express the same rules as ratios and calibrate the
 * cut-points to reproduce published general-population shape frequencies
 * (Lee et al. 2007: hourglass ≈8%, triangle ≈21%, inverted ≈14%, oval ≈11%,
 * rectangle ≈46%). See bodyShape.test for the population check.
 *
 * NOTE (stated limitation): chest circumference is used as the bust proxy.
 * For figures where breast prominence materially exceeds chest girth the
 * bust signal is under-read; this biases such figures toward triangle.
 */
// Bust and hip within ±7% of hip count as a "balanced" top/bottom.
const BALANCE_TOL = 0.07;
// Waist ≤ 85% of BOTH bust and hip counts as a "clearly defined" waist.
const DEFINED_WAIST = 0.85;
// Waist-to-hip ratio above this reads as an undefined / widest waist (oval).
const UNDEFINED_WAIST_WHR = 0.9;

/**
 * Classify a body into one FFIT shape from bust/waist/hip circumferences.
 * Returns "unknown" when any of the three girths is missing.
 *
 * The decision tree mirrors FFIT's "hourglass family" (top / balanced /
 * bottom hourglass) vs. "straight" (rectangle / oval) split:
 *   1. a clearly defined waist routes into the hourglass family, then
 *      bust-vs-hip balance picks hourglass / inverted-triangle / triangle;
 *   2. without a defined waist, bust-vs-hip dominance picks
 *      inverted-triangle / triangle, else WHR picks oval vs. rectangle.
 */
export const classifyBodyShape = (m: ShapeMeasurements): BodyShape => {
  const bust = m.chestCm;
  const waist = m.waistCm;
  const hip = m.hipCm;

  if (!isNum(bust) || !isNum(waist) || !isNum(hip)) {
    return "unknown";
  }

  const bustHipDiff = bust - hip;
  const balanced = Math.abs(bustHipDiff) <= BALANCE_TOL * hip;
  const whr = waist / hip;
  const wbr = waist / bust;
  const definedWaist = whr <= DEFINED_WAIST && wbr <= DEFINED_WAIST;

  // 1. Hourglass family — a clearly defined waist.
  if (definedWaist) {
    if (balanced) return "hourglass"; // balanced bust & hip
    return hip > bust ? "triangle" : "inverted-triangle"; // bottom / top hourglass
  }

  // 2. No defined waist — bust-vs-hip dominance wins first.
  if (bustHipDiff > BALANCE_TOL * hip) return "inverted-triangle";
  if (bustHipDiff < -BALANCE_TOL * hip) return "triangle";

  // 3. Balanced top/bottom, undefined waist: oval (widest at waist) vs rectangle.
  if (whr > UNDEFINED_WAIST_WHR || waist >= bust) return "oval";
  return "rectangle";
};
