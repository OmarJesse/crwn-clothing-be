import { Response, NextFunction } from "express";
import Category from "../../models/Category";
import Product from "../../models/Product";

const editProductResolver = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id, name, description, price, categoryId, stock, imageUrl } =
      req.body;

    // Check if product exists
    const product = await Product.findOne({
      where: { id },
    });

    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    // Check if category exists
    const category = await Category.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      res.status(404).json({ message: "Category not found" });
      return;
    }

    // Update the product
    await Product.update(
      {
        name,
        description,
        price,
        stock,
        imageUrl,
        categoryId,
      },
      {
        where: { id },
      }
    );

    res.status(200).json({
      message: "Product updated successfully",
    });
  } catch (error) {
    next(error);
  }
};
export default editProductResolver;
