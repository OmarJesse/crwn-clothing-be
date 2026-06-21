/**
 * Adds the `gender` column to `users` and `products` (idempotent), then
 * backfills both from data we already have:
 *
 *  - users.gender    ← the seeded ANSUR emails encode sex (`ansur.m.…` /
 *                       `ansur.f.…`). Real users stay NULL until they pick one.
 *  - products.gender ← for H&M-sourced products, the article's
 *                       `index_group_name` (Ladieswear → women, Menswear → men,
 *                       …); everything else gets a name/tag heuristic, default
 *                       `unisex`.
 *
 * Usage:
 *   cd crwn-clothing-be
 *   npx ts-node --project tsconfig.json scripts/migrate-add-gender.ts
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { v5 as uuidv5 } from "uuid";
import { parse } from "csv-parse";
import sequelize from "../src/models/sequelize";
import "../src/models";
import Product from "../src/models/Product";
import User from "../src/models/User";

// Same namespace the H&M seeder uses to derive deterministic product ids.
const HM_NAMESPACE = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"; // matches seed-from-hm-kaggle.ts
const CSV_PATH = path.resolve(__dirname, "data", "articles.csv");

const indexGroupToGender = (g: string): "men" | "women" | "unisex" => {
  const s = (g || "").toLowerCase();
  if (s.includes("ladies") || s.includes("women")) return "women";
  if (s.includes("men")) return "men"; // "Menswear" (note: "Ladieswear" handled above)
  return "unisex"; // Divided, Sport, Baby/Children, etc.
};

const heuristicGender = (name: string, tags: string[]): "men" | "women" | "unisex" => {
  const hay = `${name} ${tags.join(" ")}`.toLowerCase();
  if (/\b(women|woman|ladies|dress|blouse|skirt|bra|leggings|female)\b/.test(hay)) return "women";
  if (/\b(men|man|mens|male)\b/.test(hay)) return "men";
  return "unisex";
};

const run = async () => {
  console.log("Connecting to database…");
  await sequelize.authenticate();

  // 1. Add columns (idempotent).
  console.log("Adding columns if missing…");
  await sequelize.query(
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" VARCHAR(255)`
  );
  await sequelize.query(
    `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "gender" VARCHAR(255) DEFAULT 'unisex'`
  );

  // 2. Backfill users from ANSUR seed emails.
  const [mRes] = await sequelize.query(
    `UPDATE "users" SET "gender" = 'male'   WHERE "email" LIKE 'ansur.m.%@ansur.local' AND ("gender" IS NULL OR "gender" = '')`
  );
  const [fRes] = await sequelize.query(
    `UPDATE "users" SET "gender" = 'female' WHERE "email" LIKE 'ansur.f.%@ansur.local' AND ("gender" IS NULL OR "gender" = '')`
  );
  console.log("Backfilled ANSUR user genders (male/female) from seed emails.");

  // 3. Build the H&M article_id → gender map from the CSV (if present).
  const hmGenderById = new Map<string, "men" | "women" | "unisex">();
  if (fs.existsSync(CSV_PATH)) {
    console.log("Reading H&M index_group_name from articles.csv…");
    await new Promise<void>((resolve, reject) => {
      const parser = parse({ columns: true, skip_empty_lines: true, relax_quotes: true });
      parser.on("data", (row: Record<string, string>) => {
        if (row.article_id) {
          const id = uuidv5(`hm:${row.article_id}`, HM_NAMESPACE);
          hmGenderById.set(id, indexGroupToGender(row.index_group_name));
        }
      });
      parser.on("end", () => resolve());
      parser.on("error", reject);
      fs.createReadStream(CSV_PATH).pipe(parser);
    });
    console.log(`  mapped ${hmGenderById.size} H&M articles.`);
  } else {
    console.log("articles.csv not present — skipping H&M-specific mapping.");
  }

  // 4. Backfill products. H&M matches by id; the rest use the heuristic.
  const products = await Product.findAll({
    attributes: ["id", "name", "recommendationTags", "gender"],
    raw: true,
  });
  let hmMatched = 0;
  let heuristic = 0;
  for (const p of products as any[]) {
    const hm = hmGenderById.get(p.id);
    const gender = hm ?? heuristicGender(p.name || "", p.recommendationTags || []);
    if (hm) hmMatched += 1;
    else heuristic += 1;
    await Product.update({ gender }, { where: { id: p.id } });
  }
  console.log(`Backfilled product gender: ${hmMatched} from H&M, ${heuristic} heuristic.`);

  // 5. Report.
  const [rows] = await sequelize.query(
    `SELECT "gender", COUNT(*)::int AS n FROM "products" GROUP BY "gender" ORDER BY n DESC`
  );
  console.log("Product gender distribution:", rows);
  const [urows] = await sequelize.query(
    `SELECT "gender", COUNT(*)::int AS n FROM "users" GROUP BY "gender" ORDER BY n DESC`
  );
  console.log("User gender distribution:", urows);

  await sequelize.close();
  console.log("✓ Done.");
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
