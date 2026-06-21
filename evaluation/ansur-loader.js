// ESM loader for the real ANSUR II anthropometric survey, for the evaluation
// harness. Mirrors crwn-clothing-be/scripts/ansur-loader.ts: converts the raw
// CSV (mm, and deci-kg for weight) into the cm/kg fields the classifier uses.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MM_TO_CM = 10;

const FIELD_MAP = {
  heightCm: "stature",
  weightKg: "weightkg", // deci-kg → kg (same /10)
  chestCm: "chestcircumference",
  waistCm: "waistcircumference",
  hipCm: "buttockcircumference",
  inseamCm: "crotchheight",
  shoulderCm: "biacromialbreadth",
};

const round1 = (n) => Math.round(n * 10) / 10;

export const resolveAnsurDir = (explicit) => {
  const candidates = [
    explicit,
    process.env.ANSUR_DIR,
    resolve(__dirname, "..", "datasets", "ansur2"),
    resolve(__dirname, "..", "..", "datasets", "ansur2"),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (
      existsSync(join(dir, "ANSUR_II_MALE.csv")) ||
      existsSync(join(dir, "ANSUR_II_FEMALE.csv"))
    ) {
      return dir;
    }
  }
  throw new Error(
    `Could not locate ANSUR II CSVs. Looked in:\n  ${candidates.join("\n  ")}`
  );
};

const parseCsv = (path) => {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    header.forEach((k, i) => (row[k] = (cols[i] ?? "").trim()));
    return row;
  });
};

const rowToPerson = (row, sex) => {
  const subjectId = row["subjectid"];
  if (!subjectId) return null;
  const out = { subjectId, sex };
  for (const [field, col] of Object.entries(FIELD_MAP)) {
    const raw = Number(row[col]);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    out[field] = round1(raw / MM_TO_CM);
  }
  return out;
};

export const loadAnsurPeople = ({ dir } = {}) => {
  const base = resolveAnsurDir(dir);
  const read = (file, sex) => {
    const full = join(base, file);
    if (!existsSync(full)) return [];
    return parseCsv(full)
      .map((r) => rowToPerson(r, sex))
      .filter(Boolean);
  };
  const males = read("ANSUR_II_MALE.csv", "male");
  const females = read("ANSUR_II_FEMALE.csv", "female");
  const out = [];
  const max = Math.max(males.length, females.length);
  for (let i = 0; i < max; i++) {
    if (i < males.length) out.push(males[i]);
    if (i < females.length) out.push(females[i]);
  }
  return out;
};
