/**
 * Balance the catalog's apparel categories.
 *
 * The DummyJSON seed left the shop accessory-heavy (lots of watches/bags) and
 * thin on Pants & Bottoms and Outerwear. The H&M Kaggle seeder would fix this
 * but needs an authenticated ~35 MB download we can't ship. So this script adds
 * a curated set of realistic apparel — proper per-garment size charts (reused
 * from garment-to-sizes), recommendation tags, prices, and apparel imagery —
 * to even the categories out. No accessories are added.
 *
 * Idempotent: each product's UUID is derived deterministically (uuidv5) from a
 * stable slug, and insertion uses ignoreDuplicates, so re-running no-ops.
 *
 * Usage:
 *   cd crwn-clothing-be
 *   npx ts-node --project tsconfig.json scripts/seed-apparel-balance.ts
 */

import "dotenv/config";
import { v5 as uuidv5 } from "uuid";
import sequelize from "../src/models/sequelize";
import Product from "../src/models/Product";
import Category from "../src/models/Category";
import "../src/models";
import {
  CATEGORY_IDS,
  trouserSizes,
  bottomSizes,
  jacketSizes,
} from "./garment-to-sizes";

const NAMESPACE = "b1c2d3e4-f5a6-4b7c-8d9e-0a1b2c3d4e5f"; // fixed, RFC-valid

// Small pools of apparel imagery (Unsplash photo IDs). The product card already
// falls back Unsplash → Picsum → SVG, so any of these renders safely.
const PANTS_IMAGES = [
  "1542272604-787c3835535d",
  "1473966968600-fa801b869a1a",
  "1624378439575-d8705ad7ae80",
  "1602293589930-45aad59ba3ab",
  "1473966968600-fa801b869a1a",
];
const OUTERWEAR_IMAGES = [
  "1551028719-00167b16eac5",
  "1591047139829-d91aecb6caea",
  "1544022613-e87ca75a784a",
  "1520975954732-35dd22299614",
  "1539533018447-63fcce2678e3",
];

const img = (pool: string[], i: number) =>
  `https://images.unsplash.com/photo-${pool[i % pool.length]}?auto=format&fit=crop&w=900&q=80`;

type Tmpl = {
  name: string;
  price: number;
  fit: "slim" | "regular" | "relaxed";
  tags: string[];
};

// ---- Pants & Bottoms ----
const PANTS: Tmpl[] = [
  { name: "Slim Tapered Chinos", price: 58, fit: "slim", tags: ["chino", "cotton", "minimalist"] },
  { name: "Relaxed Straight Jeans", price: 72, fit: "relaxed", tags: ["denim", "jean", "casual"] },
  { name: "Pleated Wool Trousers", price: 96, fit: "regular", tags: ["trouser", "wool", "classic"] },
  { name: "Stretch Skinny Jeans", price: 64, fit: "slim", tags: ["denim", "jean", "stretch"] },
  { name: "Cargo Utility Pants", price: 78, fit: "relaxed", tags: ["cargo", "utility", "streetwear"] },
  { name: "Linen Drawstring Trousers", price: 68, fit: "relaxed", tags: ["linen", "trouser", "summer"] },
  { name: "Tailored Suit Trousers", price: 110, fit: "regular", tags: ["trouser", "formal", "classic"] },
  { name: "Corduroy Straight Pants", price: 74, fit: "regular", tags: ["corduroy", "casual", "vintage"] },
  { name: "Performance Jogger Pants", price: 62, fit: "regular", tags: ["jogger", "sporty", "knit"] },
  { name: "High-Rise Mom Jeans", price: 70, fit: "relaxed", tags: ["denim", "jean", "high-rise"] },
  { name: "Tech Twill Commuter Pants", price: 88, fit: "slim", tags: ["twill", "commuter", "minimalist"] },
  { name: "Pleat-Front Pleated Chinos", price: 66, fit: "regular", tags: ["chino", "pleated", "preppy"] },
  { name: "Raw Selvedge Denim", price: 124, fit: "slim", tags: ["denim", "selvedge", "premium"] },
  { name: "Wide-Leg Flare Trousers", price: 82, fit: "relaxed", tags: ["trouser", "wide-leg", "bohemian"] },
  { name: "Brushed Fleece Sweatpants", price: 54, fit: "relaxed", tags: ["sweatpant", "fleece", "sporty"] },
  { name: "Garment-Dyed Work Pants", price: 80, fit: "regular", tags: ["work", "cotton", "rugged"] },
];

// ---- Outerwear ----
const OUTERWEAR: Tmpl[] = [
  { name: "Quilted Bomber Jacket", price: 138, fit: "regular", tags: ["bomber", "quilted", "streetwear"] },
  { name: "Wool Blend Overcoat", price: 198, fit: "regular", tags: ["coat", "wool", "classic"] },
  { name: "Hooded Down Parka", price: 224, fit: "relaxed", tags: ["parka", "down", "winter"] },
  { name: "Classic Denim Trucker Jacket", price: 96, fit: "regular", tags: ["denim", "trucker", "casual"] },
  { name: "Water-Resistant Field Jacket", price: 156, fit: "regular", tags: ["field", "utility", "rugged"] },
  { name: "Leather Moto Jacket", price: 268, fit: "slim", tags: ["leather", "moto", "edgy"] },
  { name: "Lightweight Packable Shell", price: 112, fit: "regular", tags: ["shell", "packable", "sporty"] },
  { name: "Sherpa-Lined Trucker", price: 128, fit: "relaxed", tags: ["sherpa", "denim", "winter"] },
  { name: "Tailored Wool Peacoat", price: 184, fit: "regular", tags: ["peacoat", "wool", "classic"] },
  { name: "Reversible Puffer Vest", price: 88, fit: "regular", tags: ["vest", "puffer", "layering"] },
  { name: "Cropped Varsity Jacket", price: 134, fit: "regular", tags: ["varsity", "wool", "vintage"] },
  { name: "Technical Hardshell Parka", price: 246, fit: "relaxed", tags: ["parka", "technical", "outdoor"] },
  { name: "Corduroy Sherpa Jacket", price: 118, fit: "regular", tags: ["corduroy", "sherpa", "casual"] },
  { name: "Single-Breasted Trench Coat", price: 212, fit: "regular", tags: ["trench", "cotton", "classic"] },
  { name: "Insulated Flannel Overshirt", price: 92, fit: "regular", tags: ["overshirt", "flannel", "layering"] },
  { name: "Softshell Hooded Anorak", price: 142, fit: "regular", tags: ["anorak", "softshell", "outdoor"] },
];

const buildRows = () => {
  const rows: any[] = [];

  PANTS.forEach((t, i) => {
    const slug = `balance:pants:${t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    rows.push({
      id: uuidv5(slug, NAMESPACE),
      name: t.name,
      description: `${t.name} — a ${t.fit}-fit staple in our balanced bottoms range.`,
      price: t.price,
      stock: 40 + ((i * 7) % 60),
      fitType: t.fit,
      recommendationTags: Array.from(new Set(["pants", "bottoms", ...t.tags, t.fit])),
      sizeChartJson: t.tags.includes("trouser") || t.tags.includes("jogger")
        ? trouserSizes
        : bottomSizes,
      imageUrl: img(PANTS_IMAGES, i),
      categoryId: CATEGORY_IDS.pants,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  OUTERWEAR.forEach((t, i) => {
    const slug = `balance:outerwear:${t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    rows.push({
      id: uuidv5(slug, NAMESPACE),
      name: t.name,
      description: `${t.name} — ${t.fit}-fit outerwear built for layering and the cold.`,
      price: t.price,
      stock: 25 + ((i * 5) % 45),
      fitType: t.fit,
      recommendationTags: Array.from(new Set(["outerwear", ...t.tags, t.fit])),
      sizeChartJson: jacketSizes,
      imageUrl: img(OUTERWEAR_IMAGES, i),
      categoryId: CATEGORY_IDS.outerwear,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  return rows;
};

const run = async () => {
  console.log("Connecting to database…");
  await sequelize.authenticate();
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await sequelize.sync({ alter: false });

  // Defensive: ensure the apparel categories exist.
  for (const [slug, id] of Object.entries(CATEGORY_IDS)) {
    if (slug === "accessories") continue;
    await Category.findOrCreate({
      where: { id },
      defaults: {
        id,
        name:
          slug === "shirts"
            ? "Shirts & Tops"
            : slug === "pants"
            ? "Pants & Bottoms"
            : "Outerwear",
        imageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    });
  }

  const rows = buildRows();
  console.log(`Inserting ${rows.length} apparel products (ignoreDuplicates)…`);
  const created = await Product.bulkCreate(rows as any, { ignoreDuplicates: true });
  console.log(`✓ Inserted/skipped ${created.length} rows.`);

  // Report the new per-category counts.
  for (const [slug, id] of Object.entries(CATEGORY_IDS)) {
    const n = await Product.count({ where: { categoryId: id } });
    console.log(`  ${slug.padEnd(12)} ${n}`);
  }
  const total = await Product.count();
  console.log(`Total products now: ${total}`);

  await sequelize.close();
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
