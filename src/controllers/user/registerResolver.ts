import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../../models/User";

const registerResolver = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, email, password } = req.body;
    const allowedGenders = ["male", "female", "unspecified"];
    const gender = allowedGenders.includes(req.body?.gender)
      ? req.body.gender
      : null;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new Error("User already exists");
    }

    // Hash the password. bcrypt is a one-way salted hash (not reversible
    // encryption — the correct, stronger choice for credentials). Cost factor
    // 12 ≈ 4× harder to brute-force than the previous 10; existing 10-round
    // hashes still verify fine via bcrypt.compare.
    const SALT_ROUNDS = 12;
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create a new user
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "user", // Default role
      gender,
    });

    // Generate a token
    const token = jwt.sign(
      {
        userId: newUser.id,
        email: newUser.email,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "1h" }
    );

    const refreshToken = jwt.sign(
      {
        userId: newUser.id,
        email: newUser.email,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      refreshToken,
      onboardingRequired: true,
    });
  }
  catch (error) {
    next(error);
  }
};

export default registerResolver;