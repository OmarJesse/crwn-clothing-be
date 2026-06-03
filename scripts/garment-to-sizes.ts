// Maps a coarse garment slug (from DummyJSON categories or H&M garment_group_name)
// to a sensible size chart in our internal sizeChartJson shape.

export const topSizes = [
  { size: "XS", chestCm: 88, waistCm: 76 },
  { size: "S", chestCm: 96, waistCm: 84 },
  { size: "M", chestCm: 104, waistCm: 92 },
  { size: "L", chestCm: 112, waistCm: 100 },
  { size: "XL", chestCm: 120, waistCm: 108 },
];

export const bottomSizes = [
  { size: "28", waistCm: 74, inseamCm: 78 },
  { size: "30", waistCm: 78, inseamCm: 79 },
  { size: "32", waistCm: 84, inseamCm: 80 },
  { size: "34", waistCm: 90, inseamCm: 81 },
  { size: "36", waistCm: 96, inseamCm: 82 },
];

export const trouserSizes = [
  { size: "S", waistCm: 72, hipCm: 94, inseamCm: 77 },
  { size: "M", waistCm: 78, hipCm: 100, inseamCm: 78 },
  { size: "L", waistCm: 84, hipCm: 106, inseamCm: 79 },
  { size: "XL", waistCm: 90, hipCm: 112, inseamCm: 80 },
];

export const dressSizes = [
  { size: "XS", chestCm: 82, waistCm: 64, hipCm: 88 },
  { size: "S", chestCm: 86, waistCm: 68, hipCm: 92 },
  { size: "M", chestCm: 92, waistCm: 74, hipCm: 98 },
  { size: "L", chestCm: 100, waistCm: 82, hipCm: 106 },
  { size: "XL", chestCm: 108, waistCm: 90, hipCm: 114 },
];

export const jacketSizes = [
  { size: "S", chestCm: 100, waistCm: 88 },
  { size: "M", chestCm: 108, waistCm: 96 },
  { size: "L", chestCm: 116, waistCm: 104 },
  { size: "XL", chestCm: 124, waistCm: 112 },
];

export const shoeSizes = [
  { size: "39" }, { size: "40" }, { size: "41" }, { size: "42" },
  { size: "43" }, { size: "44" }, { size: "45" },
];

export const oneSize = [{ size: "One Size" }];

export type CategorySlug = "shirts" | "pants" | "outerwear" | "accessories";

export const CATEGORY_IDS: Record<CategorySlug, string> = {
  shirts: "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
  pants: "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
  outerwear: "3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
  accessories: "4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a",
};

/** DummyJSON / FakeStoreAPI / H&M garment slug → size chart. */
export const sizeChartFor = (rawSlug: string): Array<Record<string, unknown>> => {
  const slug = rawSlug.toLowerCase().trim();
  if (slug.includes("dress")) return dressSizes;
  if (slug.includes("shoe") || slug.includes("footwear") || slug.includes("sneaker")) return shoeSizes;
  if (slug.includes("shirt") || slug.includes("top") || slug.includes("tee") || slug.includes("blouse") || slug.includes("polo")) return topSizes;
  if (slug.includes("jean") || slug.includes("pant") || slug.includes("denim")) return bottomSizes;
  if (slug.includes("trouser") || slug.includes("chino")) return trouserSizes;
  if (slug.includes("jacket") || slug.includes("coat") || slug.includes("parka") || slug.includes("bomber")) return jacketSizes;
  // Accessories: watches, sunglasses, bags, jewellery, belts (with a finer waist
  // chart) all fall back to one-size for the demo. Easy to enrich per type.
  if (slug.includes("belt")) return [
    { size: "S", waistCm: 74 },
    { size: "M", waistCm: 82 },
    { size: "L", waistCm: 90 },
    { size: "XL", waistCm: 98 },
  ];
  return oneSize;
};

/** Map an external source slug to one of our four storefront categories. */
export const categoryFor = (rawSlug: string): CategorySlug => {
  const slug = rawSlug.toLowerCase().trim();
  if (
    slug.includes("shirt") ||
    slug.includes("tee") ||
    slug.includes("top") ||
    slug.includes("blouse") ||
    slug.includes("polo") ||
    slug.includes("dress") ||
    slug.includes("hoodie") ||
    slug.includes("sweater") ||
    slug.includes("tank")
  ) {
    return "shirts";
  }
  if (
    slug.includes("jean") ||
    slug.includes("pant") ||
    slug.includes("denim") ||
    slug.includes("trouser") ||
    slug.includes("chino") ||
    slug.includes("jogger") ||
    slug.includes("cargo")
  ) {
    return "pants";
  }
  if (
    slug.includes("jacket") ||
    slug.includes("coat") ||
    slug.includes("parka") ||
    slug.includes("bomber") ||
    slug.includes("puffer") ||
    slug.includes("vest") ||
    slug.includes("windbreaker") ||
    slug.includes("trench") ||
    slug.includes("outerwear")
  ) {
    return "outerwear";
  }
  return "accessories";
};
