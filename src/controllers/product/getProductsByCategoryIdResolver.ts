import { Response, NextFunction } from "express";
import Category from "../../models/Category";
import Product from "../../models/Product";

const getProductsByCategoryIdResolver = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const { categoryId } = req.params;

    // Check if category exists
    const category = await Category.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      res.status(404).json({ message: "Category not found" });
      return;
    }

    // Fetch products by category ID
    const products = await Product.findAll({
      where: { categoryId },
    });

    if (!products || products.length === 0) {
      res.status(404).json({ message: "No products found in this category" });
      return;
    }

    res.status(200).json({
      products,
      category,
    });
  } catch (error) {
    next(error);
  }
};

export default getProductsByCategoryIdResolver;
