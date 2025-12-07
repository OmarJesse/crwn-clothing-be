import { Response, NextFunction } from "express";
import User from "../models/User";

const adminMiddleware = async (req: any, res: Response, next: NextFunction) => {
  const userId = req.user.id; // Get user ID from request object

  const user = await User.findOne({
    where: { id: userId },
  });

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  if (user.role !== "admin") {
    res.status(403).json({ message: "Access denied" });
    return;
  }

  next(); // Move to the next middleware/route handler
};

export default adminMiddleware;
