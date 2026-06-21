import { Request, Response, NextFunction } from "express";
import User from "../../models/User";
import { getPublicPopulation, getPersonalInsights } from "../../services/insights";

/** GET /insights/population — public aggregate analytics over the body population. */
export const populationInsightsResolver = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    res.json(await getPublicPopulation());
  } catch (error) {
    next(error);
  }
};

/** GET /insights/me — where the authenticated shopper sits in the population. */
export const personalInsightsResolver = async (
  req: Request & { user?: { id?: string } },
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await User.findByPk(req.user?.id);
    if (!user) {
      throw new Error("User not found");
    }
    const insights = await getPersonalInsights({
      id: user.id,
      bodyShape: user.bodyShape,
      heightCm: user.heightCm,
      weightKg: user.weightKg,
      chestCm: user.chestCm,
      waistCm: user.waistCm,
      hipCm: user.hipCm,
      inseamCm: user.inseamCm,
      shoulderCm: user.shoulderCm,
    });
    res.json(insights);
  } catch (error) {
    next(error);
  }
};
