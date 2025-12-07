import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Authentication middleware to protect private routes
const authMiddleware = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers["authorization"]?.split(" ")[1]; // Bearer token

  if (!token) {
    throw new Error("No token provided");
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET as string,
    async (err: any, decoded: any) => {
      if (err) {
        return res.status(403).json({ message: "Invalid token" });
      }
      req.user = {}; // Initialize user object
      req.user.id = decoded.userId; // Attach user to request object
      next(); // Move to the next middleware/route handler
    }
  );
};

export default authMiddleware;
