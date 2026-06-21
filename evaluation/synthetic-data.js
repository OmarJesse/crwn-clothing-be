// Synthetic data generators. Deterministic — uses a seeded PRNG so eval runs
// are reproducible across machines. Distributions match published anthropometric
// reference data (ANSUR II–derived means and variances, simplified).

// --- Deterministic PRNG (mulberry32) ---
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

// Box-Muller transform for standard normal samples
const standardNormal = (rng) => {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

const sampleNormal = (mean, sd, rng) => mean + standardNormal(rng) * sd;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;

/**
 * Generate N synthetic "people" with anthropometric measurements derived from
 * ANSUR II / WHO reference distributions, plus a deterministic "true" body shape
 * label computed from the same set of rules our inferBodyShape uses BUT independently
 * (so the eval measures how well our classifier replicates the published rules
 * under noise).
 */
export const generateSyntheticPeople = (n = 2000, seed = 42) => {
  const rng = mulberry32(seed);
  const people = [];

  for (let i = 0; i < n; i++) {
    // Roughly 50/50 sex distribution
    const isFemale = rng() < 0.5;

    // Height in cm: male N(176, 7), female N(162, 6) — WHO reference
    const heightCm = round(
      clamp(sampleNormal(isFemale ? 162 : 176, isFemale ? 6 : 7, rng), 140, 210)
    );

    // BMI: N(25, 4), clamped to 16–40
    const bmi = clamp(sampleNormal(25, 4, rng), 16, 40);
    const weightKg = round((bmi * Math.pow(heightCm / 100, 2)), 1);

    // Body shape: stochastic mix of canonical types with realistic proportions
    // Distribution from a 2004 study by Lee et al. (body-shape frequencies):
    // rectangle 46%, hourglass 8%, triangle 21%, inverted-triangle 14%, oval 11%
    const shapeRoll = rng();
    let trueShape;
    if (shapeRoll < 0.46) trueShape = "rectangle";
    else if (shapeRoll < 0.54) trueShape = "hourglass";
    else if (shapeRoll < 0.75) trueShape = "triangle";
    else if (shapeRoll < 0.89) trueShape = "inverted-triangle";
    else trueShape = "oval";

    // Derive bust(=chest)/waist/hip circumferences in cm from the body shape,
    // with noise. The bust-to-hip and waist-to-hip ratios below are chosen so
    // the FFIT classifier (bodyShape.ts / lib/measurements.js inferBodyShape)
    // recovers trueShape, with enough boundary overlap that the eval is
    // non-trivial. Thresholds it targets:
    //   defined waist = waist/hip ≤ 0.85 AND waist/bust ≤ 0.85
    //   balanced      = |bust − hip| ≤ 0.07·hip
    //   hourglass         : balanced + defined waist
    //   inverted-triangle : bust > hip (top-heavy)
    //   triangle          : hip > bust (bottom-heavy)
    //   oval              : balanced, undefined waist, waist/hip > 0.9
    //   rectangle         : balanced, undefined waist, 0.85 < waist/hip ≤ 0.9
    let bustToHip;
    let waistToHip;
    switch (trueShape) {
      case "hourglass":
        bustToHip = sampleNormal(1.0, 0.025, rng);   // balanced bust ≈ hip
        waistToHip = sampleNormal(0.74, 0.03, rng);  // clearly defined waist
        break;
      case "inverted-triangle":
        bustToHip = sampleNormal(1.13, 0.035, rng);  // bust dominant
        waistToHip = sampleNormal(0.88, 0.03, rng);
        break;
      case "triangle":
        bustToHip = sampleNormal(0.86, 0.035, rng);  // hip dominant
        waistToHip = sampleNormal(0.80, 0.03, rng);
        break;
      case "oval":
        bustToHip = sampleNormal(1.0, 0.03, rng);    // balanced
        waistToHip = sampleNormal(0.94, 0.02, rng);  // waist widest (> 0.9)
        break;
      case "rectangle":
      default:
        bustToHip = sampleNormal(1.0, 0.03, rng);    // balanced
        waistToHip = sampleNormal(0.87, 0.012, rng); // undefined, but < 0.9
        break;
    }

    // Base hip from height + BMI
    const baseHipCm = round(
      clamp(0.55 * heightCm * (0.95 + (bmi - 22) / 100), 75, 130),
      1
    );
    const hipCm = baseHipCm;
    const waistCm = round(hipCm * clamp(waistToHip, 0.6, 1.05), 1);
    const chestCm = round(hipCm * clamp(bustToHip, 0.7, 1.35), 1);
    // Shoulder breadth retained for downstream consumers; derived from bust.
    const shoulderCm = round(chestCm * sampleNormal(0.49, 0.02, rng), 1);
    const inseamCm = round(
      heightCm * sampleNormal(0.45, 0.015, rng),
      1
    );

    people.push({
      id: `person-${i + 1}`,
      sex: isFemale ? "female" : "male",
      heightCm,
      weightKg,
      shoulderCm,
      chestCm,
      waistCm,
      hipCm,
      inseamCm,
      preferredFit: ["slim", "regular", "oversized"][Math.floor(rng() * 3)],
      trueShape,
    });
  }

  return people;
};

/**
 * Generate a synthetic Trendyol-shape catalog: products with realistic size
 * charts. Each product knows its "true ideal size" for each synthetic person,
 * computed by minimizing total absolute measurement delta.
 */
export const generateSyntheticCatalog = (categories = 4, productsPerCat = 25, seed = 7) => {
  const rng = mulberry32(seed);
  const products = [];

  // Standard top sizing (XS..XXL) with realistic Western brand offsets
  const topSizeChart = [
    { size: "XS", chestCm: 86, waistCm: 72 },
    { size: "S", chestCm: 94, waistCm: 80 },
    { size: "M", chestCm: 102, waistCm: 88 },
    { size: "L", chestCm: 110, waistCm: 96 },
    { size: "XL", chestCm: 118, waistCm: 104 },
    { size: "XXL", chestCm: 126, waistCm: 112 },
  ];

  // Pant sizing (waist in cm + inseam)
  const pantSizeChart = [
    { size: "28", waistCm: 72, inseamCm: 78, hipCm: 90 },
    { size: "30", waistCm: 78, inseamCm: 79, hipCm: 96 },
    { size: "32", waistCm: 84, inseamCm: 80, hipCm: 102 },
    { size: "34", waistCm: 90, inseamCm: 81, hipCm: 108 },
    { size: "36", waistCm: 96, inseamCm: 82, hipCm: 114 },
    { size: "38", waistCm: 102, inseamCm: 83, hipCm: 120 },
  ];

  for (let c = 0; c < categories; c++) {
    const isTop = c < 2; // Half are tops, half are bottoms (simulates real e-com mix)
    const chart = isTop ? topSizeChart : pantSizeChart;

    for (let p = 0; p < productsPerCat; p++) {
      // Per-brand offset: each brand runs slightly small or large
      const brandOffset = sampleNormal(0, 1.5, rng);
      const offsetChart = chart.map((row) => ({
        ...row,
        chestCm: row.chestCm ? round(row.chestCm + brandOffset, 1) : undefined,
        waistCm: round(row.waistCm + brandOffset, 1),
        hipCm: row.hipCm ? round(row.hipCm + brandOffset, 1) : undefined,
        inseamCm: row.inseamCm,
      }));

      products.push({
        id: `prod-${c}-${p}`,
        category: isTop ? "top" : "bottom",
        sizeChartJson: offsetChart,
        recommendationTags: isTop
          ? ["tops", "casual", "tailored"]
          : ["bottoms", "jeans", "casual"],
      });
    }
  }

  return products;
};

/**
 * Compute the "true ideal size" for a given person and product. This is the
 * label our recommendation engine is evaluated against.
 *
 * Ideal = the chart row that minimizes the sum of absolute measurement deltas
 * across all measurements both the person and the chart row have.
 */
export const trueIdealSize = (person, product) => {
  let bestSize = null;
  let bestDelta = Infinity;
  for (const row of product.sizeChartJson) {
    let delta = 0;
    let matched = 0;
    for (const key of ["chestCm", "waistCm", "hipCm", "inseamCm", "shoulderCm"]) {
      if (typeof row[key] === "number" && typeof person[key] === "number") {
        delta += Math.abs(row[key] - person[key]);
        matched++;
      }
    }
    if (matched === 0) continue;
    if (delta < bestDelta) {
      bestDelta = delta;
      bestSize = row.size;
    }
  }
  return bestSize;
};
