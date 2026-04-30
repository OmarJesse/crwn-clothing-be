import { Response, NextFunction } from "express";
import Category from "../../models/Category";
import Product from "../../models/Product";
import User from "../../models/User";
import { inferBodyProfile, normalizeSizeChart, recommendProductSize } from "../../services/bodySizing";

const getProductByIdResolver = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Check if product exists
    const product = await Product.findOne({
      where: { id },
      include: [
        {
          model: Category,
          as: "category",
        },
      ],
    });

    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    const userId = req?.user?.id;
    const user = userId ? await User.findByPk(userId) : null;
    const hasBodyProfile = Boolean(user?.onboardingCompletedAt || user?.heightCm || user?.weightKg);
    const recommendation = hasBodyProfile
      ? recommendProductSize(product, inferBodyProfile({
          heightCm: user?.heightCm,
          weightKg: user?.weightKg,
          chestCm: user?.chestCm,
          waistCm: user?.waistCm,
          hipCm: user?.hipCm,
          inseamCm: user?.inseamCm,
          shoulderCm: user?.shoulderCm,
          preferredFit: user?.preferredFit,
        }))
      : {
          recommendedSize: null,
          alternates: [],
          confidence: 0,
          explanation: "Complete your body profile to see a recommended size.",
        };

    res.status(200).json({
      product,
      sizeChart: normalizeSizeChart(product.sizeChartJson),
      recommendation,
    });
  } catch (error) {
    next(error);
  }
};

export default getProductByIdResolver;
