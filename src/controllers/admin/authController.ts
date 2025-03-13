import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pool from "../../config/database";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/jwt";
import { CookieOptions } from "express";

// Define types based on your schema
interface User {
  user_id: string;
  name: string;
  email: string;
  username: string;
  password_hash: string;
  user_type: "Student" | "Mentor" | "Admin";
  gender: "Male" | "Female";
}

interface Mentor {
  mentor_id: string;
  user_id: string;
  bio: string;
  social_link?: string;
  image_url: string;
  is_approved: boolean;
  organization: string;
}

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

export class AdminAuthController {
  // Helper to find user by email
  private static async findByEmail(email: string): Promise<User | null> {
    const FIND_BY_EMAIL = `
      SELECT user_id, name, email, username, password_hash, user_type, gender
      FROM Users
      WHERE email = ?
    `;
    const [rows] = await pool.execute(FIND_BY_EMAIL, [email]);
    return (rows as User[])[0] || null;
  }

  // Helper to create a user (reused for setupDefaultAdmin)
  private static async createUser(
    user: Omit<User, "user_id">
  ): Promise<string> {
    const { name, email, username, password_hash, user_type, gender } = user;
    const hashedPassword = await bcrypt.hash(password_hash, 10); // Dynamic hash
    const [rows] = await pool.query("SELECT UUID() as uuid");
    const user_id = (rows as { uuid: string }[])[0].uuid; // Generate UUID

    const CREATE_USER = `
      INSERT INTO Users (user_id, name, email, username, password_hash, user_type, gender)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(CREATE_USER, [
        user_id,
        name,
        email,
        username,
        hashedPassword,
        user_type,
        gender,
      ]);
      await connection.commit();
      return user_id;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Setup default admin endpoint
  static async setupDefaultAdmin(req: Request, res: Response) {
    const defaultAdmin = {
      email: "admin1@gmail.com",
      username: "admin1",
      password_hash: "admin123", // Will be hashed by createUser
      name: "Default Admin",
      user_type: "Admin" as const,
      gender: "Male" as const,
    };

    try {
      const existingAdmin = await AdminAuthController.findByEmail(
        defaultAdmin.email
      );
      if (existingAdmin) {
        return res
          .status(400)
          .json({ message: "Default admin already exists" });
      }

      const [usernameCheck] = await pool.execute(
        "SELECT 1 FROM Users WHERE username = ?",
        [defaultAdmin.username]
      );
      if ((usernameCheck as any[]).length > 0) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const user_id = await AdminAuthController.createUser(defaultAdmin);

      res.status(201).json({
        message: "Default admin created successfully",
        user: { user_id, email: defaultAdmin.email },
      });
    } catch (error) {
      console.error("Error creating default admin:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }

  // Admin login
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Email and password are required" });
      }

      const user = await AdminAuthController.findByEmail(email);

      if (
        !user ||
        !(await bcrypt.compare(password, user.password_hash)) ||
        user.user_type !== "Admin"
      ) {
        return res
          .status(401)
          .json({ message: "Invalid credentials or not an admin" });
      }

      const token = jwt.sign(
        { user_id: user.user_id, user_type: user.user_type, email: user.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      const cookieOptions: CookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      };
      res.cookie("jwtToken", token, cookieOptions);

      res.json({
        message: "Admin login successful",
        user: { user_id: user.user_id, email: user.email },
      });
    } catch (error) {
      console.error("Admin login error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }

  // Get list of unapproved mentors
  static async getUnapprovedMentors(req: AuthenticatedRequest, res: Response) {
    try {
      const admin = req.user;

      if (!admin || admin.user_type !== "Admin") {
        return res.status(403).json({ message: "Unauthorized: Admins only" });
      }

      const GET_UNAPPROVED_MENTORS = `
        SELECT 
          m.user_id,
          m.mentor_id,
          u.name,
          u.email,
          u.username,
          u.gender,
          m.bio,
          m.is_approved,
          m.social_link,
          m.image_url,
          m.organization
        FROM Mentors m
        INNER JOIN Users u ON m.user_id = u.user_id
        WHERE m.is_approved = FALSE;
      `;

      const [rows] = await pool.execute(GET_UNAPPROVED_MENTORS);
      const unapprovedMentors = rows as (Mentor & User)[];

      if (!unapprovedMentors.length) {
        return res
          .status(200)
          .json({ message: "No unapproved mentors found", data: [] });
      }

      res.status(200).json({
        message: "Unapproved mentors retrieved successfully",
        data: unapprovedMentors,
      });
    } catch (error) {
      console.error("Get unapproved mentors error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }

  // Approve or reject a mentor
  static async approveMentor(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const { mentor_id, action } = req.body;
      const admin = req.user;

      if (!admin || admin.user_type !== "Admin") {
        return res.status(403).json({ message: "Unauthorized: Admins only" });
      }

      if (!mentor_id || !["Approved", "Rejected"].includes(action)) {
        return res.status(400).json({ message: "Invalid mentor_id or action" });
      }

      const FIND_MENTOR = `
        SELECT mentor_id, user_id, is_approved
        FROM Mentors
        WHERE mentor_id = ?
      `;
      const [mentorRows] = await pool.execute(FIND_MENTOR, [mentor_id]);
      const mentor = (mentorRows as Mentor[])[0];

      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      const isApproved = action === "Approved" ? 1 : 0;

      await connection.beginTransaction();

      const UPDATE_MENTOR = `
        UPDATE Mentors
        SET is_approved = ?
        WHERE mentor_id = ?
      `;
      const [updateResult] = await connection.execute(UPDATE_MENTOR, [
        isApproved,
        mentor_id,
      ]);

      if ((updateResult as any).affectedRows === 0) {
        throw new Error("Failed to update mentor status");
      }

      const INSERT_HISTORY = `
        INSERT INTO Mentor_Approval_History (history_id, mentor_id, admin_id, action)
        VALUES (UUID(), ?, ?, ?)
      `;
      await connection.execute(INSERT_HISTORY, [
        mentor_id,
        admin.user_id,
        action,
      ]);

      await connection.commit();

      res.status(200).json({
        message: `Mentor ${action.toLowerCase()} successfully`,
        mentor_id,
      });
    } catch (error) {
      console.error("Mentor approval error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  // Promote a user to admin
  static async promoteToAdmin(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const { user_id } = req.body;
      const admin = req.user;

      if (!admin || admin.user_type !== "Admin") {
        return res.status(403).json({ message: "Unauthorized: Admins only" });
      }

      if (!user_id) {
        return res.status(400).json({ message: "User ID is required" });
      }

      const FIND_USER = `
        SELECT user_id, user_type
        FROM Users
        WHERE user_id = ?
      `;
      const [userRows] = await pool.execute(FIND_USER, [user_id]);
      const user = (userRows as User[])[0];

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.user_type === "Admin") {
        return res.status(400).json({ message: "User is already an admin" });
      }

      await connection.beginTransaction();

      const UPDATE_USER = `
        UPDATE Users
        SET user_type = 'Admin'
        WHERE user_id = ?
      `;
      const [updateResult] = await connection.execute(UPDATE_USER, [user_id]);

      if ((updateResult as any).affectedRows === 0) {
        throw new Error("Failed to promote user to admin");
      }

      await connection.commit();

      res.status(200).json({
        message: "User promoted to admin successfully",
        user_id,
      });
    } catch (error) {
      console.error("Promote to admin error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  // Logout (clear cookie)
  // static async logout(req: AuthenticatedRequest, res: Response) {
  //   res.clearCookie("jwtToken", {
  //     httpOnly: true,
  //     secure: process.env.NODE_ENV === "production",
  //     sameSite: "strict",
  //     path: "/",
  //   });
  //   res.status(200).json({ message: "Admin logged out successfully" });
  // }
}
