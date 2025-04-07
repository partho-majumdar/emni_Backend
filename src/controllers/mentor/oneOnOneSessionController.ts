import { Request, Response } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

// Request body interface for creating a new session
interface SessionInput {
  title: string;
  DurationInMinutes: number;
  session_medium: ("online" | "offline")[]; // Array to support both
  Description: string;
  Price: number;
  type:
    | "Course Topic Tuition"
    | "Project Help"
    | "Career Guidance"
    | "Competition Prep"
    | "Productivity"
    | "ECA"
    | "Resume Review"
    | "Research Guidance"
    | "Mock Interview";
}

// Response data interface for the newly created session
interface SessionInfo {
  sessionId: string;
  mentorId: string;
  mentorName: string;
  mentorImageLink: string; // URL string following the pattern /api/mentor/image/:mentorId
  type:
    | "Course Topic Tuition"
    | "Project Help"
    | "Career Guidance"
    | "Competition Prep"
    | "Productivity"
    | "ECA"
    | "Resume Review"
    | "Research Guidance"
    | "Mock Interview";
  title: string;
  DurationInMinutes: number;
  session_medium: ("online" | "offline")[];
  Description: string;
}

export class oneOnOneSessionController {
  // POST /api/sessions/new
  static async createSession(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const {
      title,
      DurationInMinutes,
      session_medium,
      Description,
      Price,
      type,
    } = req.body as SessionInput;

    // Authentication check
    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    // Validation of required fields
    if (
      !title ||
      !DurationInMinutes ||
      !session_medium ||
      !Array.isArray(session_medium) ||
      session_medium.length === 0 ||
      !Description ||
      Price === undefined || // Price can be 0, so check for undefined
      !type
    ) {
      return res
        .status(400)
        .json({ message: "Missing or invalid required fields" });
    }

    if (DurationInMinutes <= 0) {
      return res
        .status(400)
        .json({ message: "Duration must be a positive number" });
    }

    if (Price < 0) {
      return res.status(400).json({ message: "Price cannot be negative" });
    }

    const isOnline = session_medium.includes("online");
    const isOffline = session_medium.includes("offline");
    if (!isOnline && !isOffline) {
      return res
        .status(400)
        .json({ message: "Session medium must include 'online' or 'offline'" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if user is a mentor and fetch mentor_id
      const [mentorRows] = await connection.execute(
        "SELECT mentor_id FROM Mentors WHERE user_id = ?",
        [user_id]
      );
      const mentor = (mentorRows as any[])[0];
      if (!mentor) {
        await connection.rollback();
        return res
          .status(403)
          .json({ message: "Only mentors can create sessions" });
      }
      const mentor_id = mentor.mentor_id;

      // Fetch mentor details (name from Users, image_url from Mentors)
      const [mentorDetailsRows] = await connection.execute(
        `SELECT u.name, m.image_url 
         FROM Mentors m 
         JOIN Users u ON m.user_id = u.user_id 
         WHERE m.mentor_id = ?`,
        [mentor_id]
      );
      const mentorDetails = (mentorDetailsRows as any[])[0];
      if (!mentorDetails) {
        await connection.rollback();
        return res.status(500).json({ message: "Mentor details not found" });
      }

      // Insert new session
      const session_id = uuidv4();
      const INSERT_SESSION = `
        INSERT INTO Sessions (
          session_id, mentor_id, session_title, type, description, 
          duration_mins, price, is_online, is_offline, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;
      await connection.execute(INSERT_SESSION, [
        session_id,
        mentor_id,
        title,
        type,
        Description,
        DurationInMinutes,
        Price,
        isOnline ? 1 : 0,
        isOffline ? 1 : 0,
      ]);

      await connection.commit();

      // Construct the mentorImageLink using the same base URL pattern as getGroupSessionsByMentorId
      const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
      const mentorImageLink = mentorDetails.image_url
        ? `${baseUrl}/api/mentor/image/${mentor_id}`
        : "";

      // Prepare response
      const sessionInfo: SessionInfo = {
        sessionId: session_id,
        mentorId: mentor_id,
        mentorName: mentorDetails.name,
        mentorImageLink: mentorImageLink,
        type: type,
        title: title,
        DurationInMinutes: DurationInMinutes,
        session_medium: session_medium, // Return original array from request
        Description: Description,
      };

      res.status(201).json({
        success: true,
        data: sessionInfo,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Create session error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }
}
