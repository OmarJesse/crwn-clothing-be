import assert from "node:assert/strict";
import {
  assertAllowedBodyProfileKeys,
  parseBodyProfileMeasurements,
  parseLandmarkSummary,
} from "../controllers/user/bodyProfileValidation";
import { inferBodyProfile } from "../services/bodySizing";

const expectThrows = (fn: () => unknown, messageFragment: string) => {
  assert.throws(fn, (error: unknown) => {
    const typedError = error as Error & { statusCode?: number };
    return Boolean(
      typedError &&
        typedError.statusCode === 400 &&
        typeof typedError.message === "string" &&
        typedError.message.includes(messageFragment)
    );
  });
};

const main = () => {
  const measurements = parseBodyProfileMeasurements({
    heightCm: "180",
    weightKg: 78,
    chestCm: "101.5",
  });

  assert.equal(measurements.heightCm, 180);
  assert.equal(measurements.weightKg, 78);
  assert.equal(measurements.chestCm, 101.5);

  const landmarkSummary = parseLandmarkSummary({
    shoulderWidthRatio: 0.24,
    torsoWidthRatio: 0.31,
    confidence: 0.87,
  });

  assert.deepEqual(landmarkSummary, {
    shoulderWidthRatio: 0.24,
    torsoWidthRatio: 0.31,
    confidence: 0.87,
  });

  expectThrows(
    () => assertAllowedBodyProfileKeys({ heightCm: 180, unexpectedField: true }),
    "Unsupported body profile field(s)"
  );

  expectThrows(
    () => parseLandmarkSummary({ confidence: 1.2 }),
    "landmarkSummary.confidence"
  );

  const profile = inferBodyProfile({
    heightCm: 180,
    weightKg: 78,
    preferredFit: "slim",
    landmarkSummary: {
      shoulderWidthRatio: 0.23,
      torsoWidthRatio: 0.3,
      confidence: 0.9,
    },
  });

  assert.equal(profile.recommendationVersion, "vision-mock-v2");
  assert.equal(profile.shoulderCm, 41.4);
  assert.equal(profile.chestCm, 99.9);
  assert.equal(profile.waistCm, 89.1);
  assert.equal(profile.confidence > 0.55, true);

  console.log("Body profile validation checks passed.");
};

main();