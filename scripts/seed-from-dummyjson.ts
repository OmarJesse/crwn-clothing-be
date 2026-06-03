/**
 * Backfill the live products table with real-CDN-hosted apparel + accessories
 * pulled from DummyJSON (https://dummyjson.com).
 *
 * Why: DummyJSON exposes ~50 apparel/accessory items across 10 categories with
 * real-looking product imagery hosted on their own CDN (cdn.dummyjson.com),
 * real descriptions, real prices, real brand fields. Auth-free, no API limits
 * we'll hit at this volume, idempotent because we derive UUIDs deterministically
 * from the source IDs (uuidv5 with a fixed namespace).
 *
 * Usage:
 *   cd crwn-clothing-be
 *   npx ts-node --project tsconfig.json scripts/seed-from-dummyjson.ts [--reset]
 *
 * --reset wipes the existing products table first (categories stay). Default
 *   is additive: we bulkCreate with ignoreDuplicates so re-running just no-ops
 *   on items we've already inserted.
 */

import "dotenv/config";
import { v5 as uuidv5 } from "uuid";
import sequelize from "../src/models/sequelize";
import Product from "../src/models/Product";
import Category from "../src/models/Category";
import "../src/models";
import {
  sizeChartFor,
  categoryFor,
  CATEGORY_IDS,
} from "./garment-to-sizes";

const NAMESPACE = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"; // arbitrary fixed UUID

// DummyJSON categories we'll pull. Each maps cleanly onto one of our four
// storefront buckets via categoryFor().
const DUMMYJSON_CATEGORIES = [
  "tops",
  "mens-shirts",
  "womens-dresses",
  "mens-shoes",
  "womens-shoes",
  "mens-watches",
  "womens-watches",
  "womens-bags",
  "womens-jewellery",
  "sunglasses",
];

type DjProduct = {
  id: number;
  title: string;
  description?: string;
  category: string;
  brand?: string;
  price: number;
  stock?: number;
  images?: string[];
  thumbnail?: string;
  tags?: string[];
};

const fetchCategory = async (cat: string): Promise<DjProduct[]> => {
  const res = await fetch(`https://dummyjson.com/products/category/${cat}?limit=100`);
  if (!res.ok) {
    console.warn(`  ${cat}: HTTP ${res.status} ${res.statusText}`);
    return [];
  }
  const data = await res.json();
  return (data?.products as DjProduct[]) || [];
};

const genUuid = (externalId: string): string =>
  uuidv5(`dummyjson:${externalId}`, NAMESPACE);

const buildRow = (p: DjProduct) => {
  // Most descriptive slug we have for this product (its specific DummyJSON
  // category is more useful than its parent group for size-chart routing).
  const sourceSlug = p.category;
  const ourCategorySlug = categoryFor(sourceSlug);
  const sizeChart = sizeChartFor(sourceSlug);

  // Build recommendationTags from everything we know — fed back into the
  // recommendation engine's preference scoring later.
  const tags = [
    ourCategorySlug,
    sourceSlug.replace(/-/g, " "),
    ...(p.brand ? [p.brand.toLowerCase()] : []),
    ...(p.tags || []).map((t) => t.toLowerCase()),
  ].filter(Boolean) as string[];

  return {
    id: genUuid(`${sourceSlug}-${p.id}`),
    name: p.title,
    description: p.description?.trim() || `${p.brand || ""} ${p.title}`.trim(),
    price: Math.round(p.price * 100) / 100,
    stock: typeof p.stock === "number" ? p.stock : 50,
    fitType:
      ourCategorySlug === "accessories"
        ? "one-size"
        : sourceSlug.includes("dress")
        ? "regular"
        : "regular",
    recommendationTags: Array.from(new Set(tags)),
    sizeChartJson: sizeChart,
    imageUrl: p.images?.[0] || p.thumbnail || null,
    categoryId: CATEGORY_IDS[ourCategorySlug],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};

const ensureCategories = async () => {
  // Defensive: make sure the 4 baseline rows exist (idempotent — does nothing
  // if they're already there from the original seed).
  const baseline = [
    { id: CATEGORY_IDS.shirts, name: "Shirts & Tops" },
    { id: CATEGORY_IDS.pants, name: "Pants & Bottoms" },
    { id: CATEGORY_IDS.outerwear, name: "Outerwear" },
    { id: CATEGORY_IDS.accessories, name: "Accessories" },
  ];
  for (const c of baseline) {
    await Category.findOrCreate({
      where: { id: c.id },
      defaults: {
        ...c,
        imageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    });
  }
};

const run = async () => {
  const argv = new Set(process.argv.slice(2));
  const reset = argv.has("--reset");

  console.log("Connecting to database…");
  await sequelize.authenticate();
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await sequelize.sync({ alter: false });
  await ensureCategories();

  if (reset) {
    console.log("Resetting products table…");
    await Product.destroy({ where: {} });
  }

  console.log(`Fetching ${DUMMYJSON_CATEGORIES.length} DummyJSON categories…`);
  const all: DjProduct[] = [];
  for (const cat of DUMMYJSON_CATEGORIES) {
    const items = await fetchCategory(cat);
    console.log(`  ${cat.padEnd(22)} ${items.length}`);
    all.push(...items);
  }

  console.log(`\nMapping ${all.length} products…`);
  const rows = all.map(buildRow);

  const distribution = rows.reduce<Record<string, number>>((acc, r) => {
    const slug = Object.entries(CATEGORY_IDS).find(([, id]) => id === r.categoryId)?.[0] || "?";
    acc[slug] = (acc[slug] || 0) + 1;
    return acc;
  }, {});
  for (const [k, v] of Object.entries(distribution)) {
    console.log(`  → ${k.padEnd(12)} ${v}`);
  }

  console.log(`\nInserting (ignoreDuplicates) …`);
  const result = await Product.bulkCreate(rows as any, {
    ignoreDuplicates: true,
  });
  console.log(`✓ Done. Inserted/skipped ${result.length} rows.`);

  const total = await Product.count();
  console.log(`Total products now in catalog: ${total}`);

  await sequelize.close();
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
