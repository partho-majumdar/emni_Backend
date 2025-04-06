import { Request, Response } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";

class OneOnOneSessionController {
  static async createSession(req: Request, res: Response) {
    const { session_title, type, description, duration_mins, price, medium } =
      req.body;

    const mentor_id = (req as any).user?.user_id;

    if (
      !session_title ||
      !type ||
      !description ||
      !duration_mins ||
      !price ||
      !medium
    ) {
      return res.status(400).json({
        error: "All fields are required",
        required_fields: {
          session_title: "string",
          type: "Course Topic Tuition | Project Help | Career Guidance | Competition Prep | Productivity | ECA",
          description: "string",
          duration_mins: "number (minutes)",
          price: "number",
          medium: "Online | Offline",
        },
      });
    }

    try {
      const [mentorCheck]: any[] = await pool.query(
        "SELECT mentor_id FROM Mentors WHERE user_id = ?",
        [mentor_id]
      );

      if (!mentorCheck || mentorCheck.length === 0) {
        return res.status(403).json({
          error: "User is not registered as a mentor",
          solution: "Complete mentor registration first",
        });
      }

      const mentor_id_from_db = mentorCheck[0].mentor_id;

      const session_id = uuidv4();
      await pool.query(
        `INSERT INTO Sessions (
          session_id, mentor_id, session_title, type,
          description, duration_mins, price, medium
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session_id,
          mentor_id_from_db,
          session_title,
          type,
          description,
          duration_mins,
          price,
          medium,
        ]
      );

      res.status(201).json({
        message: "Session created successfully",
      });
    } catch (error: any) {
      console.error("Error creating session:", error);

      if (error.code === "ER_NO_REFERENCED_ROW_2") {
        return res.status(400).json({
          error: "Invalid mentor reference",
          details: "The mentor record doesn't exist or is invalid",
          solution: "Ensure the user is properly registered as a mentor",
        });
      }

      res.status(500).json({
        error: "Internal server error",
        details: error.message,
      });
    }
  }

  static async getSession(req: Request, res: Response) {
    const mentor_id = (req as any).user?.user_id;

    try {
      const [mentorCheck]: any[] = await pool.query(
        "SELECT mentor_id FROM Mentors WHERE user_id = ?",
        [mentor_id]
      );

      if (!mentorCheck || mentorCheck.length === 0) {
        return res.status(403).json({
          error: "User is not registered as a mentor",
          solution: "Complete mentor registration first",
        });
      }

      const mentor_id_from_db = mentorCheck[0].mentor_id;

      const [sessions]: any[] = await pool.query(
        `SELECT
          s.session_id as sessionId,
          s.mentor_id,
          s.session_title as title,
          s.type,
          s.description,
          s.duration_mins as DurationInMinutes,
          s.price as Price,
          s.medium
        FROM Sessions s
        WHERE s.mentor_id = ?
        ORDER BY s.created_at DESC`,
        [mentor_id_from_db]
      );

      if (!Array.isArray(sessions) || sessions.length === 0) {
        return res.status(200).json({
          message: "No sessions found for this mentor",
          sessions: [],
        });
      }

      res.status(200).json({
        sessions: sessions.map((session) => ({
          sessionId: session.sessionId,
          mentor_id: session.mentor_id,
          title: session.title,
          type: session.type,
          description: session.description,
          DurationInMinutes: session.DurationInMinutes,
          Price: session.Price,
          session_medium: session.medium,
        })),
      });
    } catch (error: any) {
      console.error("Error fetching mentor sessions:", error);
      res.status(500).json({
        error: "Internal server error",
        details: error.message,
      });
    }
  }
}

export default OneOnOneSessionController;
