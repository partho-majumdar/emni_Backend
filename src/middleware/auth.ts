// import { Request, Response, NextFunction } from "express";
// import jwt from "jsonwebtoken";
// import { JWT_SECRET } from "../config/jwt";

// // Define the user interface to match the expected JWT payload
// interface JwtPayload {
//   user_id: string;
//   user_type?: string;
// }

// // Extend Request type for type safety
// interface AuthenticatedRequest extends Request {
//   user?: JwtPayload;
// }

// export const authenticateToken = (
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ) => {
//   const authHeader = req.headers["authorization"];
//   const token = authHeader && authHeader.split(" ")[1];

//   console.log("Auth Header:", authHeader);
//   console.log("Token:", token);

//   if (!token) {
//     return res.status(401).json({ message: "No token provided" });
//   }

//   jwt.verify(token, JWT_SECRET, (err, user) => {
//     if (err) {
//       console.log("Token verification error:", err.message);
//       return res.status(403).json({ message: "Invalid token" });
//     }
//     console.log("Decoded token payload:", user);
//     req.user = user as JwtPayload;
//     next();
//   });
// };

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/jwt";

// Define the user interface to match the expected JWT payload
interface JwtPayload {
  user_id: string;
  user_type: string; // Changed to string to handle case variations
}

// Extend Request type for type safety
interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// Base authentication middleware
export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log("Token verification error:", err.message);
      return res.status(403).json({ message: "Invalid token" });
    }

    const payload = user as JwtPayload;
    if (!payload.user_type) {
      return res
        .status(403)
        .json({ message: "Invalid token: missing user type" });
    }

    // Normalize user_type to lowercase for consistency
    payload.user_type = payload.user_type.toLowerCase();
    req.user = payload;
    next();
  });
};

// Helper function for role checking
const checkRole = (
  req: AuthenticatedRequest,
  allowedRoles: string[],
  errorMessage: string
): boolean => {
  if (!req.user) return false;

  const userType = req.user.user_type.toLowerCase();
  return allowedRoles.includes(userType);
};

// Role-specific middlewares
export const requireStudent = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!checkRole(req, ["student"], "This API is for students only")) {
    return res.status(403).json({
      message: "This API is for students only",
      receivedType: req.user?.user_type,
    });
  }
  next();
};

export const requireMentor = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!checkRole(req, ["mentor"], "This API is for mentors only")) {
    return res.status(403).json({
      message: "This API is for mentors only",
      receivedType: req.user?.user_type,
    });
  }
  next();
};

export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!checkRole(req, ["admin"], "This API is for admins only")) {
    return res.status(403).json({
      message: "This API is for admins only",
      receivedType: req.user?.user_type,
    });
  }
  next();
};

// Combined role middlewares
export const requireMentorOrStudent = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (
    !checkRole(
      req,
      ["mentor", "student"],
      "This API is for mentors and students only"
    )
  ) {
    return res.status(403).json({
      message: "This API is for mentors and students only",
      receivedType: req.user?.user_type,
    });
  }
  next();
};

export const requireMentorOrAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (
    !checkRole(
      req,
      ["mentor", "admin"],
      "This API is for mentors and admins only"
    )
  ) {
    return res.status(403).json({
      message: "This API is for mentors and admins only",
      receivedType: req.user?.user_type,
    });
  }
  next();
};

export const requireStudentOrAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (
    !checkRole(
      req,
      ["student", "admin"],
      "This API is for students and admins only"
    )
  ) {
    return res.status(403).json({
      message: "This API is for students and admins only",
      receivedType: req.user?.user_type,
    });
  }
  next();
};

export const requireAnyAuthenticated = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(403).json({ message: "Authentication required" });
  }
  next();
};
