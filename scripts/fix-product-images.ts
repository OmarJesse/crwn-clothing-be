/**
 * Replace broken H&M CDN image URLs with real, category-appropriate Unsplash
 * apparel photography. The H&M dataset's image paths 302-redirect (hot-link
 * protection), so those product cards render empty. We can't ship the H&M
 * sample images, so we map each product to a stable clothing photo by category.
 *
 * Targets any product whose imageUrl points at image.hm.com (or is empty).
 * Deterministic: the chosen photo is a function of the product id, so re-runs
 * are stable.
 *
 * Usage:
 *   cd crwn-clothing-be
 *   npx ts-node --project tsconfig.json scripts/fix-product-images.ts
 */

import "dotenv/config";
import { Op } from "sequelize";
import sequelize from "../src/models/sequelize";
import "../src/models";
import Product from "../src/models/Product";
import { CATEGORY_IDS } from "./garment-to-sizes";

const unsplash = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=80`;

// Curated Unsplash apparel photo IDs per storefront category.
const POOLS: Record<string, string[]> = {
  [CATEGORY_IDS.shirts]: [
    "1521572163474-6864f9cf17ab", "1576566588028-4147f3842f27",
    "1583743814966-8936f5b7be1a", "1622445275576-721325763afe",
    "1618354691373-d851c5c3a990", "1503341504253-dff4815485f1",
    "1581655353564-df123a1eb820", "1620799140408-edc6dcb6d633",
  ],
  [CATEGORY_IDS.pants]: [
    "1542272604-787c3835535d", "1473966968600-fa801b869a1a",
    "1624378439575-d8705ad7ae80", "1602293589930-45aad59ba3ab",
    "1551854838-212c50b4c184", "1594633312681-425c7b97ccd1",
  ],
  [CATEGORY_IDS.outerwear]: [
    "1551028719-00167b16eac5", "1591047139829-d91aecb6caea",
    "1544022613-e87ca75a784a", "1520975954732-35dd22299614",
    "1539533018447-63fcce2678e3", "1551537482-f2075a1d41f2",
  ],
  [CATEGORY_IDS.accessories]: [
    "1523275335684-37898b6baf30", "1611085583191-a3b181a88401",
    "1572635196237-14b3f281503f", "1508296695146-257a814070b4",
    "1553062407-98eeb64c6a62", "1611923134239-b9be5816e23c",
  ],
};

const FALLBACK = POOLS[CATEGORY_IDS.shirts];

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const run = async () => {
  console.log("Connecting…");
  await sequelize.authenticate();

  const products = (await Product.findAll({
    attributes: ["id", "categoryId", "imageUrl"],
    where: {
      [Op.or]: [
        { imageUrl: { [Op.iLike]: "%image.hm.com%" } },
        { imageUrl: null },
        { imageUrl: "" },
      ],
    },
    raw: true,
  })) as any[];

  console.log(`Re-imaging ${products.length} products with broken/missing URLs…`);
  let updated = 0;
  for (const p of products) {
    const pool = POOLS[p.categoryId] || FALLBACK;
    const url = unsplash(pool[hash(p.id) % pool.length]);
    await Product.update({ imageUrl: url }, { where: { id: p.id } });
    updated += 1;
  }

  console.log(`✓ Updated ${updated} product images.`);
  const remaining = await Product.count({
    where: { imageUrl: { [Op.iLike]: "%image.hm.com%" } },
  });
  console.log(`Remaining image.hm.com URLs: ${remaining}`);

  await sequelize.close();
};

run().catch((err) => {
  console.error("Image fix failed:", err);
  process.exit(1);
});
