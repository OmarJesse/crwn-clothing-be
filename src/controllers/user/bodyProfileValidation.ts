type BadRequestError = Error & {
  statusCode: number;
};

const createBadRequestError = (message: string) => {
  const error = new Error(message) as BadRequestError;
  error.statusCode = 400;
  return error;
};

const BODY_PROFILE_KEYS = new Set([
  "heightCm",
  "weightKg",
  "chestCm",
  "waistCm",
  "hipCm",
  "inseamCm",
  "shoulderCm",
  "preferredFit",
  "landmarkSummary",
  "landmarkModel",
  "preferredStyles",
  "preferredPalettes",
]);

const STYLE_OPTIONS = new Set([
  "minimalist",
  "streetwear",
  "classic",
  "bohemian",
  "sporty",
  "edgy",
  "preppy",
  "vintage",
]);

const PALETTE_OPTIONS = new Set([
  "earth-tones",
  "monochrome",
  "pastels",
  "jewel-tones",
  "warm-neutrals",
  "bold-brights",
  "cool-tones",
  "sunset",
]);

const LANDMARK_SUMMARY_KEYS = new Set([
  "shoulderWidthRatio",
  "torsoWidthRatio",
  "faceAspectRatio",
  "faceWidthRatio",
  "confidence",
]);

export const assertAllowedBodyProfileKeys = (body: Record<string, unknown>) => {
  const unexpectedKeys = Object.keys(body).filter((key) => !BODY_PROFILE_KEYS.has(key));

  if (unexpectedKeys.length > 0) {
    throw createBadRequestError(
      `Unsupported body profile field(s): ${unexpectedKeys.join(", ")}.`
    );
  }
};

const parseNullableNumber = (value: unknown, fieldName: string) => {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw createBadRequestError(`${fieldName} must be a finite number.`);
  }

  return parsedValue;
};

const parseLandmarkNumber = (
  value: unknown,
  fieldName: string,
  min: number,
  max: number
) => {
  if (value === null || typeof value === "undefined" || value === "") {
    return undefined;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < min || parsedValue > max) {
    throw createBadRequestError(
      `${fieldName} must be a finite number between ${min} and ${max}.`
    );
  }

  return parsedValue;
};

export const parseBodyProfileMeasurements = (body: Record<string, unknown>) => ({
  heightCm: parseNullableNumber(body.heightCm, "heightCm"),
  weightKg: parseNullableNumber(body.weightKg, "weightKg"),
  chestCm: parseNullableNumber(body.chestCm, "chestCm"),
  waistCm: parseNullableNumber(body.waistCm, "waistCm"),
  hipCm: parseNullableNumber(body.hipCm, "hipCm"),
  inseamCm: parseNullableNumber(body.inseamCm, "inseamCm"),
  shoulderCm: parseNullableNumber(body.shoulderCm, "shoulderCm"),
});

export const parseLandmarkSummary = (summary: unknown) => {
  if (summary === null || typeof summary === "undefined") {
    return null;
  }

  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw createBadRequestError("landmarkSummary must be an object when provided.");
  }

  const typedSummary = summary as Record<string, unknown>;
  const unexpectedKeys = Object.keys(typedSummary).filter(
    (key) => !LANDMARK_SUMMARY_KEYS.has(key)
  );

  if (unexpectedKeys.length > 0) {
    throw createBadRequestError(
      `Unsupported landmarkSummary field(s): ${unexpectedKeys.join(", ")}.`
    );
  }

  const parsedSummary = {
    shoulderWidthRatio: parseLandmarkNumber(
      typedSummary.shoulderWidthRatio,
      "landmarkSummary.shoulderWidthRatio",
      0.12,
      0.45
    ),
    torsoWidthRatio: parseLandmarkNumber(
      typedSummary.torsoWidthRatio,
      "landmarkSummary.torsoWidthRatio",
      0.12,
      0.6
    ),
    faceAspectRatio: parseLandmarkNumber(
      typedSummary.faceAspectRatio,
      "landmarkSummary.faceAspectRatio",
      0.6,
      2.8
    ),
    faceWidthRatio: parseLandmarkNumber(
      typedSummary.faceWidthRatio,
      "landmarkSummary.faceWidthRatio",
      0.15,
      0.7
    ),
    confidence: parseLandmarkNumber(
      typedSummary.confidence,
      "landmarkSummary.confidence",
      0,
      1
    ),
  };

  if (Object.values(parsedSummary).every((value) => typeof value === "undefined")) {
    return null;
  }

  return parsedSummary;
};

export const parsePreferredFit = (preferredFit: unknown, fallback: string | null = null) => {
  if (preferredFit === null || typeof preferredFit === "undefined" || preferredFit === "") {
    return fallback;
  }

  if (typeof preferredFit !== "string") {
    throw createBadRequestError("preferredFit must be a string when provided.");
  }

  return preferredFit;
};

export const parseLandmarkModel = (landmarkModel: unknown, fallback: string | null = null) => {
  if (landmarkModel === null || typeof landmarkModel === "undefined" || landmarkModel === "") {
    return fallback;
  }

  if (typeof landmarkModel !== "string") {
    throw createBadRequestError("landmarkModel must be a string when provided.");
  }

  return landmarkModel;
};

const parseStringArrayWithAllowlist = (
  value: unknown,
  fieldName: string,
  allowed: Set<string>
): string[] | null => {
  if (value === null || typeof value === "undefined") return null;
  if (!Array.isArray(value)) {
    throw createBadRequestError(`${fieldName} must be an array of strings when provided.`);
  }
  const cleaned: string[] = [];
  value.forEach((item) => {
    if (typeof item !== "string") {
      throw createBadRequestError(`${fieldName} must contain only strings.`);
    }
    if (!allowed.has(item)) {
      throw createBadRequestError(`${fieldName} contains an unsupported value: ${item}.`);
    }
    if (!cleaned.includes(item)) cleaned.push(item);
  });
  return cleaned.length > 0 ? cleaned : null;
};

export const parsePreferredStyles = (value: unknown) =>
  parseStringArrayWithAllowlist(value, "preferredStyles", STYLE_OPTIONS);

export const parsePreferredPalettes = (value: unknown) =>
  parseStringArrayWithAllowlist(value, "preferredPalettes", PALETTE_OPTIONS);
