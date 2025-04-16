// import { Request, Response, NextFunction } from "express";
// import jwt from "jsonwebtoken";
// import { JWT_SECRET } from "../config/jwt";

// // Define the user interface to match the expected JWT payload
// interface JwtPayload {
//   user_id: string;
//   user_type: string;
//   email?: string;
// }

// // Extend Request type for type safety
// interface AuthenticatedRequest extends Request {
//   user?: JwtPayload;
// }

// // Base authentication middleware
// export const authenticateToken = async (
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ) => {
//   const authHeader = req.headers["authorization"];
//   console.log("Auth Header:", authHeader);
//   const token = authHeader && authHeader.split(" ")[1];
//   console.log("Token:", token);

//   if (!token) {
//     return res.status(401).json({ message: "No token provided" });
//   }

//   try {
//     const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
//     console.log("Decoded token:", decoded);

//     if (!decoded.user_type) {
//       return res
//         .status(403)
//         .json({ message: "Invalid token: missing user type" });
//     }

//     req.user = decoded;
//     next();
//   } catch (err) {
//     console.error("Token verification error:", (err as Error).message);
//     return res.status(403).json({ message: "Invalid or expired token" });
//   }
// };

// // Helper function for role checking
// const checkRole = (
//   req: AuthenticatedRequest,
//   allowedRoles: string[],
//   errorMessage: string
// ): boolean => {
//   if (!req.user) {
//     console.log("checkRole: No user in request");
//     return false;
//   }

//   const userType = req.user.user_type; // Keep original case
//   const isAllowed = allowedRoles.includes(userType);
//   console.log(`checkRole: user_type=${userType}, allowed=${isAllowed}`);
//   return isAllowed;
// };

// // Role-specific middlewares
// export const requireStudent = (
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ) => {
//   if (!checkRole(req, ["Student"], "This API is for students only")) {
//     return res.status(403).json({
//       message: "This API is for students only",
//       receivedType: req.user?.user_type || "none",
//     });
//   }
//   next();
// };

// export const requireMentor = (
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ) => {
//   if (!checkRole(req, ["Mentor"], "This API is for mentors only")) {
//     return res.status(403).json({
//       message: "This API is for mentors only",
//       receivedType: req.user?.user_type || "none",
//     });
//   }
//   next();
// };

// export const requireAdmin = (
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ) => {
//   if (!checkRole(req, ["Admin"], "This API is for admins only")) {
//     return res.status(403).json({
//       message: "This API is for admins only",
//       receivedType: req.user?.user_type || "none",
//     });
//   }
//   next();
// };

// // Combined role middlewares
// export const requireMentorOrStudent = (
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ) => {
//   if (
//     !checkRole(
//       req,
//       ["Mentor", "Student"],
//       "This API is for mentors and students only"
//     )
//   ) {
//     return res.status(403).json({
//       message: "This API is for mentors and students only",
//       receivedType: req.user?.user_type || "none",
//     });
//   }
//   next();
// };

// export const requireMentorOrAdmin = (
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ) => {
//   if (
//     !checkRole(
//       req,
//       ["Mentor", "Admin"],
//       "This API is for mentors and admins only"
//     )
//   ) {
//     return res.status(403).json({
//       message: "This API is for mentors and admins only",
//       receivedType: req.user?.user_type || "none",
//     });
//   }
//   next();
// };

// export const requireStudentOrAdmin = (
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ) => {
//   if (
//     !checkRole(
//       req,
//       ["Student", "Admin"],
//       "This API is for students and admins only"
//     )
//   ) {
//     return res.status(403).json({
//       message: "This API is for students and admins only",
//       receivedType: req.user?.user_type || "none",
//     });
//   }
//   next();
// };

// export const requireAnyAuthenticated = (
//   req: AuthenticatedRequest,
//   res: Response,
//   next: NextFunction
// ) => {
//   if (!req.user) {
//     console.log("requireAnyAuthenticated: No user in request");
//     return res.status(403).json({ message: "Authentication required" });
//   }
//   next();
// };

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/jwt";

// Define the user interface to match the expected JWT payload
interface JwtPayload {
  user_id: string;
  user_type: string;
  email?: string;
}

// Extend Request type for type safety
interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// Base authentication middleware
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Check cookie first (for MentorAuthController compatibility)
  let token = req.cookies?.jwtToken;

  // Fallback to Authorization header
  if (!token) {
    const authHeader = req.headers["authorization"];
    token = authHeader && authHeader.split(" ")[1];
  }

  console.log(
    "Token source:",
    token ? (req.cookies?.jwtToken ? "cookie" : "header") : "none"
  );
  console.log("Token:", token);

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    console.log("Decoded token:", decoded);

    if (!decoded.user_type) {
      return res
        .status(403)
        .json({ message: "Invalid token: missing user type" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification error:", (err as Error).message);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

// Helper function for role checking
const checkRole = (
  req: AuthenticatedRequest,
  allowedRoles: string[],
  errorMessage: string
): boolean => {
  if (!req.user) {
    console.log("checkRole: No user in request");
    return false;
  }

  const userType = req.user.user_type;
  const isAllowed = allowedRoles.includes(userType);
  console.log(`checkRole: user_type=${userType}, allowed=${isAllowed}`);
  return isAllowed;
};

// Role-specific middlewares
export const requireStudent = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!checkRole(req, ["Student"], "This API is for students only")) {
    return res.status(403).json({
      message: "This API is for students only",
      receivedType: req.user?.user_type || "none",
    });
  }
  next();
};

export const requireMentor = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!checkRole(req, ["Mentor"], "This API is for mentors only")) {
    return res.status(403).json({
      message: "This API is for mentors only",
      receivedType: req.user?.user_type || "none",
    });
  }
  next();
};

export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!checkRole(req, ["Admin"], "This API is for admins only")) {
    return res.status(403).json({
      message: "This API is for admins only",
      receivedType: req.user?.user_type || "none",
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
      ["Mentor", "Student"],
      "This API is for mentors and students only"
    )
  ) {
    return res.status(403).json({
      message: "This API is for mentors and students only",
      receivedType: req.user?.user_type || "none",
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
      ["Mentor", "Admin"],
      "This API is for mentors and admins only"
    )
  ) {
    return res.status(403).json({
      message: "This API is for mentors and admins only",
      receivedType: req.user?.user_type || "none",
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
      ["Student", "Admin"],
      "This API is for students and admins only"
    )
  ) {
    return res.status(403).json({
      message: "This API is for students and admins only",
      receivedType: req.user?.user_type || "none",
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
    console.log("requireAnyAuthenticated: No user in request");
    return res.status(403).json({ message: "Authentication required" });
  }
  next();
};
