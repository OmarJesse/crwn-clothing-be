import { Response, NextFunction } from "express";
import User from "../../models/User";

const meResolver = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req?.user?.id;
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error("User not found");
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (error) {
    next(error);
  }
};

export default meResolver;
