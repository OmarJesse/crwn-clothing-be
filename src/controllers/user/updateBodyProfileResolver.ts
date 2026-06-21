import { Request, Response, NextFunction } from "express";
import User from "../../models/User";
import { inferBodyProfile } from "../../services/bodySizing";
import {
  assertAllowedBodyProfileKeys,
  parseBodyProfileMeasurements,
  parseLandmarkModel,
  parseLandmarkSummary,
  parsePreferredFit,
  parseGender,
} from "./bodyProfileValidation";

type AuthenticatedRequest = Request & {
  user?: {
    id?: string;
  };
};

const updateBodyProfileResolver = async (
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
    const profile = inferBodyProfile({
      ...measurements,
      preferredFit: parsePreferredFit(req.body?.preferredFit, user.preferredFit),
      landmarkSummary: parseLandmarkSummary(req.body?.landmarkSummary) ?? user.landmarkSummary,
      landmarkModel: parseLandmarkModel(req.body?.landmarkModel, user.landmarkModel),
    });
    const onboardingCompletedAt = user.onboardingCompletedAt ?? new Date();
    const gender = parseGender(req.body?.gender, user.gender);

    await user.update({
      ...profile,
      gender,
      landmarkSummary: profile.landmarkSummary ?? user.landmarkSummary,
      landmarkModel: profile.landmarkModel ?? user.landmarkModel,
      onboardingCompletedAt,
    });

    res.status(200).json({
      profile: {
        id: user.id,
        gender,
        ...profile,
        onboardingCompletedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default updateBodyProfileResolver;