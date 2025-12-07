import { Response, NextFunction } from "express";
import Category from "../../models/Category";
import Product from "../../models/Product";

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

    res.status(200).json({
      product,
    });
  } catch (error) {
    next(error);
  }
};

export default getProductByIdResolver;
