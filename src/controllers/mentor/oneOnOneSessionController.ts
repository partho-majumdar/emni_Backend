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
  session_medium: ("online" | "offline")[];
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

interface UpdateSessionInput {
  title?: string;
  DurationInMinutes?: number;
  session_medium?: ("online" | "offline")[];
  Description?: string;
  Price?: number;
  type?:
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

  // static async updateSession(req: AuthenticatedRequest, res: Response) {
  //   const user_id = req.user?.user_id;
  //   const sessionId = req.params.sessionId;
  //   const {
  //     title,
  //     DurationInMinutes,
  //     session_medium,
  //     Description,
  //     Price,
  //     type,
  //   } = req.body as UpdateSessionInput;

  //   if (!user_id) {
  //     return res.status(401).json({ message: "Unauthorized: No user ID" });
  //   }

  //   if (!sessionId) {
  //     return res.status(400).json({ message: "Session ID is required" });
  //   }

  //   // Validate at least one field is provided for update
  //   if (
  //     !title &&
  //     !DurationInMinutes &&
  //     !session_medium &&
  //     !Description &&
  //     Price === undefined &&
  //     !type
  //   ) {
  //     return res
  //       .status(400)
  //       .json({ message: "At least one field must be provided for update" });
  //   }

  //   const connection = await pool.getConnection();
  //   try {
  //     await connection.beginTransaction();

  //     // Check if user is a mentor and owns the session
  //     const [mentorRows] = await connection.execute(
  //       `SELECT m.mentor_id
  //        FROM Mentors m
  //        JOIN Sessions s ON m.mentor_id = s.mentor_id
  //        WHERE m.user_id = ? AND s.session_id = ?`,
  //       [user_id, sessionId]
  //     );
  //     const mentor = (mentorRows as any[])[0];
  //     if (!mentor) {
  //       await connection.rollback();
  //       return res.status(403).json({
  //         message: "Unauthorized: Only the session's mentor can update it",
  //       });
  //     }

  //     // Build update query dynamically based on provided fields
  //     const updates: string[] = [];
  //     const values: any[] = [];

  //     if (title) {
  //       updates.push("session_title = ?");
  //       values.push(title);
  //     }
  //     if (DurationInMinutes !== undefined) {
  //       if (DurationInMinutes <= 0) {
  //         await connection.rollback();
  //         return res
  //           .status(400)
  //           .json({ message: "Duration must be a positive number" });
  //       }
  //       updates.push("duration_mins = ?");
  //       values.push(DurationInMinutes);
  //     }
  //     if (session_medium && Array.isArray(session_medium)) {
  //       const isOnline = session_medium.includes("online");
  //       const isOffline = session_medium.includes("offline");
  //       if (!isOnline && !isOffline) {
  //         await connection.rollback();
  //         return res.status(400).json({
  //           message: "Session medium must include 'online' or 'offline'",
  //         });
  //       }
  //       updates.push("is_online = ?, is_offline = ?");
  //       values.push(isOnline ? 1 : 0, isOffline ? 1 : 0);
  //     }
  //     if (Description) {
  //       updates.push("description = ?");
  //       values.push(Description);
  //     }
  //     if (Price !== undefined) {
  //       if (Price < 0) {
  //         await connection.rollback();
  //         return res.status(400).json({ message: "Price cannot be negative" });
  //       }
  //       updates.push("price = ?");
  //       values.push(Price);
  //     }
  //     if (type) {
  //       updates.push("type = ?");
  //       values.push(type);
  //     }

  //     if (updates.length === 0) {
  //       await connection.rollback();
  //       return res.status(400).json({ message: "No valid fields to update" });
  //     }

  //     values.push(sessionId);
  //     const UPDATE_SESSION = `
  //       UPDATE Sessions
  //       SET ${updates.join(", ")}
  //       WHERE session_id = ?
  //     `;

  //     const [result] = await connection.execute(UPDATE_SESSION, values);

  //     if ((result as any).affectedRows === 0) {
  //       await connection.rollback();
  //       return res.status(404).json({ message: "Session not found" });
  //     }

  //     await connection.commit();
  //     res.status(200).json({
  //       success: true,
  //       message: "Session updated successfully",
  //       sessionId,
  //     });
  //   } catch (error) {
  //     await connection.rollback();
  //     console.error("Update session error:", error);
  //     res.status(500).json({ message: "Server error" });
  //   } finally {
  //     connection.release();
  //   }
  // }

  // static async deleteSession(req: AuthenticatedRequest, res: Response) {
  //   const user_id = req.user?.user_id;
  //   const sessionId = req.params.sessionId;

  //   if (!user_id) {
  //     return res.status(401).json({ message: "Unauthorized: No user ID" });
  //   }

  //   if (!sessionId) {
  //     return res.status(400).json({ message: "Session ID is required" });
  //   }

  //   const connection = await pool.getConnection();
  //   try {
  //     await connection.beginTransaction();

  //     // Check if user is a mentor and owns the session
  //     const [mentorRows] = await connection.execute(
  //       `SELECT m.mentor_id
  //        FROM Mentors m
  //        JOIN Sessions s ON m.mentor_id = s.mentor_id
  //        WHERE m.user_id = ? AND s.session_id = ?`,
  //       [user_id, sessionId]
  //     );
  //     const mentor = (mentorRows as any[])[0];
  //     if (!mentor) {
  //       await connection.rollback();
  //       return res.status(403).json({
  //         message: "Unauthorized: Only the session's mentor can delete it",
  //       });
  //     }

  //     const DELETE_SESSION = `
  //       DELETE FROM Sessions
  //       WHERE session_id = ?
  //     `;
  //     const [result] = await connection.execute(DELETE_SESSION, [sessionId]);

  //     if ((result as any).affectedRows === 0) {
  //       await connection.rollback();
  //       return res.status(404).json({ message: "Session not found" });
  //     }

  //     await connection.commit();
  //     res.status(200).json({
  //       success: true,
  //       message: "Session deleted successfully",
  //       sessionId,
  //     });
  //   } catch (error) {
  //     await connection.rollback();
  //     console.error("Delete session error:", error);
  //     res.status(500).json({ message: "Server error" });
  //   } finally {
  //     connection.release();
  //   }
  // }

  static async getSessionListForParticularMentor(
    req: AuthenticatedRequest,
    res: Response
  ) {
    const user_id = req.user?.user_id;

    // Authentication check using token from header
    if (!user_id) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No valid authentication token" });
    }

    const connection = await pool.getConnection();
    try {
      // Fetch mentor_id from Mentors table using authenticated user_id
      const [mentorRows] = await connection.execute(
        "SELECT mentor_id FROM Mentors WHERE user_id = ?",
        [user_id]
      );
      const mentor = (mentorRows as any[])[0];
      if (!mentor) {
        return res.status(403).json({ message: "User is not a mentor" });
      }
      const mentorId = mentor.mentor_id;

      // Fetch all sessions for this mentor along with mentor details
      const [sessionRows] = await connection.execute(
        `SELECT 
          s.session_id,
          s.mentor_id,
          u.name AS mentor_name,
          m.image_url,
          s.type,
          s.session_title AS title,
          s.duration_mins,
          s.is_online,
          s.is_offline,
          s.description
        FROM Sessions s
        JOIN Mentors m ON s.mentor_id = m.mentor_id
        JOIN Users u ON m.user_id = u.user_id
        WHERE s.mentor_id = ?`,
        [mentorId]
      );

      const sessions = (sessionRows as any[]).map((row) => {
        const session_medium: ("online" | "offline")[] = [];
        if (row.is_online) session_medium.push("online");
        if (row.is_offline) session_medium.push("offline");

        const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
        const mentorImageLink = row.image_url
          ? `${baseUrl}/api/mentor/image/${row.mentor_id}`
          : "";

        return {
          sessionId: row.session_id,
          mentorId: row.mentor_id,
          mentorName: row.mentor_name,
          mentorImageLink,
          type: row.type,
          title: row.title,
          DurationInMinutes: row.duration_mins,
          session_medium,
          Description: row.description,
        } as SessionInfo;
      });

      res.status(200).json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      console.error("Get sessions list error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }
}
