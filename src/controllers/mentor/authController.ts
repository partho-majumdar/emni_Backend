/*

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
  gender: "Male" | "Female";
}

interface Mentor {
  mentor_id: string;
  user_id: string;
  bio: string;
  social_link: string | null;
  image_url: Buffer | null;
  organization: string | null;
  is_approved: boolean;
}

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
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
    const upload = multer({
      storage: multer.memoryStorage(),
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
        const file = req.file;
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
          return res.status(400).json({ message: "Missing required fields" });
        }

        if (
          (await MentorAuthController.findByEmail(email)) ||
          (await MentorAuthController.findByUsername(username))
        ) {
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
          file ? file.buffer : null,
          organization,
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
          user: {
            user_id: user_id,
            mentor_id: mentor_id,
            email: email,
            jwtToken: token,
          },
        });
      } catch (error) {
        console.error("Mentor register error:", error);
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

      const FIND_MENTOR = `
        SELECT mentor_id, is_approved FROM Mentors WHERE user_id = ?
      `;
      const [mentorRows] = await pool.execute(FIND_MENTOR, [user.user_id]);
      const mentor = (
        mentorRows as { mentor_id: string; is_approved: boolean }[]
      )[0];

      if (!mentor) {
        return res.status(404).json({ message: "Mentor profile not found" });
      }

      // Check if mentor is approved
      if (!mentor.is_approved) {
        return res.status(403).json({
          message:
            "Your account is pending approval. Please wait for admin approval.",
        });
      }

      const token = jwt.sign(
        { user_id: user.user_id, user_type: "Mentor" },
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
        message: "Mentor login successful",
        user: {
          user_id: user.user_id,
          mentor_id: mentor.mentor_id,
          email: user.email,
          jwtToken: token,
        },
      });
    } catch (error) {
      console.error("Mentor login error:", error);
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
        SELECT mentor_id, user_id, bio, social_link, organization, is_approved
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

      // const baseUrl =
      //   process.env.NODE_ENV === "production"
      //     ? "https://evidently-handy-troll.ngrok-free.app"
      //     : "http://localhost:3000";

      const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
      const imageLink = `${baseUrl}/api/mentor/image/${mentor_id}`;

      const profile = {
        ...userData,
        mentor_id: mentorData.mentor_id,
        bio: mentorData.bio,
        social_link: mentorData.social_link,
        image_link: imageLink,
        organization: mentorData.organization,
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

    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 4MB limit
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

    upload.single("image")(req, res, async (err) => {
      if (err) {
        console.error("Multer error:", err.message);
        return res.status(400).json({ message: err.message });
      }

      try {
        const { name, email, gender, bio, social_link, organization } =
          req.body;
        const user = req.user;
        const file = req.file;

        if (!user) {
          return res
            .status(401)
            .json({ message: "Unauthorized: No user data" });
        }

        const user_id = user.user_id;

        console.log("Updating profile for user_id:", user_id);
        if (file) {
          console.log("Image details:", {
            size: file.buffer.length,
            mimetype: file.mimetype,
          });
        }

        const FIND_USER = `
          SELECT name, email, gender
          FROM Users
          WHERE user_id = ?
        `;
        const [userRows] = await pool.execute(FIND_USER, [user_id]);
        const existingUser = (userRows as User[])[0];
        if (!existingUser) {
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
        const updatedImageUrl = file ? file.buffer : existingMentor.image_url;
        const updatedOrganization =
          organization !== undefined && organization !== ""
            ? organization
            : existingMentor.organization;

        if (
          email !== undefined &&
          email !== "" &&
          email !== existingUser.email
        ) {
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

        if (file && file.buffer.length > 5 * 1024 * 1024) {
          console.error("Image size exceeds 4MB:", file.buffer.length);
          return res
            .status(400)
            .json({ message: "Image size exceeds 4MB limit" });
        }

        await connection.beginTransaction();

        const UPDATE_USER = `
          UPDATE Users
          SET name = ?, email = ?, gender = ?
          WHERE user_id = ?
        `;
        const [userResult] = await connection.execute(UPDATE_USER, [
          updatedName,
          updatedEmail,
          updatedGender,
          user_id,
        ]);
        if ((userResult as any).affectedRows === 0) {
          throw new Error("Failed to update user data");
        }

        const UPDATE_MENTOR = `
          UPDATE Mentors
          SET bio = ?, social_link = ?, image_url = ?, organization = ?
          WHERE user_id = ?
        `;
        console.log(
          "Executing UPDATE_MENTOR with image size:",
          updatedImageUrl?.length || 0
        );
        const [mentorResult] = await connection.execute(UPDATE_MENTOR, [
          updatedBio,
          updatedSocialLink,
          updatedImageUrl,
          updatedOrganization,
          user_id,
        ]);
        if ((mentorResult as any).affectedRows === 0) {
          throw new Error("Failed to update mentor data");
        }

        await connection.commit();
        console.log("Transaction committed successfully");

        const newToken = jwt.sign(
          { user_id, user_type: "Mentor", email: updatedEmail },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_IN }
        );

        res.status(200).json({
          message: "Profile updated successfully",
          user: { user_id, email: updatedEmail, new_token: newToken },
        });
      } catch (error) {
        console.error("Update profile error:", error);
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

  static async getAllMentors(req: Request, res: Response) {
    try {
      const GET_ALL_MENTORS = `
        SELECT
          u.user_id,
          m.mentor_id,
          u.name,
          u.email,
          u.username,
          u.user_type,
          u.gender,
          u.created_at AS user_created_at,
          m.bio,
          m.social_link,
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

      const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
      const mentorsWithImage = mentors.map((mentor) => ({
        ...mentor,
        image_link: `${baseUrl}/api/mentor/image/${mentor.mentor_id}`,
      }));

      res.status(200).json({
        message: "Registered mentors retrieved successfully",
        data: mentorsWithImage,
      });
    } catch (error) {
      console.error("Get all mentors error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }

  static async getMentorImage(req: AuthenticatedRequest, res: Response) {
    try {
      const { mentor_id } = req.params;

      if (!mentor_id) {
        return res.status(400).json({ message: "Mentor ID is required" });
      }

      const FIND_MENTOR_IMAGE = `
        SELECT image_url
        FROM Mentors
        WHERE mentor_id = ?
      `;
      const [rows] = await pool.execute(FIND_MENTOR_IMAGE, [mentor_id]);
      const mentor = (rows as { image_url: Buffer }[])[0];

      if (!mentor || !mentor.image_url) {
        return res.status(404).json({ message: "Image not found" });
      }

      res.set("Content-Type", "image/png");
      res.send(mentor.image_url);
    } catch (error) {
      console.error("Get mentor image error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }
}


*/

// import { Request, Response, NextFunction } from "express";
// import pool from "../../config/database";
// import jwt from "jsonwebtoken";
// import { JWT_SECRET, JWT_EXPIRES_IN } from "../../config/jwt";
// import bcrypt from "bcryptjs";
// import { v4 as uuidv4 } from "uuid";
// import multer from "multer";
// import { CookieOptions } from "express";
// import path from "path";

// interface User {
//   user_id: string;
//   name: string;
//   email: string;
//   username: string;
//   password_hash: string;
//   user_type: "Student" | "Mentor" | "Admin";
//   gender: "Male" | "Female" | null;
//   dob: Date | null;
//   graduation_year: number | null;
//   image_url: Buffer | null;
// }

// interface Mentor {
//   mentor_id: string;
//   user_id: string;
//   bio: string | null;
//   is_approved: boolean;
// }

// interface MentorSocial {
//   platform: "GitHub" | "LinkedIn" | "Twitter" | "Facebook" | null;
//   url: string | null;
// }

// interface MentorInfoType {
//   name: string;
//   email: string;
//   username: string;
//   gender: "Male" | "Female" | null;
//   bio: string;
//   grad_year: string;
//   socials: {
//     github: string;
//     facebook: string;
//     linkedin: string;
//     twitter: string;
//   };
//   dob: Date;
//   image_link: string;
// }

// interface AuthenticatedRequest extends Request {
//   user?: { user_id: string; user_type: string; email?: string };
// }

// // Configure multer for memory storage
// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
//   fileFilter: (req, file, cb) => {
//     const filetypes = /jpeg|jpg|png/;
//     const extname = filetypes.test(
//       path.extname(file.originalname).toLowerCase()
//     );
//     const mimetype = filetypes.test(file.mimetype);
//     if (extname && mimetype) {
//       return cb(null, true);
//     }
//     cb(new Error("Only JPEG/JPG/PNG images are allowed"));
//   },
// });

// export class MentorAuthController {
//   private static async findByEmail(email: string): Promise<User | null> {
//     const FIND_BY_EMAIL = `
//       SELECT user_id, name, email, username, password_hash, user_type, gender, dob, graduation_year, image_url
//       FROM Users
//       WHERE email = ?
//     `;
//     const [rows] = await pool.execute(FIND_BY_EMAIL, [email]);
//     return (rows as User[])[0] || null;
//   }

//   private static async findByUsername(username: string): Promise<User | null> {
//     const FIND_BY_USERNAME = `
//       SELECT user_id, name, email, username, password_hash, user_type, gender, dob, graduation_year, image_url
//       FROM Users
//       WHERE username = ?
//     `;
//     const [rows] = await pool.execute(FIND_BY_USERNAME, [username]);
//     return (rows as User[])[0] || null;
//   }

//   // JWT authentication middleware
//   static verifyToken = (
//     req: AuthenticatedRequest,
//     res: Response,
//     next: NextFunction
//   ) => {
//     const token = req.cookies.jwtToken;
//     if (!token) {
//       return res
//         .status(401)
//         .json({ message: "Unauthorized: No token provided" });
//     }
//     try {
//       const decoded = jwt.verify(token, JWT_SECRET) as {
//         user_id: string;
//         user_type: string;
//         email?: string;
//       };
//       if (decoded.user_type !== "Mentor") {
//         return res.status(403).json({ message: "Forbidden: Not a mentor" });
//       }
//       req.user = decoded;
//       next();
//     } catch (error) {
//       return res.status(401).json({ message: "Unauthorized: Invalid token" });
//     }
//   };

//   static async register(req: Request, res: Response) {
//     const connection = await pool.getConnection();

//     upload.single("image")(req, res, async (err) => {
//       if (err) {
//         console.error("Multer error:", err);
//         return res.status(400).json({ message: err.message });
//       }

//       try {
//         const {
//           name,
//           email,
//           username,
//           password,
//           gender,
//           bio,
//           grad_year,
//           dob,
//           socials,
//         } = req.body;
//         const file = req.file;
//         const user_id = uuidv4();
//         const mentor_id = uuidv4();
//         const hashedPassword = await bcrypt.hash(password, 10);

//         // Validate required fields
//         if (!name || !email || !username || !password) {
//           return res.status(400).json({ message: "Missing required fields" });
//         }

//         // Check for existing email or username
//         if (
//           (await MentorAuthController.findByEmail(email)) ||
//           (await MentorAuthController.findByUsername(username))
//         ) {
//           return res
//             .status(400)
//             .json({ message: "Username or email already exists" });
//         }

//         // Parse socials
//         let socialLinks: {
//           github?: string;
//           facebook?: string;
//           linkedin?: string;
//           twitter?: string;
//         } = {};
//         try {
//           socialLinks =
//             typeof socials === "string" ? JSON.parse(socials) : socials || {};
//         } catch (e) {
//           return res.status(400).json({ message: "Invalid socials format" });
//         }

//         await connection.beginTransaction();

//         // Insert into Users
//         const CREATE_USER = `
//           INSERT INTO Users (user_id, name, email, username, password_hash, user_type, gender, dob, graduation_year, image_url)
//           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//         `;
//         await connection.execute(CREATE_USER, [
//           user_id,
//           name,
//           email,
//           username,
//           hashedPassword,
//           "Mentor",
//           gender || null,
//           dob ? new Date(dob) : null,
//           grad_year ? parseInt(grad_year, 10) : null,
//           file ? file.buffer : null,
//         ]);

//         // Insert into Mentors
//         const CREATE_MENTOR = `
//           INSERT INTO Mentors (mentor_id, user_id, bio, is_approved)
//           VALUES (?, ?, ?, ?)
//         `;
//         await connection.execute(CREATE_MENTOR, [
//           mentor_id,
//           user_id,
//           bio || null,
//           false,
//         ]);

//         // Insert socials
//         const CREATE_SOCIAL = `
//           INSERT INTO Mentor_Socials (social_id, mentor_id, platform, url)
//           VALUES (?, ?, ?, ?)
//         `;
//         const socialPlatforms = [
//           { platform: "GitHub", url: socialLinks.github },
//           { platform: "LinkedIn", url: socialLinks.linkedin },
//           { platform: "Twitter", url: socialLinks.twitter },
//           { platform: "Facebook", url: socialLinks.facebook },
//         ];

//         for (const { platform, url } of socialPlatforms) {
//           if (url && url.trim()) {
//             await connection.execute(CREATE_SOCIAL, [
//               uuidv4(),
//               mentor_id,
//               platform,
//               url.trim(),
//             ]);
//           }
//         }

//         await connection.commit();

//         // Generate JWT
//         const token = jwt.sign(
//           { user_id, user_type: "Mentor", email },
//           JWT_SECRET,
//           { expiresIn: JWT_EXPIRES_IN }
//         );

//         const cookieOptions: CookieOptions = {
//           httpOnly: true,
//           secure: process.env.NODE_ENV === "production",
//           sameSite: "strict",
//           path: "/",
//         };
//         res.cookie("jwtToken", token, cookieOptions);

//         res.status(201).json({
//           success: true,
//           jwtToken: token,
//         });
//       } catch (error) {
//         console.error("Mentor register error:", error);
//         try {
//           await connection.rollback();
//         } catch (rollbackError) {
//           console.error("Rollback failed:", rollbackError);
//         }
//         res
//           .status(500)
//           .json({ message: "Server error", error: (error as any).message });
//       } finally {
//         connection.release();
//       }
//     });
//   }

//   static async login(req: Request, res: Response) {
//     try {
//       const { email, password } = req.body;

//       if (!email || !password) {
//         return res.status(400).json({ message: "Missing email or password" });
//       }

//       const user = await MentorAuthController.findByEmail(email);

//       if (
//         !user ||
//         !(await bcrypt.compare(password, user.password_hash)) ||
//         user.user_type !== "Mentor"
//       ) {
//         return res
//           .status(401)
//           .json({ message: "Invalid credentials or not a mentor" });
//       }

//       const FIND_MENTOR = `
//         SELECT mentor_id, is_approved FROM Mentors WHERE user_id = ?
//       `;
//       const [mentorRows] = await pool.execute(FIND_MENTOR, [user.user_id]);
//       const mentor = (
//         mentorRows as { mentor_id: string; is_approved: boolean }[]
//       )[0];

//       if (!mentor) {
//         return res.status(404).json({ message: "Mentor profile not found" });
//       }

//       if (!mentor.is_approved) {
//         return res.status(403).json({
//           message:
//             "Your account is pending approval. Please wait for admin approval.",
//         });
//       }

//       const token = jwt.sign(
//         { user_id: user.user_id, user_type: "Mentor", email: user.email },
//         JWT_SECRET,
//         { expiresIn: JWT_EXPIRES_IN }
//       );

//       const cookieOptions: CookieOptions = {
//         httpOnly: true,
//         secure: process.env.NODE_ENV === "production",
//         sameSite: "strict",
//         path: "/",
//       };
//       res.cookie("jwtToken", token, cookieOptions);

//       res.json({
//         success: true,
//         jwtToken: token,
//       });
//     } catch (error) {
//       console.error("Mentor login error:", error);
//       res.status(500).json({ message: "Server error" });
//     }
//   }

//   static async getMentorImage(req: AuthenticatedRequest, res: Response) {
//     try {
//       const { mentor_id } = req.params;

//       if (!mentor_id) {
//         return res.status(400).json({ message: "Mentor ID is required" });
//       }

//       const FIND_MENTOR_IMAGE = `
//         SELECT u.image_url
//         FROM Users u
//         JOIN Mentors m ON u.user_id = m.user_id
//         WHERE m.mentor_id = ?
//       `;
//       const [rows] = await pool.execute(FIND_MENTOR_IMAGE, [mentor_id]);
//       const mentor = (rows as { image_url: Buffer | null }[])[0];

//       if (!mentor || !mentor.image_url) {
//         return res.status(404).json({ message: "Image not found" });
//       }

//       res.set("Content-Type", "image/jpeg");
//       res.send(mentor.image_url);
//     } catch (error) {
//       console.error("Get mentor image error:", error);
//       res
//         .status(500)
//         .json({ message: "Server error", error: (error as any).message });
//     }
//   }

//   static async getMentorProfile(req: AuthenticatedRequest, res: Response) {
//     try {
//       const user = req.user;
//       if (!user || !user.user_id) {
//         return res.status(401).json({ message: "Unauthorized: No user data" });
//       }

//       // Fetch user and mentor data
//       const FIND_PROFILE = `
//         SELECT
//           u.user_id,
//           u.name,
//           u.email,
//           u.username,
//           u.gender,
//           u.dob,
//           u.graduation_year,
//           u.image_url,
//           m.mentor_id,
//           m.bio
//         FROM Users u
//         JOIN Mentors m ON u.user_id = m.user_id
//         WHERE u.user_id = ? AND u.user_type = 'Mentor'
//       `;
//       const [profileRows] = await pool.execute(FIND_PROFILE, [user.user_id]);
//       const profileData = (profileRows as (User & Mentor)[])[0];

//       if (!profileData) {
//         return res.status(404).json({ message: "Mentor profile not found" });
//       }

//       // Fetch socials
//       const FIND_SOCIALS = `
//         SELECT platform, url
//         FROM Mentor_Socials
//         WHERE mentor_id = ?
//       `;
//       const [socialRows] = await pool.execute(FIND_SOCIALS, [
//         profileData.mentor_id,
//       ]);
//       const socialsData = socialRows as MentorSocial[];

//       // Build socials object
//       const socials: MentorInfoType["socials"] = {
//         github: "",
//         facebook: "",
//         linkedin: "",
//         twitter: "",
//       };
//       for (const social of socialsData) {
//         if (social.platform === "GitHub") socials.github = social.url || "";
//         if (social.platform === "LinkedIn") socials.linkedin = social.url || "";
//         if (social.platform === "Twitter") socials.twitter = social.url || "";
//         if (social.platform === "Facebook") socials.facebook = social.url || "";
//       }

//       // Construct image link
//       const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
//       const image_link = profileData.image_url
//         ? `${baseUrl}/api/mentor/image/${profileData.mentor_id}`
//         : "";

//       // Build response
//       const mentorInfo: MentorInfoType = {
//         name: profileData.name || "",
//         email: profileData.email || "",
//         username: profileData.username || "",
//         gender: profileData.gender,
//         bio: profileData.bio || "",
//         grad_year: profileData.graduation_year
//           ? profileData.graduation_year.toString()
//           : "",
//         socials,
//         dob: profileData.dob || new Date(0),
//         image_link,
//       };

//       res.status(200).json({
//         success: true,
//         data: mentorInfo,
//       });
//     } catch (error) {
//       console.error("Get mentor profile error:", error);
//       res
//         .status(500)
//         .json({ message: "Server error", error: (error as any).message });
//     }
//   }
// }

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

interface Mentor {
  mentor_id: string;
  user_id: string;
  bio: string | null;
  is_approved: boolean;
}

interface MentorSocial {
  platform: "GitHub" | "LinkedIn" | "Twitter" | "Facebook" | null;
  url: string | null;
}

interface MentorInfoType {
  name: string;
  email: string;
  username: string;
  gender: "Male" | "Female" | null;
  bio: string;
  grad_year: string;
  socials: {
    github: string;
    facebook: string;
    linkedin: string;
    twitter: string;
  };
  dob: Date;
  image_link: string;
}

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

// Configure multer for memory storage
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

export class MentorAuthController {
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
        const {
          name,
          email,
          username,
          password,
          gender,
          bio,
          grad_year,
          dob,
          socials,
        } = req.body;
        const file = req.file;
        const user_id = uuidv4();
        const mentor_id = uuidv4();
        const hashedPassword = await bcrypt.hash(password, 10);

        // Validate required fields
        if (!name || !email || !username || !password) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        // Check for existing email or username
        if (
          (await MentorAuthController.findByEmail(email)) ||
          (await MentorAuthController.findByUsername(username))
        ) {
          return res
            .status(400)
            .json({ message: "Username or email already exists" });
        }

        // Parse socials
        let socialLinks: {
          github?: string;
          facebook?: string;
          linkedin?: string;
          twitter?: string;
        } = {};
        try {
          socialLinks =
            typeof socials === "string" ? JSON.parse(socials) : socials || {};
        } catch (e) {
          return res.status(400).json({ message: "Invalid socials format" });
        }

        await connection.beginTransaction();

        // Insert into Users
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
          "Mentor",
          gender || null,
          dob ? new Date(dob) : null,
          grad_year ? parseInt(grad_year, 10) : null,
          file ? file.buffer : null,
        ]);

        // Insert into Mentors
        const CREATE_MENTOR = `
          INSERT INTO Mentors (mentor_id, user_id, bio, is_approved)
          VALUES (?, ?, ?, ?)
        `;
        await connection.execute(CREATE_MENTOR, [
          mentor_id,
          user_id,
          bio || null,
          false,
        ]);

        // Insert socials
        const CREATE_SOCIAL = `
          INSERT INTO Mentor_Socials (social_id, mentor_id, platform, url)
          VALUES (?, ?, ?, ?)
        `;
        const socialPlatforms = [
          { platform: "GitHub", url: socialLinks.github },
          { platform: "LinkedIn", url: socialLinks.linkedin },
          { platform: "Twitter", url: socialLinks.twitter },
          { platform: "Facebook", url: socialLinks.facebook },
        ];

        for (const { platform, url } of socialPlatforms) {
          if (url && url.trim()) {
            await connection.execute(CREATE_SOCIAL, [
              uuidv4(),
              mentor_id,
              platform,
              url.trim(),
            ]);
          }
        }

        await connection.commit();

        // Generate JWT
        const token = jwt.sign(
          { user_id, user_type: "Mentor", email },
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
          mentor_id: mentor_id,
        });
      } catch (error) {
        console.error("Mentor register error:", error);
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

      const FIND_MENTOR = `
        SELECT mentor_id, is_approved FROM Mentors WHERE user_id = ?
      `;
      const [mentorRows] = await pool.execute(FIND_MENTOR, [user.user_id]);
      const mentor = (
        mentorRows as { mentor_id: string; is_approved: boolean }[]
      )[0];

      if (!mentor) {
        return res.status(404).json({ message: "Mentor profile not found" });
      }

      if (!mentor.is_approved) {
        return res.status(403).json({
          message:
            "Your account is pending approval. Please wait for admin approval.",
        });
      }

      const token = jwt.sign(
        { user_id: user.user_id, user_type: "Mentor", email: user.email },
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
        mentor_id: mentor.mentor_id,
      });
    } catch (error) {
      console.error("Mentor login error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  static async getMentorImage(req: AuthenticatedRequest, res: Response) {
    try {
      const { mentor_id } = req.params;

      if (!mentor_id) {
        return res.status(400).json({ message: "Mentor ID is required" });
      }

      const FIND_MENTOR_IMAGE = `
        SELECT u.image_url
        FROM Users u
        JOIN Mentors m ON u.user_id = m.user_id
        WHERE m.mentor_id = ?
      `;
      const [rows] = await pool.execute(FIND_MENTOR_IMAGE, [mentor_id]);
      const mentor = (rows as { image_url: Buffer | null }[])[0];

      if (!mentor || !mentor.image_url) {
        return res.status(404).json({ message: "Image not found" });
      }

      res.set("Content-Type", "image/jpeg");
      res.send(mentor.image_url);
    } catch (error) {
      console.error("Get mentor image error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }

  static async getMentorMyselfProfile(
    req: AuthenticatedRequest,
    res: Response
  ) {
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      // Fetch user and mentor data
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
          m.mentor_id,
          m.bio
        FROM Users u
        JOIN Mentors m ON u.user_id = m.user_id
        WHERE u.user_id = ? AND u.user_type = 'Mentor'
      `;
      const [profileRows] = await pool.execute(FIND_PROFILE, [user.user_id]);
      const profileData = (profileRows as (User & Mentor)[])[0];

      if (!profileData) {
        return res.status(404).json({ message: "Mentor profile not found" });
      }

      // Fetch socials
      const FIND_SOCIALS = `
        SELECT platform, url
        FROM Mentor_Socials
        WHERE mentor_id = ?
      `;
      const [socialRows] = await pool.execute(FIND_SOCIALS, [
        profileData.mentor_id,
      ]);
      const socialsData = socialRows as MentorSocial[];

      // Build socials object
      const socials: MentorInfoType["socials"] = {
        github: "",
        facebook: "",
        linkedin: "",
        twitter: "",
      };
      for (const social of socialsData) {
        if (social.platform === "GitHub") socials.github = social.url || "";
        if (social.platform === "LinkedIn") socials.linkedin = social.url || "";
        if (social.platform === "Twitter") socials.twitter = social.url || "";
        if (social.platform === "Facebook") socials.facebook = social.url || "";
      }

      // Construct image link
      const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
      const image_link = profileData.image_url
        ? `${baseUrl}/api/mentor/image/${profileData.mentor_id}`
        : "";

      // Build response
      const mentorInfo: MentorInfoType = {
        name: profileData.name || "",
        email: profileData.email || "",
        username: profileData.username || "",
        gender: profileData.gender,
        bio: profileData.bio || "",
        grad_year: profileData.graduation_year
          ? profileData.graduation_year.toString()
          : "",
        socials,
        dob: profileData.dob || new Date(0),
        image_link,
      };

      res.status(200).json({
        success: true,
        data: mentorInfo,
      });
    } catch (error) {
      console.error("Get mentor profile error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }

  // static async updateMentorProfile(req: AuthenticatedRequest, res: Response) {
  //   const connection = await pool.getConnection();

  //   upload.single("image")(req, res, async (err) => {
  //     if (err) {
  //       console.error("Multer error:", err);
  //       return res.status(400).json({ message: err.message });
  //     }

  //     try {
  //       const user = req.user;
  //       if (!user || !user.user_id) {
  //         return res
  //           .status(401)
  //           .json({ message: "Unauthorized: No user data" });
  //       }

  //       const {
  //         name,
  //         email,
  //         username,
  //         gender,
  //         grad_year,
  //         bio,
  //         socials,
  //         password,
  //         dob,
  //       } = req.body;
  //       const file = req.file;

  //       // Log req.body for debugging
  //       console.log("Request body:", req.body);

  //       // Fetch current user and mentor data
  //       const FIND_CURRENT_PROFILE = `
  //         SELECT
  //           u.user_id, u.name, u.email, u.username, u.gender, u.dob, u.graduation_year, u.image_url, u.password_hash,
  //           m.mentor_id, m.bio
  //         FROM Users u
  //         JOIN Mentors m ON u.user_id = m.user_id
  //         WHERE u.user_id = ?
  //       `;
  //       const [profileRows] = await connection.execute(FIND_CURRENT_PROFILE, [
  //         user.user_id,
  //       ]);
  //       const currentProfile = (profileRows as (User & Mentor)[])[0];
  //       if (!currentProfile) {
  //         return res.status(404).json({ message: "Mentor profile not found" });
  //       }

  //       // Fetch current socials
  //       const FIND_CURRENT_SOCIALS = `
  //         SELECT platform, url
  //         FROM Mentor_Socials
  //         WHERE mentor_id = ?
  //       `;
  //       const [socialRows] = await connection.execute(FIND_CURRENT_SOCIALS, [
  //         currentProfile.mentor_id,
  //       ]);
  //       const currentSocials = socialRows as MentorSocial[];

  //       // Build socials map for existing values
  //       const currentSocialsMap: { [key: string]: string | null } = {
  //         GitHub: null,
  //         LinkedIn: null,
  //         Twitter: null,
  //         Facebook: null,
  //       };
  //       for (const social of currentSocials) {
  //         if (social.platform) currentSocialsMap[social.platform] = social.url;
  //       }

  //       // Parse provided socials
  //       let socialLinks: {
  //         github?: string;
  //         facebook?: string;
  //         linkedin?: string;
  //         twitter?: string;
  //       } = {};
  //       if ("socials" in req.body && socials) {
  //         try {
  //           socialLinks =
  //             typeof socials === "string" ? JSON.parse(socials) : socials;
  //         } catch (e) {
  //           return res.status(400).json({ message: "Invalid socials format" });
  //         }
  //       }

  //       // Validate email and username uniqueness if provided
  //       if ("email" in req.body && email && email !== currentProfile.email) {
  //         const existingEmailUser = await MentorAuthController.findByEmail(
  //           email
  //         );
  //         if (existingEmailUser && existingEmailUser.user_id !== user.user_id) {
  //           return res.status(400).json({ message: "Email already exists" });
  //         }
  //       }
  //       if (
  //         "username" in req.body &&
  //         username &&
  //         username !== currentProfile.username
  //       ) {
  //         const existingUsernameUser =
  //           await MentorAuthController.findByUsername(username);
  //         if (
  //           existingUsernameUser &&
  //           existingUsernameUser.user_id !== user.user_id
  //         ) {
  //           return res.status(400).json({ message: "Username already exists" });
  //         }
  //       }

  //       await connection.beginTransaction();

  //       // Prepare update values, retaining existing values for omitted fields
  //       const updateValues = {
  //         name: "name" in req.body && name !== "" ? name : currentProfile.name,
  //         email:
  //           "email" in req.body && email !== "" ? email : currentProfile.email,
  //         username:
  //           "username" in req.body && username !== ""
  //             ? username
  //             : currentProfile.username,
  //         gender:
  //           "gender" in req.body && gender !== ""
  //             ? gender
  //             : currentProfile.gender,
  //         dob: "dob" in req.body && dob ? new Date(dob) : currentProfile.dob,
  //         graduation_year:
  //           "grad_year" in req.body && grad_year
  //             ? parseInt(grad_year, 10)
  //             : currentProfile.graduation_year,
  //         image_url: file ? file.buffer : currentProfile.image_url,
  //         password_hash:
  //           "password" in req.body && password
  //             ? await bcrypt.hash(password, 10)
  //             : currentProfile.password_hash,
  //         bio: "bio" in req.body && bio !== "" ? bio : currentProfile.bio,
  //       };

  //       // Update Users table
  //       const UPDATE_USER = `
  //         UPDATE Users
  //         SET
  //           name = ?,
  //           email = ?,
  //           username = ?,
  //           gender = ?,
  //           dob = ?,
  //           graduation_year = ?,
  //           image_url = ?,
  //           password_hash = ?
  //         WHERE user_id = ?
  //       `;
  //       await connection.execute(UPDATE_USER, [
  //         updateValues.name,
  //         updateValues.email,
  //         updateValues.username,
  //         updateValues.gender,
  //         updateValues.dob,
  //         updateValues.graduation_year,
  //         updateValues.image_url,
  //         updateValues.password_hash,
  //         user.user_id,
  //       ]);

  //       // Update Mentors table
  //       const UPDATE_MENTOR = `
  //         UPDATE Mentors
  //         SET bio = ?
  //         WHERE mentor_id = ?
  //       `;
  //       await connection.execute(UPDATE_MENTOR, [
  //         updateValues.bio,
  //         currentProfile.mentor_id,
  //       ]);

  //       // Update socials: only replace provided platforms
  //       const DELETE_SOCIALS = `
  //         DELETE FROM Mentor_Socials
  //         WHERE mentor_id = ? AND platform IN (?)
  //       `;
  //       const CREATE_SOCIAL = `
  //         INSERT INTO Mentor_Socials (social_id, mentor_id, platform, url)
  //         VALUES (?, ?, ?, ?)
  //       `;
  //       const providedSocials = [
  //         { platform: "GitHub", url: socialLinks.github },
  //         { platform: "LinkedIn", url: socialLinks.linkedin },
  //         { platform: "Twitter", url: socialLinks.twitter },
  //         { platform: "Facebook", url: socialLinks.facebook },
  //       ].filter(({ url }) => url !== undefined && url.trim() !== "");

  //       if (providedSocials.length > 0) {
  //         const platformsToUpdate = providedSocials.map(
  //           ({ platform }) => platform
  //         );
  //         await connection.execute(DELETE_SOCIALS, [
  //           currentProfile.mentor_id,
  //           platformsToUpdate,
  //         ]);

  //         for (const { platform, url } of providedSocials) {
  //           if (url && url.trim()) {
  //             await connection.execute(CREATE_SOCIAL, [
  //               uuidv4(),
  //               currentProfile.mentor_id,
  //               platform,
  //               url.trim(),
  //             ]);
  //           }
  //         }
  //       }

  //       await connection.commit();

  //       res.status(200).json({
  //         success: true,
  //       });
  //     } catch (error) {
  //       console.error("Update mentor profile error:", error);
  //       try {
  //         await connection.rollback();
  //       } catch (rollbackError) {
  //         console.error("Rollback failed:", rollbackError);
  //       }
  //       res
  //         .status(500)
  //         .json({ message: "Server error", error: (error as any).message });
  //     } finally {
  //       connection.release();
  //     }
  //   });
  // }

  static async updateMentorProfile(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      // connection = await pool.getConnection();

      await upload.single("image")(req, res, async (err) => {
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

          const {
            name,
            email,
            username,
            gender,
            grad_year,
            bio,
            socials,
            password,
            dob,
          } = req.body;
          const file = req.file;

          // Log req.body for debugging
          console.log("Request body:", req.body);

          // Fetch current user and mentor data
          const FIND_CURRENT_PROFILE = `
            SELECT 
              u.user_id, u.name, u.email, u.username, u.gender, u.dob, u.graduation_year, u.image_url, u.password_hash,
              m.mentor_id, m.bio
            FROM Users u
            JOIN Mentors m ON u.user_id = m.user_id
            WHERE u.user_id = ?
          `;
          const [profileRows] = await connection!.execute(
            FIND_CURRENT_PROFILE,
            [user.user_id]
          );
          const currentProfile = (profileRows as (User & Mentor)[])[0];
          if (!currentProfile) {
            return res
              .status(404)
              .json({ message: "Mentor profile not found" });
          }

          // Fetch current socials
          const FIND_CURRENT_SOCIALS = `
            SELECT platform, url
            FROM Mentor_Socials
            WHERE mentor_id = ?
          `;
          const [socialRows] = await connection!.execute(FIND_CURRENT_SOCIALS, [
            currentProfile.mentor_id,
          ]);
          const currentSocials = socialRows as MentorSocial[];

          // Build socials map for existing values
          const currentSocialsMap: { [key: string]: string | null } = {
            GitHub: null,
            LinkedIn: null,
            Twitter: null,
            Facebook: null,
          };
          for (const social of currentSocials) {
            if (social.platform)
              currentSocialsMap[social.platform] = social.url;
          }

          // Parse provided socials
          let socialLinks: {
            github?: string;
            facebook?: string;
            linkedin?: string;
            twitter?: string;
          } = {};
          if ("socials" in req.body && socials) {
            try {
              socialLinks =
                typeof socials === "string" ? JSON.parse(socials) : socials;
            } catch (e) {
              return res
                .status(400)
                .json({ message: "Invalid socials format" });
            }
          }

          // Validate email and username uniqueness if provided
          if ("email" in req.body && email && email !== currentProfile.email) {
            const existingEmailUser = await MentorAuthController.findByEmail(
              email
            );
            if (
              existingEmailUser &&
              existingEmailUser.user_id !== user.user_id
            ) {
              return res.status(400).json({ message: "Email already exists" });
            }
          }
          if (
            "username" in req.body &&
            username &&
            username !== currentProfile.username
          ) {
            const existingUsernameUser =
              await MentorAuthController.findByUsername(username);
            if (
              existingUsernameUser &&
              existingUsernameUser.user_id !== user.user_id
            ) {
              return res
                .status(400)
                .json({ message: "Username already exists" });
            }
          }

          await connection!.beginTransaction();

          // Prepare update values, retaining existing values for omitted fields
          const updateValues = {
            name:
              "name" in req.body && name !== "" ? name : currentProfile.name,
            email:
              "email" in req.body && email !== ""
                ? email
                : currentProfile.email,
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
            bio: "bio" in req.body && bio !== "" ? bio : currentProfile.bio,
          };

          // Update Users table
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
          await connection!.execute(UPDATE_USER, [
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

          // Update Mentors table
          const UPDATE_MENTOR = `
            UPDATE Mentors
            SET bio = ?
            WHERE mentor_id = ?
          `;
          await connection!.execute(UPDATE_MENTOR, [
            updateValues.bio,
            currentProfile.mentor_id,
          ]);

          // Update socials: only replace provided platforms
          const CREATE_SOCIAL = `
            INSERT INTO Mentor_Socials (social_id, mentor_id, platform, url)
            VALUES (?, ?, ?, ?)
          `;
          const providedSocials = [
            { platform: "GitHub", url: socialLinks.github },
            { platform: "LinkedIn", url: socialLinks.linkedin },
            { platform: "Twitter", url: socialLinks.twitter },
            { platform: "Facebook", url: socialLinks.facebook },
          ].filter(({ url }) => url !== undefined && url.trim() !== "");

          if (providedSocials.length > 0) {
            // Dynamically generate placeholders for IN clause
            const platformsToUpdate = providedSocials.map(
              ({ platform }) => platform
            );
            const placeholders = platformsToUpdate.map(() => "?").join(", ");
            const DELETE_SOCIALS = `
              DELETE FROM Mentor_Socials
              WHERE mentor_id = ? AND platform IN (${placeholders})
            `;
            await connection!.execute(DELETE_SOCIALS, [
              currentProfile.mentor_id,
              ...platformsToUpdate,
            ]);

            for (const { platform, url } of providedSocials) {
              if (url && url.trim()) {
                await connection!.execute(CREATE_SOCIAL, [
                  uuidv4(),
                  currentProfile.mentor_id,
                  platform,
                  url.trim(),
                ]);
              }
            }
          }

          await connection!.commit();

          res.status(200).json({
            success: true,
          });
        } catch (error) {
          console.error("Update mentor profile error:", error);
          try {
            await connection!.rollback();
          } catch (rollbackError) {
            console.error("Rollback failed:", rollbackError);
          }
          res
            .status(500)
            .json({ message: "Server error", error: (error as any).message });
        }
      });
    } catch (error) {
      console.error("Connection error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      if (connection) connection.release();
    }
  }
}
