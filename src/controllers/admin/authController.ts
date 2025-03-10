// import { Request, Response } from "express";
// import pool from "../../config/database";
// import jwt from "jsonwebtoken";
// import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/jwt";
// import bcrypt from "bcryptjs";

// // User type definition
// interface User {
//   user_id: string;
//   name: string;
//   email: string;
//   username: string;
//   password_hash: string;
//   user_type: "Student" | "Mentor" | "Admin";
//   gender: "Male" | "Female" | "Other";
// }

// // Extend Request type to include user from JWT
// interface AuthenticatedRequest extends Request {
//   user?: { user_id: string; user_type: string; email?: string };
// }

// export class AdminAuthController {
//   private static async findByEmail(email: string): Promise<User | null> {
//     const FIND_BY_EMAIL = `
//       SELECT user_id, name, email, username, password_hash, user_type, gender
//       FROM Users
//       WHERE email = ?
//     `;
//     const [rows] = await pool.execute(FIND_BY_EMAIL, [email]);
//     return (rows as User[])[0] || null;
//   }

//   static async login(req: Request, res: Response) {
//     try {
//       const { email, password } = req.body;

//       console.log("Admin login request body:", req.body);

//       if (!email || !password) {
//         return res.status(400).json({ message: "Missing email or password" });
//       }

//       const user = await AdminAuthController.findByEmail(email);

//       if (
//         !user ||
//         !(await bcrypt.compare(password, user.password_hash)) ||
//         user.user_type !== "Admin"
//       ) {
//         return res
//           .status(401)
//           .json({ message: "Invalid credentials or not an admin" });
//       }

//       const token = jwt.sign(
//         { user_id: user.user_id, user_type: user.user_type },
//         JWT_SECRET,
//         { expiresIn: JWT_EXPIRES_IN }
//       );

//       res.json({ token });
//     } catch (error) {
//       console.error("Admin login error:", error);
//       res
//         .status(500)
//         .json({ message: "Server error", error: (error as any).message });
//     }
//   }

//   static async promoteToAdmin(req: AuthenticatedRequest, res: Response) {
//     try {
//       const adminUser = req.user;
//       if (!adminUser || adminUser.user_type !== "Admin") {
//         return res
//           .status(403)
//           .json({ message: "Unauthorized: Admin access required" });
//       }

//       const { email } = req.body;

//       if (!email) {
//         return res.status(400).json({ message: "Missing email" });
//       }

//       const user = await AdminAuthController.findByEmail(email);

//       if (!user) {
//         return res.status(404).json({ message: "User not found" });
//       }

//       if (user.user_type === "Admin") {
//         return res.status(400).json({ message: "User is already an admin" });
//       }

//       const PROMOTE_USER = `
//         UPDATE Users
//         SET user_type = 'Admin'
//         WHERE email = ?
//       `;
//       const [result] = await pool.execute(PROMOTE_USER, [email]);

//       if ((result as any).affectedRows === 0) {
//         return res.status(500).json({ message: "Failed to promote user" });
//       }

//       res
//         .status(200)
//         .json({ message: `${email} promoted to admin successfully` });
//     } catch (error) {
//       console.error("Promote to admin error:", error);
//       res
//         .status(500)
//         .json({ message: "Server error", error: (error as any).message });
//     }
//   }
// }
