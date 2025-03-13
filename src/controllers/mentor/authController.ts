import { Request, Response } from "express";
import pool from "../../config/database";
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/jwt";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { CookieOptions } from "express";

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
  social_link: string | null;
  image_url: string | null;
  organization: string | null; // Added organization field
  is_approved: boolean;
}

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only JPEG/JPG/PNG images are allowed"));
  },
});

export class MentorAuthController {
  private static async findByEmail(email: string): Promise<User | null> {
    const FIND_BY_EMAIL = `
      SELECT user_id, name, email, username, password_hash, user_type, gender
      FROM Users
      WHERE email = ?
    `;
    const [rows] = await pool.execute(FIND_BY_EMAIL, [email]);
    return (rows as User[])[0] || null;
  }

  private static async findByUsername(username: string): Promise<User | null> {
    const FIND_BY_USERNAME = `
      SELECT user_id, name, email, username, password_hash, user_type, gender
      FROM Users
      WHERE username = ?
    `;
    const [rows] = await pool.execute(FIND_BY_USERNAME, [username]);
    return (rows as User[])[0] || null;
  }

  static async register(req: Request, res: Response) {
    const connection = await pool.getConnection();
    upload.single("image")(req, res, async (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).json({ message: err.message });
      }

      try {
        const {
          name,
          email,
          username,
          password,
          gender,
          bio,
          social_link,
          organization,
        } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const user_id = uuidv4();
        const mentor_id = uuidv4();
        const hashedPassword = await bcrypt.hash(password, 10);

        const CREATE_USER = `
          INSERT INTO Users (user_id, name, email, username, password_hash, user_type, gender)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const CREATE_MENTOR = `
          INSERT INTO Mentors (mentor_id, user_id, bio, social_link, image_url, organization, is_approved)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        if (!name || !email || !username || !password || !gender || !bio) {
          if (req.file) await fsPromises.unlink(req.file.path);
          return res.status(400).json({ message: "Missing required fields" });
        }

        if (
          (await MentorAuthController.findByEmail(email)) ||
          (await MentorAuthController.findByUsername(username))
        ) {
          if (req.file) await fsPromises.unlink(req.file.path);
          return res
            .status(400)
            .json({ message: "Username or email already exists" });
        }

        await connection.beginTransaction();

        await connection.execute(CREATE_USER, [
          user_id,
          name,
          email,
          username,
          hashedPassword,
          "Mentor",
          gender,
        ]);
        await connection.execute(CREATE_MENTOR, [
          mentor_id,
          user_id,
          bio,
          social_link,
          imageUrl,
          organization, // Added organization to insert
          false,
        ]);

        await connection.commit();

        const token = jwt.sign(
          { user_id: user_id, user_type: "Mentor" },
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

        res.status(201).json({
          message: "Mentor registration successful",
          user: { user_id: user_id, email: email },
        });
      } catch (error) {
        console.error("Mentor register error:", error);
        if (req.file) await fsPromises.unlink(req.file.path);
        try {
          await connection.rollback();
          console.log("Rollback successful");
        } catch (rollbackError) {
          console.error("Rollback failed:", rollbackError);
        }
        res
          .status(500)
          .json({ message: "Server error", error: (error as any).message });
      } finally {
        connection.release();
        console.log("Connection released");
      }
    });
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      // Validate input without logging sensitive data
      if (!email || !password) {
        return res.status(400).json({ message: "Missing email or password" });
      }

      const user = await MentorAuthController.findByEmail(email);

      if (
        !user ||
        !(await bcrypt.compare(password, user.password_hash)) ||
        user.user_type !== "Mentor"
      ) {
        return res
          .status(401)
          .json({ message: "Invalid credentials or not a mentor" });
      }

      const token = jwt.sign(
        { user_id: user.user_id, user_type: "Mentor" },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      const cookieOptions: CookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // Ensures cookie is only sent over HTTPS
        sameSite: "strict",
        path: "/",
      };
      res.cookie("jwtToken", token, cookieOptions);

      // Response does not include sensitive data
      res.json({
        message: "Mentor login successful",
        user: { user_id: user.user_id, email: user.email },
      });
    } catch (error) {
      // Log only a generic message to avoid exposing sensitive data
      console.error("Mentor login error: An error occurred during login");
      res.status(500).json({ message: "Server error" });
    }
  }

  static async getProfile(req: Request, res: Response) {
    try {
      const { mentor_id } = req.params;

      if (!mentor_id) {
        return res.status(400).json({ message: "Mentor ID is required" });
      }

      const FIND_MENTOR = `
        SELECT mentor_id, user_id, bio, social_link, image_url, organization, is_approved
        FROM Mentors
        WHERE mentor_id = ?
      `;
      const [mentorRows] = await pool.execute(FIND_MENTOR, [mentor_id]);
      const mentorData = (mentorRows as Mentor[])[0];

      if (!mentorData) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      const FIND_USER = `
        SELECT user_id, name, email, username, gender
        FROM Users
        WHERE user_id = ?
      `;
      const [userRows] = await pool.execute(FIND_USER, [mentorData.user_id]);
      const userData = (userRows as User[])[0];

      if (!userData) {
        return res.status(404).json({ message: "Associated user not found" });
      }

      const profile = {
        ...userData,
        mentor_id: mentorData.mentor_id,
        bio: mentorData.bio,
        social_link: mentorData.social_link,
        image_url: mentorData.image_url,
        organization: mentorData.organization, // Added organization to profile
        is_approved: mentorData.is_approved,
      };

      res.status(200).json(profile);
    } catch (error) {
      console.error("Get profile error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }

  static async updateProfile(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    upload.single("image")(req, res, async (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).json({ message: err.message });
      }

      try {
        const { name, email, gender, bio, social_link, organization } =
          req.body; // Added organization
        const user = req.user;
        if (!user) {
          if (req.file) await fsPromises.unlink(req.file.path);
          return res
            .status(401)
            .json({ message: "Unauthorized: No user data" });
        }

        const user_id = user.user_id;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

        const FIND_USER = `
          SELECT name, email, gender
          FROM Users
          WHERE user_id = ?
        `;
        const [userRows] = await pool.execute(FIND_USER, [user_id]);
        const existingUser = (userRows as User[])[0];

        if (!existingUser) {
          if (req.file) await fsPromises.unlink(req.file.path);
          return res.status(404).json({ message: "User not found" });
        }

        const FIND_MENTOR = `
          SELECT mentor_id, bio, social_link, image_url, organization
          FROM Mentors
          WHERE user_id = ?
        `;
        const [mentorRows] = await pool.execute(FIND_MENTOR, [user_id]);
        const existingMentor = (mentorRows as Mentor[])[0];

        if (!existingMentor) {
          if (req.file) await fsPromises.unlink(req.file.path);
          return res.status(404).json({ message: "Mentor profile not found" });
        }

        const updatedName =
          name !== undefined && name !== "" ? name : existingUser.name;
        const updatedEmail =
          email !== undefined && email !== "" ? email : existingUser.email;
        const updatedGender =
          gender !== undefined && gender !== "" ? gender : existingUser.gender;
        const updatedBio =
          bio !== undefined && bio !== "" ? bio : existingMentor.bio;
        const updatedSocialLink =
          social_link !== undefined && social_link !== ""
            ? social_link
            : existingMentor.social_link;
        const updatedImageUrl =
          imageUrl !== null ? imageUrl : existingMentor.image_url;
        const updatedOrganization = // Added organization update logic
          organization !== undefined && organization !== ""
            ? organization
            : existingMentor.organization;

        if (
          updatedEmail !== existingUser.email &&
          email !== undefined &&
          email !== ""
        ) {
          const CHECK_EMAIL = `
            SELECT 1 FROM Users WHERE email = ? AND user_id != ?
          `;
          const [emailCheck] = await pool.execute(CHECK_EMAIL, [
            updatedEmail,
            user_id,
          ]);
          if ((emailCheck as any[]).length > 0) {
            if (req.file) await fsPromises.unlink(req.file.path);
            return res.status(400).json({ message: "Email already in use" });
          }
        }

        const UPDATE_USER = `
          UPDATE Users
          SET name = ?, email = ?, gender = ?
          WHERE user_id = ?
        `;
        const UPDATE_MENTOR = `
          UPDATE Mentors
          SET bio = ?, social_link = ?, image_url = ?, organization = ?
          WHERE user_id = ?
        `;

        try {
          await connection.beginTransaction();

          const [userResult] = await connection.execute(UPDATE_USER, [
            updatedName,
            updatedEmail,
            updatedGender,
            user_id,
          ]);
          if ((userResult as any).affectedRows === 0) {
            throw new Error("Failed to update user data");
          }

          const [mentorResult] = await connection.execute(UPDATE_MENTOR, [
            updatedBio,
            updatedSocialLink,
            updatedImageUrl,
            updatedOrganization, // Added organization to update
            user_id,
          ]);
          if ((mentorResult as any).affectedRows === 0) {
            throw new Error("Failed to update mentor data");
          }

          await connection.commit();

          const newToken = jwt.sign(
            { user_id: user_id, user_type: "Mentor", email: updatedEmail },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
          );

          const cookieOptions: CookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
          };
          res.cookie("jwtToken", newToken, cookieOptions);

          res.status(200).json({
            message: "Mentor profile updated successfully",
            user: { user_id: user_id, email: updatedEmail },
          });
        } catch (error) {
          if (req.file) await fsPromises.unlink(req.file.path);
          await connection.rollback();
          console.error("Update profile error:", error);
          return res.status(500).json({
            message: "Transaction failed",
            error: (error as any).message,
          });
        } finally {
          connection.release();
        }
      } catch (error) {
        console.error("Update profile error:", error);
        res
          .status(500)
          .json({ message: "Server error", error: (error as any).message });
      }
    });
  }

  static async getAllMentors(req: Request, res: Response) {
    try {
      const GET_ALL_MENTORS = `
        SELECT 
          u.user_id, 
          u.name, 
          u.email, 
          u.username, 
          u.user_type, 
          u.gender, 
          u.created_at AS user_created_at,
          m.mentor_id, 
          m.bio, 
          m.social_link, 
          m.image_url, 
          m.organization, 
          m.is_approved, 
          m.created_at AS mentor_created_at
        FROM Users u
        INNER JOIN Mentors m ON u.user_id = m.user_id
        WHERE u.user_type = 'Mentor';
      `;

      const [rows] = await pool.execute(GET_ALL_MENTORS);
      const mentors = rows as (User &
        Mentor & { user_created_at: string; mentor_created_at: string })[];

      if (!mentors.length) {
        return res.status(404).json({ message: "No registered mentors found" });
      }

      res.status(200).json({
        message: "Registered mentors retrieved successfully",
        data: mentors,
      });
    } catch (error) {
      console.error("Get all mentors error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }
}
