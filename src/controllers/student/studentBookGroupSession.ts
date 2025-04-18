import { Request, Response } from "express";
import pool from "../../config/database";
import { RowDataPacket } from "mysql2";

// Interface for request body
interface BookGroupSessionRequest {
  GroupSessionId: string;
  ParticipantId: string;
}

// Interface for response data
interface BookGroupSessionResponse {
  success: boolean;
  participants?: {
    current: number;
    max: number;
  };
}

// Define JwtPayload for JWT authentication
interface JwtPayload {
  user_id: string;
  user_type?: string;
}

// Extend Request for type safety
interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export class BookGroupSessionController {
  static async bookGroupSession(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.user_id;
    const { GroupSessionId, ParticipantId } =
      req.body as BookGroupSessionRequest;

    if (!userId) {
      console.log("Unauthorized: No user ID in JWT token");
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!GroupSessionId || !ParticipantId) {
      console.log("Invalid input: GroupSessionId or ParticipantId missing");
      return res.status(400).json({
        success: false,
        message: "Group Session ID and Participant ID are required",
      });
    }

    try {
      await pool.query("START TRANSACTION");

      // Step 1: Verify student exists and matches the authenticated user
      const [studentRows] = await pool.query<RowDataPacket[]>(
        "SELECT student_id, user_id FROM Students WHERE student_id = ? AND user_id = ?",
        [ParticipantId, userId]
      );
      console.log("Student check:", studentRows);
      if (studentRows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(403).json({
          success: false,
          message: "Invalid student ID or unauthorized user",
        });
      }
      const student = studentRows[0];

      // Step 2: Validate group session exists and has available slots
      const [groupSessionRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT 
          gs.group_session_id, 
          gs.max_participants,
          (SELECT COUNT(*) FROM Group_Session_Participants gsp WHERE gsp.group_session_id = gs.group_session_id) AS current_participants,
          gs.title
        FROM Group_Sessions gs
        WHERE gs.group_session_id = ?
        `,
        [GroupSessionId]
      );
      console.log("Group session check:", groupSessionRows);
      if (groupSessionRows.length === 0) {
        await pool.query("ROLLBACK");
        return res
          .status(404)
          .json({ success: false, message: "Group session not found" });
      }
      const groupSession = groupSessionRows[0];

      if (groupSession.current_participants >= groupSession.max_participants) {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: `Group session '${groupSession.title}' is full (max ${groupSession.max_participants} participants)`,
        });
      }

      // Step 3: Check if student is already a participant
      const [participantRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT group_session_id, student_id
        FROM Group_Session_Participants
        WHERE group_session_id = ? AND student_id = ?
        `,
        [GroupSessionId, ParticipantId]
      );
      console.log("Existing participant check:", participantRows);
      if (participantRows.length > 0) {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Student is already a participant in this group session",
        });
      }

      // Step 4: Insert new record in Group_Session_Participants
      const [insertResult] = await pool.query(
        `
        INSERT INTO Group_Session_Participants (group_session_id, student_id, joined_at)
        VALUES (?, ?, NOW())
        `,
        [GroupSessionId, ParticipantId]
      );
      console.log("Inserted into Group_Session_Participants:", insertResult);

      // Step 5: Get updated participant count
      const [updatedParticipants] = await pool.query<RowDataPacket[]>(
        `
        SELECT 
          max_participants,
          (SELECT COUNT(*) FROM Group_Session_Participants gsp WHERE gsp.group_session_id = ?) AS current_participants
        FROM Group_Sessions
        WHERE group_session_id = ?
        `,
        [GroupSessionId, GroupSessionId]
      );
      console.log("Updated participant count:", updatedParticipants);

      await pool.query("COMMIT");

      // Prepare response data
      const responseData: BookGroupSessionResponse = {
        success: true,
      };

      console.log("Transaction committed, returning data:", responseData);
      res.status(200).json(responseData);
    } catch (error: any) {
      await pool.query("ROLLBACK");
      console.error("Error booking group session:", error);
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(400).json({
          success: false,
          message: "Student is already a participant in this group session",
        });
      }
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
}
