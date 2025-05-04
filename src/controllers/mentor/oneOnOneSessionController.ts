import { Request, Response } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

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

interface SessionInfo {
  sessionId: string;
  mentorId: string;
  mentorName: string;
  mentorImageLink: string;
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

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    if (
      !title ||
      !DurationInMinutes ||
      !session_medium ||
      !Array.isArray(session_medium) ||
      session_medium.length === 0 ||
      !Description ||
      Price === undefined ||
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

      const [mentorDetailsRows] = await connection.execute(
        `SELECT u.name, u.image_url
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

      const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
      // const baseUrl = "http://localhost:5000";
      const mentorImageLink = mentorDetails.image_url
        ? `${baseUrl}/api/mentor/image/${mentor_id}`
        : "";

      const sessionInfo: SessionInfo = {
        sessionId: session_id,
        mentorId: mentor_id,
        mentorName: mentorDetails.name,
        mentorImageLink: mentorImageLink,
        type: type,
        title: title,
        DurationInMinutes: DurationInMinutes,
        session_medium: session_medium,
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

  static async updateSession(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const sessionId = req.params.sessionId;
    const {
      title,
      DurationInMinutes,
      session_medium,
      Description,
      Price,
      type,
    } = req.body as UpdateSessionInput;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    if (!sessionId) {
      return res.status(400).json({ message: "Session ID is required" });
    }

    // Validate at least one field is provided for update
    if (
      !title &&
      !DurationInMinutes &&
      !session_medium &&
      !Description &&
      Price === undefined &&
      !type
    ) {
      return res
        .status(400)
        .json({ message: "At least one field must be provided for update" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if user is a mentor and owns the session
      const [mentorRows] = await connection.execute(
        `SELECT m.mentor_id
         FROM Mentors m
         JOIN Sessions s ON m.mentor_id = s.mentor_id
         WHERE m.user_id = ? AND s.session_id = ?`,
        [user_id, sessionId]
      );
      const mentor = (mentorRows as any[])[0];
      if (!mentor) {
        await connection.rollback();
        return res.status(403).json({
          message: "Unauthorized: Only the session's mentor can update it",
        });
      }

      // Build update query dynamically based on provided fields
      const updates: string[] = [];
      const values: any[] = [];

      if (title) {
        updates.push("session_title = ?");
        values.push(title);
      }
      if (DurationInMinutes !== undefined) {
        if (DurationInMinutes <= 0) {
          await connection.rollback();
          return res
            .status(400)
            .json({ message: "Duration must be a positive number" });
        }
        updates.push("duration_mins = ?");
        values.push(DurationInMinutes);
      }
      if (session_medium && Array.isArray(session_medium)) {
        const isOnline = session_medium.includes("online");
        const isOffline = session_medium.includes("offline");
        if (!isOnline && !isOffline) {
          await connection.rollback();
          return res.status(400).json({
            message: "Session medium must include 'online' or 'offline'",
          });
        }
        updates.push("is_online = ?, is_offline = ?");
        values.push(isOnline ? 1 : 0, isOffline ? 1 : 0);
      }
      if (Description) {
        updates.push("description = ?");
        values.push(Description);
      }
      if (Price !== undefined) {
        if (Price < 0) {
          await connection.rollback();
          return res.status(400).json({ message: "Price cannot be negative" });
        }
        updates.push("price = ?");
        values.push(Price);
      }
      if (type) {
        updates.push("type = ?");
        values.push(type);
      }

      if (updates.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: "No valid fields to update" });
      }

      values.push(sessionId);
      const UPDATE_SESSION = `
        UPDATE Sessions
        SET ${updates.join(", ")}
        WHERE session_id = ?
      `;

      const [result] = await connection.execute(UPDATE_SESSION, values);

      if ((result as any).affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Session not found" });
      }

      await connection.commit();
      res.status(200).json({
        success: true,
        message: "Session updated successfully",
        sessionId,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Update session error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }

  static async deleteSession(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const sessionId = req.params.sessionId;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    if (!sessionId) {
      return res.status(400).json({ message: "Session ID is required" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Verify mentor owns the session
      const [mentorRows] = await connection.execute(
        `SELECT m.mentor_id
         FROM Mentors m
         JOIN Sessions s ON m.mentor_id = s.mentor_id
         WHERE m.user_id = ? AND s.session_id = ?`,
        [user_id, sessionId]
      );

      if ((mentorRows as any[]).length === 0) {
        await connection.rollback();
        return res.status(403).json({
          message: "Unauthorized: Only the session's mentor can delete it",
        });
      }

      // 2. Delete all One_On_One_Sessions records for this session
      await connection.execute(
        `DELETE o FROM One_On_One_Sessions o
         JOIN Mentor_Availability a ON o.availability_id = a.availability_id
         WHERE a.session_id = ?`,
        [sessionId]
      );

      // 3. Reset availability slots (set is_booked = 0 and clear session_id)
      await connection.execute(
        `UPDATE Mentor_Availability 
         SET is_booked = 0,
             session_id = NULL,
             status = 'Upcoming'
         WHERE session_id = ?`,
        [sessionId]
      );

      // 4. Delete the session itself
      const [result] = await connection.execute(
        `DELETE FROM Sessions WHERE session_id = ?`,
        [sessionId]
      );

      if ((result as any).affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Session not found" });
      }

      await connection.commit();
      res.status(200).json({
        success: true,
        message: "Session deleted and time slots made available again",
        sessionId,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Delete session error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }

  static async getSessionListForParticularMentor(
    req: AuthenticatedRequest,
    res: Response
  ) {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No valid authentication token" });
    }

    const connection = await pool.getConnection();
    try {
      const [mentorRows] = await connection.execute(
        "SELECT mentor_id FROM Mentors WHERE user_id = ?",
        [user_id]
      );
      const mentor = (mentorRows as any[])[0];
      if (!mentor) {
        return res.status(403).json({ message: "User is not a mentor" });
      }
      const mentorId = mentor.mentor_id;

      const [sessionRows] = await connection.execute(
        `SELECT 
          s.session_id,
          s.mentor_id,
          u.name AS mentor_name,
          u.image_url,
          s.type,
          s.session_title AS title,
          s.duration_mins,
          s.is_online,
          s.is_offline,
          s.description,
          s.price
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
        // const baseUrl = "http://localhost:5000";
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
          Price: row.price,
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

  static async getSessionById(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const sessionId = req.params.sessionId;

    if (!user_id) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No valid authentication token" });
    }

    if (!sessionId) {
      return res.status(400).json({ message: "Session ID is required" });
    }

    const connection = await pool.getConnection();
    try {
      const [sessionRows] = await connection.execute(
        `SELECT 
          s.session_id,
          s.mentor_id,
          u.name AS mentor_name,
          u.image_url,
          s.type,
          s.session_title AS title,
          s.duration_mins,
          s.is_online,
          s.is_offline,
          s.description
        FROM Sessions s
        JOIN Mentors m ON s.mentor_id = m.mentor_id
        JOIN Users u ON m.user_id = u.user_id
        WHERE s.session_id = ?`,
        [sessionId]
      );

      const sessionData = (sessionRows as any[])[0];
      if (!sessionData) {
        return res.status(404).json({ message: "Session not found" });
      }

      const session_medium: ("online" | "offline")[] = [];
      if (sessionData.is_online) session_medium.push("online");
      if (sessionData.is_offline) session_medium.push("offline");

      const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
      // const baseUrl = "http://localhost:5000";
      const mentorImageLink = sessionData.image_url
        ? `${baseUrl}/api/mentor/image/${sessionData.mentor_id}`
        : "";

      const sessionInfo: SessionInfo = {
        sessionId: sessionData.session_id,
        mentorId: sessionData.mentor_id,
        mentorName: sessionData.mentor_name,
        mentorImageLink,
        type: sessionData.type,
        title: sessionData.title,
        DurationInMinutes: sessionData.duration_mins,
        session_medium,
        Description: sessionData.description,
      };

      res.status(200).json({
        success: true,
        data: sessionInfo,
      });
    } catch (error) {
      console.error("Get session by ID error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }

  static async getInterestBasedSessionsForStudent(
    req: AuthenticatedRequest,
    res: Response
  ) {
    const user_id = req.user?.user_id;
    const connection = await pool.getConnection();

    try {
      if (!user_id) {
        return res
          .status(401)
          .json({ message: "Unauthorized: No valid authentication token" });
      }

      // Verify the user is a student
      const [studentRows] = await connection.execute(
        "SELECT student_id FROM Students WHERE user_id = ?",
        [user_id]
      );

      if (!Array.isArray(studentRows) || studentRows.length === 0) {
        return res
          .status(403)
          .json({ message: "User is not a registered student" });
      }

      const [interestRows] = await connection.execute(
        `SELECT i.interest_id
         FROM User_Interests ui
         JOIN Interests i ON ui.interest_id = i.interest_id
         WHERE ui.user_id = ?`,
        [user_id]
      );

      if (!Array.isArray(interestRows) || interestRows.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          message:
            "No interests found for this student. Please add interests to your profile",
        });
      }

      const interestIds = (interestRows as { interest_id: string }[]).map(
        (row) => row.interest_id
      );

      const [sessionRows] = await connection.execute(
        `SELECT DISTINCT
          s.session_id AS sessionId,
          s.mentor_id AS mentorId,
          u.name AS mentorName,
          u.image_url AS mentorImage,
          s.type,
          s.session_title AS title,
          s.duration_mins AS DurationInMinutes,
          s.is_online,
          s.is_offline,
          s.description,
          s.price,
          s.created_at
        FROM Sessions s
        JOIN Mentors m ON s.mentor_id = m.mentor_id
        JOIN Users u ON m.user_id = u.user_id
        JOIN User_Interests ui ON m.user_id = ui.user_id
        WHERE ui.interest_id IN (${interestIds.map(() => "?").join(",")})
        ORDER BY s.created_at ASC`,
        [...interestIds]
      );

      const sessions = (sessionRows as any[]).map((row) => {
        const session_medium: ("online" | "offline")[] = [];
        if (row.is_online) session_medium.push("online");
        if (row.is_offline) session_medium.push("offline");

        const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
        // const baseUrl = "http://localhost:5000";
        const mentorImageLink = row.mentorImage
          ? `${baseUrl}/api/mentor/image/${row.mentorId}`
          : "";

        return {
          sessionId: row.sessionId,
          mentorId: row.mentorId,
          mentorName: row.mentorName,
          mentorImageLink,
          type: row.type,
          title: row.title,
          DurationInMinutes: row.DurationInMinutes,
          session_medium,
          Description: row.description,
          Price: row.price,
        } as SessionInfo;
      });

      res.status(200).json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      console.error("Get interest-based sessions error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }

  static async getNonInterestBasedSessionsForStudent(
    req: AuthenticatedRequest,
    res: Response
  ) {
    const user_id = req.user?.user_id;
    const connection = await pool.getConnection();

    try {
      if (!user_id) {
        return res
          .status(401)
          .json({ message: "Unauthorized: No valid authentication token" });
      }

      const [studentRows] = await connection.execute(
        "SELECT student_id FROM Students WHERE user_id = ?",
        [user_id]
      );

      if (!Array.isArray(studentRows) || studentRows.length === 0) {
        return res
          .status(403)
          .json({ message: "User is not a registered student" });
      }

      const [interestRows] = await connection.execute(
        `SELECT i.interest_id
         FROM User_Interests ui
         JOIN Interests i ON ui.interest_id = i.interest_id
         WHERE ui.user_id = ?`,
        [user_id]
      );

      let sessions;
      const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
      // const baseUrl = "http://localhost:5000";

      if (!Array.isArray(interestRows) || interestRows.length === 0) {
        const [allSessionRows] = await connection.execute(
          `SELECT 
            s.session_id AS sessionId,
            s.mentor_id AS mentorId,
            u.name AS mentorName,
            u.image_url AS mentorImage,
            s.type,
            s.session_title AS title,
            s.duration_mins AS DurationInMinutes,
            s.is_online,
            s.is_offline,
            s.description,
            s.price
          FROM Sessions s
          JOIN Mentors m ON s.mentor_id = m.mentor_id
          JOIN Users u ON m.user_id = u.user_id`
        );

        sessions = (allSessionRows as any[]).map((row) => {
          const session_medium: ("online" | "offline")[] = [];
          if (row.is_online) session_medium.push("online");
          if (row.is_offline) session_medium.push("offline");

          const mentorImageLink = row.mentorImage
            ? `${baseUrl}/api/mentor/image/${row.mentorId}`
            : "";

          return {
            sessionId: row.sessionId,
            mentorId: row.mentorId,
            mentorName: row.mentorName,
            mentorImageLink,
            type: row.type,
            title: row.title,
            DurationInMinutes: row.DurationInMinutes,
            session_medium,
            Description: row.description,
            Price: row.price,
          } as SessionInfo;
        });
      } else {
        const interestIds = (interestRows as { interest_id: string }[]).map(
          (row) => row.interest_id
        );

        const [nonInterestSessionRows] = await connection.execute(
          `SELECT 
            s.session_id AS sessionId,
            s.mentor_id AS mentorId,
            u.name AS mentorName,
            u.image_url AS mentorImage,
            s.type,
            s.session_title AS title,
            s.duration_mins AS DurationInMinutes,
            s.is_online,
            s.is_offline,
            s.description,
            s.price
          FROM Sessions s
          JOIN Mentors m ON s.mentor_id = m.mentor_id
          JOIN Users u ON m.user_id = u.user_id
          WHERE s.mentor_id NOT IN (
            SELECT DISTINCT m2.mentor_id
            FROM Mentors m2
            JOIN User_Interests ui ON m2.user_id = ui.user_id
            WHERE ui.interest_id IN (${interestIds.map(() => "?").join(",")})
          )
          ORDER BY s.created_at ASC`,
          [...interestIds]
        );

        sessions = (nonInterestSessionRows as any[]).map((row) => {
          const session_medium: ("online" | "offline")[] = [];
          if (row.is_online) session_medium.push("online");
          if (row.is_offline) session_medium.push("offline");

          const mentorImageLink = row.mentorImage
            ? `${baseUrl}/api/mentor/image/${row.mentorId}`
            : "";

          return {
            sessionId: row.sessionId,
            mentorId: row.mentorId,
            mentorName: row.mentorName,
            mentorImageLink,
            type: row.type,
            title: row.title,
            DurationInMinutes: row.DurationInMinutes,
            session_medium,
            Description: row.description,
            Price: row.price,
          } as SessionInfo;
        });
      }

      res.status(200).json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      console.error("Get non-interest-based sessions error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }
}
