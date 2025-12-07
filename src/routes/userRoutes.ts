import express, { Request, Response, NextFunction } from "express";
import loginResolver from "../controllers/user/loginResolver";
import authMiddleware from "../middlewares/authMiddleware";
import meResolver from "../controllers/user/meResolver";
import registerResolver from "../controllers/user/registerResolver";
import signoutResolver from "../controllers/user/signoutResolver";

const router = express.Router();

// POST /users route
router.post("/login", loginResolver);
router.post("/register", registerResolver);
router.get("/me", authMiddleware, meResolver);
router.post("/signout", authMiddleware, signoutResolver);

export default router;
