import express, { Request, Response, NextFunction } from "express";
import loginResolver from "../controllers/user/loginResolver";
import authMiddleware from "../middlewares/authMiddleware";
import meResolver from "../controllers/user/meResolver";
import registerResolver from "../controllers/user/registerResolver";
import signoutResolver from "../controllers/user/signoutResolver";
import inferBodyProfileResolver from "../controllers/user/inferBodyProfileResolver";
import updateBodyProfileResolver from "../controllers/user/updateBodyProfileResolver";

const router = express.Router();

// POST /users route
router.post("/login", loginResolver);
router.post("/register", registerResolver);
router.get("/me", authMiddleware, meResolver);
router.get("/me/body-profile", authMiddleware, meResolver);
router.post("/me/onboarding/infer", authMiddleware, inferBodyProfileResolver);
router.put("/me/body-profile", authMiddleware, updateBodyProfileResolver);
router.post("/signout", authMiddleware, signoutResolver);

export default router;
