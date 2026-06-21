// Extracted pure-form copy of crwn-clothing-fe/src/utils/product-style-match.js
// for Node-side evaluation.

const STYLE_TAG_MAP = {
  minimalist: ["tailored", "structured", "minimal", "smart-casual"],
  streetwear: ["casual", "bold", "oversized", "athletic", "athleisure"],
  classic: ["smart-casual", "tailored", "structured", "polo"],
  bohemian: ["flowing", "draped", "linen", "wide-leg", "summer"],
  sporty: ["athletic", "active", "athleisure", "joggers"],
  edgy: ["fitted", "bold", "premium", "biker"],
  preppy: ["smart-casual", "polo", "tailored", "structured"],
  vintage: ["vintage", "fall", "corduroy", "flannel", "plaid"],
};

const PALETTE_BUCKET_BY_ID = {
  "earth-tones": "earth",
  monochrome: "monochrome",
  pastels: "neutral",
  "jewel-tones": "jewel",
  "warm-neutrals": "warm",
  "bold-brights": "warm",
  "cool-tones": "cool",
  sunset: "warm",
};

export const scoreProductPreferences = (product, { preferredStyles, preferredPalettes } = {}) => {
  let styleScore = 0;
  let paletteScore = 0;

  if (Array.isArray(preferredStyles) && preferredStyles.length > 0) {
    const productTags = (product?.recommendationTags || []).map((t) => String(t).toLowerCase());
    let bestStyleHits = 0;
    preferredStyles.forEach((styleId) => {
      const wanted = STYLE_TAG_MAP[styleId] || [];
      const hits = wanted.filter((t) => productTags.some((p) => p.includes(t))).length;
      if (hits > bestStyleHits) bestStyleHits = hits;
    });
    styleScore = Math.min(1, bestStyleHits / 2);
  }

  if (Array.isArray(preferredPalettes) && preferredPalettes.length > 0) {
    const productBuckets = new Set(
      (product?.recommendationTags || []).map((t) => String(t).toLowerCase())
    );
    const wantedBuckets = preferredPalettes
      .map((id) => PALETTE_BUCKET_BY_ID[id])
      .filter(Boolean);
    const hits = wantedBuckets.filter((b) => productBuckets.has(b)).length;
    paletteScore = Math.min(1, hits / Math.max(1, wantedBuckets.length));
  }

  const score = styleScore * 0.6 + paletteScore * 0.4;
  return {
    score: Number(score.toFixed(3)),
    styleScore: Number(styleScore.toFixed(3)),
    paletteScore: Number(paletteScore.toFixed(3)),
  };
};
