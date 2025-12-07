import express from "express";
import getCategoriesResolver from "../controllers/category/getCategoriesResolver";

const router = express.Router();

router.get("/categories", getCategoriesResolver);

export default router;
