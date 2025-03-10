import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/jwt";

// Define the user interface to match the expected JWT payload
interface JwtPayload {
  userId: string;
  userType?: string; // Optional, based on your JWT structure
}

// Extend Request type for type safety
interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  console.log("Auth Header:", authHeader); // Debug: Log the header
  console.log("Token:", token); // Debug: Log the extracted token

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log("Token verification error:", err.message); // Debug: Log verification error
      return res.status(403).json({ message: "Invalid token" });
    }
    console.log("Decoded token payload:", user); // Debug: Log decoded payload
    req.user = user as JwtPayload; // Type-safe assignment
    next();
  });
};
