import { Response, NextFunction } from "express";
import User from "../../models/User";

const meResolver = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req?.user?.id;
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error("User not found");
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      heightCm: user.heightCm,
      weightKg: user.weightKg,
      bmi: user.bmi,
      chestCm: user.chestCm,
      waistCm: user.waistCm,
      hipCm: user.hipCm,
      inseamCm: user.inseamCm,
      shoulderCm: user.shoulderCm,
      preferredFit: user.preferredFit,
      bodyShape: user.bodyShape,
      onboardingCompletedAt: user.onboardingCompletedAt,
      recommendationVersion: user.recommendationVersion,
      landmarkSummary: user.landmarkSummary,
      landmarkModel: user.landmarkModel,
    });
  } catch (error) {
    next(error);
  }
};

export default meResolver;
