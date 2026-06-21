import express from "express";
import authMiddleware from "../middlewares/authMiddleware";
import {
  populationInsightsResolver,
  personalInsightsResolver,
} from "../controllers/insights/insightsController";

const router = express.Router();

// Public population analytics (powers the landing "Fit Insights" panel).
router.get("/insights/population", populationInsightsResolver);
// Personalised positioning for the signed-in shopper.
router.get("/insights/me", authMiddleware, personalInsightsResolver);

export default router;
