/**
 * Loader for the ANSUR II anthropometric survey (US Army 2012).
 *
 * Source files (public release):
 *   ANSUR_II_MALE.csv   — 4,082 men,   93 body measurements each
 *   ANSUR_II_FEMALE.csv — 1,986 women, 93 body measurements each
 *
 * Units in the raw CSV: every dimension is in MILLIMETRES except `weightkg`,
 * which is stored in DECI-KILOGRAMS (e.g. 815 → 81.5 kg). This loader converts
 * everything into the cm / kg units our `users` fit-profile schema uses.
 *
 * The map below pairs ANSUR column → our schema field:
 *   stature              → heightCm
 *   chestcircumference   → chestCm
 *   waistcircumference   → waistCm
 *   buttockcircumference → hipCm        (garment "hip" girth)
 *   crotchheight         → inseamCm     (inside-leg length proxy)
 *   biacromialbreadth    → shoulderCm   (shoulder breadth)
 *   weightkg / 10        → weightKg
 *
 * No external CSV dependency: the public ANSUR files contain no quoted fields
 * or embedded commas, so a plain split is correct and verified against the
 * header column count.
 */

import fs from "fs";
import path from "path";

export type AnsurPerson = {
  subjectId: string;
  sex: "male" | "female";
  heightCm: number;
  weightKg: number;
  chestCm: number;
  waistCm: number;
  hipCm: number;
  inseamCm: number;
  shoulderCm: number;
};

// ANSUR column name → conversion. All `mm` columns divide by 10; weightkg too
// (it is deci-kg in the public release).
const MM_TO_CM = 10;

const FIELD_MAP: Record<keyof Omit<AnsurPerson, "subjectId" | "sex">, string> = {
  heightCm: "stature",
  weightKg: "weightkg", // deci-kg → kg, also /10
  chestCm: "chestcircumference",
  waistCm: "waistcircumference",
  hipCm: "buttockcircumference",
  inseamCm: "crotchheight",
  shoulderCm: "biacromialbreadth",
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Resolve the directory that holds the ANSUR CSVs. Checks (in order):
 *   1. an explicit dir argument / ANSUR_DIR env var
 *   2. <repo>/datasets/ansur2
 *   3. <repo>/../datasets/ansur2   (the monorepo layout: uni/datasets/ansur2)
 */
export const resolveAnsurDir = (explicit?: string): string => {
  const candidates = [
    explicit,
    process.env.ANSUR_DIR,
    path.resolve(__dirname, "..", "datasets", "ansur2"),
    path.resolve(__dirname, "..", "..", "datasets", "ansur2"),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, "ANSUR_II_MALE.csv")) ||
      fs.existsSync(path.join(dir, "ANSUR_II_FEMALE.csv"))
    ) {
      return dir;
    }
  }

  throw new Error(
    `Could not locate ANSUR II CSVs. Looked in:\n  ${candidates.join(
      "\n  "
    )}\nSet ANSUR_DIR or pass a directory explicitly.`
  );
};

const parseCsv = (filePath: string): Record<string, string>[] => {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  // The MALE file headers `subjectid` lowercase; FEMALE uses `SubjectId`.
  // Normalise header keys to lowercase so lookups are case-insensitive.
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      row[key] = (cols[i] ?? "").trim();
    });
    return row;
  });
};

const rowToPerson = (
  row: Record<string, string>,
  sex: "male" | "female"
): AnsurPerson | null => {
  const subjectId = row["subjectid"];
  if (!subjectId) return null;

  const out: Partial<AnsurPerson> = { subjectId, sex };

  for (const [field, col] of Object.entries(FIELD_MAP)) {
    const raw = Number(row[col]);
    if (!Number.isFinite(raw) || raw <= 0) return null; // skip incomplete rows
    out[field as keyof typeof FIELD_MAP] = round1(raw / MM_TO_CM);
  }

  return out as AnsurPerson;
};

export type LoadOptions = {
  dir?: string;
  /** Cap rows per sex file (after shuffling is NOT applied — file order). */
  limitPerSex?: number;
};

/**
 * Load and normalise the ANSUR II population into our cm/kg schema.
 * Returns interleaved male+female records so a downstream `--limit` slice
 * stays roughly balanced by sex.
 */
export const loadAnsurPeople = (opts: LoadOptions = {}): AnsurPerson[] => {
  const dir = resolveAnsurDir(opts.dir);
  const cap = opts.limitPerSex ?? Infinity;

  const read = (file: string, sex: "male" | "female"): AnsurPerson[] => {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) return [];
    const people = parseCsv(full)
      .map((r) => rowToPerson(r, sex))
      .filter((p): p is AnsurPerson => p !== null);
    return people.slice(0, cap);
  };

  const males = read("ANSUR_II_MALE.csv", "male");
  const females = read("ANSUR_II_FEMALE.csv", "female");

  // Interleave so any prefix slice keeps both sexes represented.
  const out: AnsurPerson[] = [];
  const max = Math.max(males.length, females.length);
  for (let i = 0; i < max; i++) {
    if (i < males.length) out.push(males[i]);
    if (i < females.length) out.push(females[i]);
  }
  return out;
};
