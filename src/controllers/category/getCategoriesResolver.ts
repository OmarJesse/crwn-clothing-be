import { Response, NextFunction } from "express";
import Category from "../../models/Category";
import Product from "../../models/Product";

const getCategoriesResolver = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const categories = await Category.findAll({
      include: [
        {
          model: Product,
          as: "products",
          limit: 5,
          required: false,
        },
      ],
    });
    if (!categories) {
      res.status(404).json({ message: "No categories found" });
      return;
    }
    res.status(200).json({
      categories,
    });
  } catch (error) {
    next(error);
  }
};

export default getCategoriesResolver;
