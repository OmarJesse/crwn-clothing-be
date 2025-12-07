import addProductResolver from "../controllers/product/addProductResolver";
import getProductsByCategoryIdResolver from "../controllers/product/getProductsByCategoryIdResolver";
import express from "express";
import authMiddleware from "../middlewares/authMiddleware";
import adminMiddleware from "../middlewares/adminMiddleware";
import editProductResolver from "../controllers/product/editProductResolver";
import deleteProductResolver from "../controllers/product/deleteProductResolver";
import getProductByIdResolver from "../controllers/product/getProductByIdResolver";

const router = express.Router();

// products by categoryId param
router.get("/products/:categoryId", getProductsByCategoryIdResolver);
router.get("/products/product/:id", authMiddleware, getProductByIdResolver);
router.put(
  "/products/add",
  authMiddleware,
  adminMiddleware,
  addProductResolver
);
router.post(
  "/products/edit",
  authMiddleware,
  adminMiddleware,
  editProductResolver
);
router.delete(
  "/products/:id",
  authMiddleware,
  adminMiddleware,
  deleteProductResolver
);

export default router;
