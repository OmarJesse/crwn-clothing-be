import { Request, Response, NextFunction } from "express";
import User from "../../models/User";
import { inferBodyProfile } from "../../services/bodySizing";
import {
  assertAllowedBodyProfileKeys,
  parseBodyProfileMeasurements,
  parseLandmarkModel,
  parseLandmarkSummary,
  parsePreferredFit,
  parsePreferredStyles,
  parsePreferredPalettes,
  parseGender,
} from "./bodyProfileValidation";

type AuthenticatedRequest = Request & {
  user?: {
    id?: string;
  };
};

const inferBodyProfileResolver = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const user = await User.findByPk(userId);

    if (!user) {
      throw new Error("User not found");
    }

    assertAllowedBodyProfileKeys(req.body ?? {});
    const measurements = parseBodyProfileMeasurements(req.body ?? {});
    const preferredStyles = parsePreferredStyles(req.body?.preferredStyles);
    const preferredPalettes = parsePreferredPalettes(req.body?.preferredPalettes);
    const profile = inferBodyProfile({
      ...measurements,
      preferredFit: parsePreferredFit(req.body?.preferredFit),
      landmarkSummary: parseLandmarkSummary(req.body?.landmarkSummary),
      landmarkModel: parseLandmarkModel(req.body?.landmarkModel),
      preferredStyles,
      preferredPalettes,
    });
    const onboardingCompletedAt = new Date();

    const gender = parseGender(req.body?.gender, user.gender);

    await user.update({
      ...profile,
      gender,
      landmarkSummary: profile.landmarkSummary ?? null,
      landmarkModel: profile.landmarkModel ?? null,
      preferredStyles: profile.preferredStyles ?? null,
      preferredPalettes: profile.preferredPalettes ?? null,
      onboardingCompletedAt,
    });

    res.status(200).json({
      profile: {
        id: user.id,
        ...profile,
        gender,
        onboardingCompletedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default inferBodyProfileResolver;