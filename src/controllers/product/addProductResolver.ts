import { Response, NextFunction } from "express";
import Category from "../../models/Category";
import Product from "../../models/Product";

const addProductResolver = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, description, price, categoryId, stock, imageUrl } = req.body;

    // Check if category exists
    const category = await Category.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      res.status(404).json({ message: "Category not found" });
      return;
    }

    // Create a new product
    const newProduct = await Product.create({
      name,
      description,
      price,
      stock,
      imageUrl,
      categoryId,
    });

    res.status(201).json({
      message: "Product added successfully",
      product: newProduct,
    });
  } catch (error) {
    next(error);
  }
};

export default addProductResolver;
