import { Request, Response, NextFunction } from "express";
import pool from "../../config/database";
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/jwt";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { CookieOptions } from "express";
import path from "path";

interface User {
  user_id: string;
  name: string;
  email: string;
  username: string;
  password_hash: string;
  user_type: "Student" | "Mentor" | "Admin";
  gender: "Male" | "Female" | null;
  dob: Date | null;
  graduation_year: number | null;
  image_url: Buffer | null;
}

interface Student {
  student_id: string;
  user_id: string;
}

interface StudentInfoType {
  name: string;
  email: string;
  username: string;
  gender: "Male" | "Female" | null;
  grad_year: string;
  dob: Date;
  image_link: string;
}

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
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

export class StudentAuthController {
  private static async findByEmail(email: string): Promise<User | null> {
    const FIND_BY_EMAIL = `
      SELECT user_id, name, email, username, password_hash, user_type, gender, dob, graduation_year, image_url
      FROM Users
      WHERE email = ?
    `;
    const [rows] = await pool.execute(FIND_BY_EMAIL, [email]);
    return (rows as User[])[0] || null;
  }

  private static async findByUsername(username: string): Promise<User | null> {
    const FIND_BY_USERNAME = `
      SELECT user_id, name, email, username, password_hash, user_type, gender, dob, graduation_year, image_url
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
        const { name, email, username, gender, grad_year, dob, password } =
          req.body;
        const file = req.file;
        const user_id = uuidv4();
        const student_id = uuidv4();
        const hashedPassword = await bcrypt.hash(password, 10);

        if (!name || !email || !username || !password) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        if (
          (await StudentAuthController.findByEmail(email)) ||
          (await StudentAuthController.findByUsername(username))
        ) {
          return res
            .status(400)
            .json({ message: "Username or email already exists" });
        }

        await connection.beginTransaction();

        const CREATE_USER = `
          INSERT INTO Users (user_id, name, email, username, password_hash, user_type, gender, dob, graduation_year, image_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await connection.execute(CREATE_USER, [
          user_id,
          name,
          email,
          username,
          hashedPassword,
          "Student",
          gender || null,
          dob ? new Date(dob) : null,
          grad_year ? parseInt(grad_year, 10) : null,
          file ? file.buffer : null,
        ]);

        const CREATE_STUDENT = `
          INSERT INTO Students (student_id, user_id)
          VALUES (?, ?)
        `;
        await connection.execute(CREATE_STUDENT, [student_id, user_id]);

        await connection.commit();

        const token = jwt.sign(
          { user_id, user_type: "Student", email },
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
          success: true,
          jwtToken: token,
          student_id: student_id,
        });
      } catch (error) {
        console.error("Student register error:", error);
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Rollback failed:", rollbackError);
        }
        res
          .status(500)
          .json({ message: "Server error", error: (error as any).message });
      } finally {
        connection.release();
      }
    });
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Missing email or password" });
      }

      const user = await StudentAuthController.findByEmail(email);

      if (
        !user ||
        !(await bcrypt.compare(password, user.password_hash)) ||
        user.user_type !== "Student"
      ) {
        return res
          .status(401)
          .json({ message: "Invalid credentials or not a student" });
      }

      const FIND_STUDENT = `
        SELECT student_id FROM Students WHERE user_id = ?
      `;
      const [studentRows] = await pool.execute(FIND_STUDENT, [user.user_id]);
      const student = (studentRows as { student_id: string }[])[0];

      if (!student) {
        return res.status(404).json({ message: "Student profile not found" });
      }

      const token = jwt.sign(
        { user_id: user.user_id, user_type: "Student", email: user.email },
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
        success: true,
        jwtToken: token,
        student_id: student.student_id,
      });
    } catch (error) {
      console.error("Student login error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  static async updateStudentProfile(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();

    upload.single("image")(req, res, async (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).json({ message: err.message });
      }

      try {
        const user = req.user;
        if (!user || !user.user_id) {
          return res
            .status(401)
            .json({ message: "Unauthorized: No user data" });
        }

        const { name, email, username, gender, grad_year, dob, password, bio } =
          req.body;
        const file = req.file;

        const FIND_CURRENT_PROFILE = `
          SELECT 
            u.user_id, u.name, u.email, u.username, u.gender, u.dob, u.graduation_year, u.image_url, u.password_hash,
            s.bio
          FROM Users u
          JOIN Students s ON u.user_id = s.user_id
          WHERE u.user_id = ?
        `;
        const [profileRows] = await connection.execute(FIND_CURRENT_PROFILE, [
          user.user_id,
        ]);
        const currentProfile = (profileRows as any)[0];
        if (!currentProfile) {
          return res.status(404).json({ message: "Student profile not found" });
        }

        if ("email" in req.body && email && email !== currentProfile.email) {
          const existingEmailUser = await StudentAuthController.findByEmail(
            email
          );
          if (existingEmailUser && existingEmailUser.user_id !== user.user_id) {
            return res.status(400).json({ message: "Email already exists" });
          }
        }
        if (
          "username" in req.body &&
          username &&
          username !== currentProfile.username
        ) {
          const existingUsernameUser =
            await StudentAuthController.findByUsername(username);
          if (
            existingUsernameUser &&
            existingUsernameUser.user_id !== user.user_id
          ) {
            return res.status(400).json({ message: "Username already exists" });
          }
        }

        await connection.beginTransaction();

        const updateValues = {
          name: "name" in req.body && name !== "" ? name : currentProfile.name,
          email:
            "email" in req.body && email !== "" ? email : currentProfile.email,
          username:
            "username" in req.body && username !== ""
              ? username
              : currentProfile.username,
          gender:
            "gender" in req.body && gender !== ""
              ? gender
              : currentProfile.gender,
          dob: "dob" in req.body && dob ? new Date(dob) : currentProfile.dob,
          graduation_year:
            "grad_year" in req.body && grad_year
              ? parseInt(grad_year, 10)
              : currentProfile.graduation_year,
          image_url: file ? file.buffer : currentProfile.image_url,
          password_hash:
            "password" in req.body && password
              ? await bcrypt.hash(password, 10)
              : currentProfile.password_hash,
          bio: "bio" in req.body ? bio : currentProfile.bio,
        };

        const UPDATE_USER = `
          UPDATE Users
          SET 
            name = ?,
            email = ?,
            username = ?,
            gender = ?,
            dob = ?,
            graduation_year = ?,
            image_url = ?,
            password_hash = ?
          WHERE user_id = ?
        `;
        await connection.execute(UPDATE_USER, [
          updateValues.name,
          updateValues.email,
          updateValues.username,
          updateValues.gender,
          updateValues.dob,
          updateValues.graduation_year,
          updateValues.image_url,
          updateValues.password_hash,
          user.user_id,
        ]);

        const UPDATE_STUDENT = `
          UPDATE Students
          SET bio = ?
          WHERE user_id = ?
        `;
        await connection.execute(UPDATE_STUDENT, [
          updateValues.bio,
          user.user_id,
        ]);

        await connection.commit();

        res.status(200).json({ success: true });
      } catch (error) {
        console.error("Update student profile error:", error);
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Rollback failed:", rollbackError);
        }
        res
          .status(500)
          .json({ message: "Server error", error: (error as any).message });
      } finally {
        connection.release();
      }
    });
  }

  static async getStudentProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const FIND_PROFILE = `
        SELECT 
          u.user_id,
          u.name,
          u.email,
          u.username,
          u.gender,
          u.dob,
          u.graduation_year,
          u.image_url,
          s.student_id,
          s.bio
        FROM Users u
        JOIN Students s ON u.user_id = s.user_id
        WHERE u.user_id = ? AND u.user_type = 'Student'
      `;
      const [profileRows] = await pool.execute(FIND_PROFILE, [user.user_id]);
      const profileData = (profileRows as any)[0];

      if (!profileData) {
        return res.status(404).json({ message: "Student profile not found" });
      }

      const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
      // const baseUrl = "http://localhost:3000";
      const image_link = profileData.image_url
        ? `${baseUrl}/api/student/image/${profileData.student_id}`
        : "";

      const studentInfo = {
        name: profileData.name || "",
        email: profileData.email || "",
        username: profileData.username || "",
        gender: profileData.gender,
        grad_year: profileData.graduation_year
          ? profileData.graduation_year.toString()
          : "",
        dob: profileData.dob || new Date(0),
        image_link,
        bio: profileData.bio || "",
      };

      res.status(200).json({
        success: true,
        data: studentInfo,
      });
    } catch (error) {
      console.error("Get student profile error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }

  static async getStudentProfileById(req: AuthenticatedRequest, res: Response) {
    try {
      const { student_id } = req.params;

      if (!student_id) {
        return res.status(400).json({ message: "Student ID is required" });
      }

      const FIND_PROFILE_BY_ID = `
      SELECT 
        u.user_id,
        u.name,
        u.email,
        u.username,
        u.gender,
        u.dob,
        u.graduation_year,
        u.image_url,
        s.student_id,
        s.bio
      FROM Users u
      JOIN Students s ON u.user_id = s.user_id
      WHERE s.student_id = ? AND u.user_type = 'Student'
    `;

      const [profileRows] = await pool.execute(FIND_PROFILE_BY_ID, [
        student_id,
      ]);
      const profileData = (profileRows as any)[0];

      if (!profileData) {
        return res.status(404).json({ message: "Student profile not found" });
      }

      const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
      // const baseUrl = "http://localhost:3000";
      const image_link = profileData.image_url
        ? `${baseUrl}/api/student/image/${profileData.student_id}`
        : "";

      const studentInfo = {
        name: profileData.name || "",
        email: profileData.email || "",
        username: profileData.username || "",
        gender: profileData.gender,
        grad_year: profileData.graduation_year
          ? profileData.graduation_year.toString()
          : "",
        dob: profileData.dob || new Date(0),
        image_link,
        bio: profileData.bio || "",
      };

      res.status(200).json({
        success: true,
        data: studentInfo,
      });
    } catch (error) {
      console.error("Get student profile by ID error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }

  static async getStudentImage(req: AuthenticatedRequest, res: Response) {
    try {
      const { student_id } = req.params;

      if (!student_id) {
        return res.status(400).json({ message: "Student ID is required" });
      }

      const FIND_STUDENT_IMAGE = `
        SELECT u.image_url
        FROM Users u
        JOIN Students s ON u.user_id = s.user_id
        WHERE s.student_id = ?
      `;
      const [rows] = await pool.execute(FIND_STUDENT_IMAGE, [student_id]);
      const student = (rows as { image_url: Buffer | null }[])[0];

      if (!student || !student.image_url) {
        return res.status(404).json({ message: "Image not found" });
      }

      res.set("Content-Type", "image/jpeg");
      res.send(student.image_url);
    } catch (error) {
      console.error("Get student image error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }
}
