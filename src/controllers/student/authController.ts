import { Request, Response } from "express";
import pool from "../../config/database";
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/jwt";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
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

interface Student {
  student_id: string;
  user_id: string;
  dob: string;
  graduation_year: string;
}

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

export class StudentAuthController {
  private static async createUser(
    user: Omit<User, "user_id">
  ): Promise<string> {
    const { name, email, username, password_hash, user_type, gender } = user;
    const hashedPassword = await bcrypt.hash(password_hash, 10);
    const user_id = uuidv4();

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
    try {
      const { name, email, username, password, gender, dob, graduation_year } =
        req.body;
      const student_id = uuidv4();

      const CREATE_STUDENT = `
        INSERT INTO Students (student_id, user_id, dob, graduation_year)
        VALUES (?, ?, ?, ?)
      `;

      if (
        !name ||
        !email ||
        !username ||
        !password ||
        !gender ||
        !dob ||
        !graduation_year
      ) {
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

      const user_id = await StudentAuthController.createUser({
        name,
        email,
        username,
        password_hash: password,
        user_type: "Student",
        gender,
      });

      const formattedDob = new Date(dob).toISOString().split("T")[0];

      console.log("Inserting into Students...");
      await connection.execute(CREATE_STUDENT, [
        student_id,
        user_id,
        formattedDob,
        graduation_year,
      ]);
      await connection.commit();

      const user = await StudentAuthController.findByEmail(email);
      if (!user) throw new Error("User creation failed");

      const token = jwt.sign(
        { user_id: user.user_id, user_type: user.user_type },
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
        message: "Registration successful",
        user: { user_id: user.user_id, email: user.email },
      });
    } catch (error) {
      console.error("Student register error:", error);
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
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      // Validate input without logging sensitive data
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

      const token = jwt.sign(
        { user_id: user.user_id, user_type: user.user_type },
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
        message: "Login successful",
        user: { user_id: user.user_id, email: user.email },
      });
    } catch (error) {
      // Log only a generic message to avoid exposing sensitive data
      console.error("Student login error: An error occurred during login");
      res.status(500).json({ message: "Server error" });
    }
  }

  static async getProfile(req: Request, res: Response) {
    try {
      const { student_id } = req.params;

      if (!student_id) {
        return res.status(400).json({ message: "Student ID is required" });
      }

      const FIND_STUDENT = `
        SELECT student_id, user_id, dob, graduation_year
        FROM Students
        WHERE student_id = ?
      `;
      const [studentRows] = await pool.execute(FIND_STUDENT, [student_id]);
      const student = (studentRows as Student[])[0];

      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      const FIND_USER = `
        SELECT user_id, name, email, username, gender
        FROM Users
        WHERE user_id = ?
      `;
      const [userRows] = await pool.execute(FIND_USER, [student.user_id]);
      const userData = (userRows as User[])[0];

      if (!userData) {
        return res.status(404).json({ message: "Associated user not found" });
      }

      const formattedDob = new Date(student.dob).toISOString().split("T")[0];

      const profile = {
        ...userData,
        student_id: student.student_id,
        dob: formattedDob,
        graduation_year: student.graduation_year,
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
    try {
      const { name, email, gender, dob, graduation_year, password } = req.body;
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const user_id = user.user_id;

      const FIND_USER = `
        SELECT name, email, gender, password_hash
        FROM Users
        WHERE user_id = ?
      `;
      const [userRows] = await pool.execute(FIND_USER, [user_id]);
      const existingUser = (userRows as User[])[0];
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const FIND_STUDENT = `
        SELECT student_id, dob, graduation_year
        FROM Students
        WHERE user_id = ?
      `;
      const [studentRows] = await pool.execute(FIND_STUDENT, [user_id]);
      const existingStudent = (studentRows as Student[])[0];
      if (!existingStudent) {
        return res.status(404).json({ message: "Student profile not found" });
      }

      const updatedName =
        name !== undefined && name !== "" ? name : existingUser.name;
      const updatedEmail =
        email !== undefined && email !== "" ? email : existingUser.email;
      const updatedGender =
        gender !== undefined && gender !== "" ? gender : existingUser.gender;

      let updatedDob = existingStudent.dob;
      if (dob !== undefined && dob !== "") {
        updatedDob = new Date(dob).toISOString().split("T")[0];
      }

      const updatedGraduationYear =
        graduation_year !== undefined && graduation_year !== ""
          ? graduation_year
          : existingStudent.graduation_year;
      const updatedPasswordHash =
        password !== undefined && password !== ""
          ? await bcrypt.hash(password, 10)
          : existingUser.password_hash;

      if (email !== undefined && email !== "" && email !== existingUser.email) {
        const CHECK_EMAIL = `
          SELECT 1 FROM Users WHERE email = ? AND user_id != ?
        `;
        const [emailCheck] = await pool.execute(CHECK_EMAIL, [
          updatedEmail,
          user_id,
        ]);
        if ((emailCheck as any[]).length > 0) {
          return res.status(400).json({ message: "Email already in use" });
        }
      }

      console.log("Starting transaction for updateProfile...");
      await connection.beginTransaction();

      console.log("Updating Users...");
      const UPDATE_USER = `
        UPDATE Users
        SET name = ?, email = ?, gender = ?, password_hash = ?
        WHERE user_id = ?
      `;
      const [userResult] = await connection.execute(UPDATE_USER, [
        updatedName,
        updatedEmail,
        updatedGender,
        updatedPasswordHash,
        user_id,
      ]);
      if ((userResult as any).affectedRows === 0) {
        throw new Error("Failed to update user data");
      }

      console.log("Updating Students...");
      const UPDATE_STUDENT = `
        UPDATE Students
        SET dob = ?, graduation_year = ?
        WHERE user_id = ?
      `;
      const [studentResult] = await connection.execute(UPDATE_STUDENT, [
        updatedDob,
        updatedGraduationYear,
        user_id,
      ]);
      if ((studentResult as any).affectedRows === 0) {
        throw new Error("Failed to update student data");
      }

      console.log("Committing transaction...");
      await connection.commit();

      const newToken = jwt.sign(
        { user_id, user_type: "Student", email: updatedEmail },
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
        message: "Profile updated successfully",
        user: { user_id, email: updatedEmail },
      });
    } catch (error) {
      console.error("Transaction error in updateProfile:", error);
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
  }

  static async getAllStudents(req: Request, res: Response) {
    try {
      const GET_ALL_STUDENTS = `
        SELECT 
          u.user_id, 
          u.name, 
          u.email, 
          u.username, 
          u.user_type, 
          u.gender, 
          u.created_at AS user_created_at,
          s.student_id, 
          s.dob, 
          s.graduation_year, 
          s.created_at AS student_created_at
        FROM Users u
        INNER JOIN Students s ON u.user_id = s.user_id
        WHERE u.user_type = 'Student';
      `;

      const [rows] = await pool.execute(GET_ALL_STUDENTS);
      const students = rows as (User & Student)[];

      if (!students.length) {
        return res
          .status(404)
          .json({ message: "No registered students found" });
      }

      const formattedStudents = students.map((student) => ({
        ...student,
        dob: new Date(student.dob).toISOString().split("T")[0],
      }));

      res.status(200).json({
        message: "Registered students retrieved successfully",
        data: formattedStudents,
      });
    } catch (error) {
      console.error("Get all students error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }
}
