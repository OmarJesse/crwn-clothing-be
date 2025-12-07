import { Response, NextFunction } from "express";
import Product from "../../models/Product";

const deleteProductResolver = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Check if product exists
    const product = await Product.findOne({
      where: { id },
    });

    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    // Delete the product
    await Product.destroy({
      where: { id },
    });

    res.status(200).json({
      message: "Product deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export default deleteProductResolver;
