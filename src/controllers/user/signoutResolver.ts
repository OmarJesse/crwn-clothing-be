import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../../models/User";

const signoutResolver = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Invalidate the token by removing it from the client side
    res.clearCookie("token");
    res.clearCookie("refreshToken");

    res.status(200).json({
      message: "Successfully signed out",
    });
  } catch (error) {
    next(error);
  }
};

export default signoutResolver;
