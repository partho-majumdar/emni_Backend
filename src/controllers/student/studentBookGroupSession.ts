import { Request, Response } from "express";
import pool from "../../config/database";
import { RowDataPacket } from "mysql2";

// Interface for request body
interface GroupSessionRequest {
  GroupSessionId: string;
  ParticipantId: string;
}

// Interface for response data
interface GroupSessionResponse {
  success: boolean;
  participants?: {
    current: number;
    max: number;
  };
}

// Interface for participant info
interface GroupSessionParticipantInfo {
  id: string;
  name: string;
  photoLink: string;
  joinedAt: string;
  status: "registered" | "cancelled" | "completed" | "waiting";
}

// Interface for participant list response
interface ParticipantListResponse {
  success: boolean;
  data: GroupSessionParticipantInfo[];
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
    const { GroupSessionId, ParticipantId } = req.body as GroupSessionRequest;

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

      // Step 2: Validate group session exists and get participant counts
      const [groupSessionRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT 
          gs.group_session_id, 
          gs.max_participants,
          (SELECT COUNT(*) FROM Group_Session_Participants gsp 
           WHERE gsp.group_session_id = gs.group_session_id 
           AND gsp.status = 'registered') AS current_registered,
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

      // Step 3: Check if student is already a participant
      const [participantRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT group_session_id, student_id, status
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
          message: `Student is already a participant in this group session with status '${participantRows[0].status}'`,
        });
      }

      // Step 4: Determine status based on participant count
      const status =
        groupSession.current_registered < groupSession.max_participants
          ? "registered"
          : "waiting";

      // Step 5: Insert new record in Group_Session_Participants
      const [insertResult] = await pool.query(
        `
        INSERT INTO Group_Session_Participants (group_session_id, student_id, joined_at, status)
        VALUES (?, ?, NOW(), ?)
        `,
        [GroupSessionId, ParticipantId, status]
      );
      console.log("Inserted into Group_Session_Participants:", insertResult);

      // Step 6: Get updated participant count
      const [updatedParticipants] = await pool.query<RowDataPacket[]>(
        `
        SELECT 
          max_participants,
          (SELECT COUNT(*) FROM Group_Session_Participants gsp 
           WHERE gsp.group_session_id = ? AND gsp.status = 'registered') AS current_registered
        FROM Group_Sessions
        WHERE group_session_id = ?
        `,
        [GroupSessionId, GroupSessionId]
      );

      await pool.query("COMMIT");

      // Prepare response data
      const responseData: GroupSessionResponse = {
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

  static async cancelRegistration(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.user_id;
    const { GroupSessionId, ParticipantId } = req.body as GroupSessionRequest;

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

      // Step 2: Verify group session exists and get max_participants
      const [groupSessionRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT group_session_id, title, max_participants
        FROM Group_Sessions
        WHERE group_session_id = ?
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

      // Step 3: Check if participant exists and is not already cancelled
      const [participantRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT status
        FROM Group_Session_Participants
        WHERE group_session_id = ? AND student_id = ?
        `,
        [GroupSessionId, ParticipantId]
      );
      console.log("Participant check:", participantRows);
      if (participantRows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Participant not found in this group session",
        });
      }
      if (participantRows[0].status === "cancelled") {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Participant registration is already cancelled",
        });
      }

      // Step 4: Update participant status to cancelled
      const [updateResult] = await pool.query(
        `
        UPDATE Group_Session_Participants
        SET status = 'cancelled'
        WHERE group_session_id = ? AND student_id = ?
        `,
        [GroupSessionId, ParticipantId]
      );
      console.log("Updated participant status to cancelled:", updateResult);

      // Step 5: Get updated participant count
      const [updatedParticipants] = await pool.query<RowDataPacket[]>(
        `
        SELECT 
          max_participants,
          (SELECT COUNT(*) FROM Group_Session_Participants gsp 
           WHERE gsp.group_session_id = ? AND gsp.status = 'registered') AS current_registered
        FROM Group_Sessions
        WHERE group_session_id = ?
        `,
        [GroupSessionId, GroupSessionId]
      );
      //   console.log("Updated participant count:", updatedParticipants);

      await pool.query("COMMIT");

      // Prepare response
      const response: GroupSessionResponse = {
        success: true,
      };

      console.log("Transaction committed, returning data:", response);
      res.status(200).json(response);
    } catch (error: any) {
      await pool.query("ROLLBACK");
      console.error("Error cancelling registration:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }

  static async getRegisteredParticipantList(
    req: AuthenticatedRequest,
    res: Response
  ) {
    const groupSessionId = req.params.gsid;
    const userId = req.user?.user_id;

    if (!userId) {
      console.log("Unauthorized: No user ID in JWT token");
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!groupSessionId) {
      console.log("Invalid input: GroupSessionId missing");
      return res
        .status(400)
        .json({ success: false, message: "Group Session ID is required" });
    }

    try {
      // Verify group session exists
      const [sessionRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT group_session_id, title
        FROM Group_Sessions
        WHERE group_session_id = ?
        `,
        [groupSessionId]
      );
      console.log("Group session check:", sessionRows);
      if (sessionRows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Group session not found" });
      }

      // Fetch participants
      const [participantRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT 
          s.student_id AS id,
          u.name,
          u.image_url,
          gsp.joined_at AS joinedAt,
          gsp.status
        FROM Group_Session_Participants gsp
        JOIN Students s ON gsp.student_id = s.student_id
        JOIN Users u ON s.user_id = u.user_id
        WHERE gsp.group_session_id = ?
        ORDER BY gsp.joined_at ASC
        `,
        [groupSessionId]
      );
      console.log("Participants fetched:", participantRows);

      const baseUrl = "https://evidently-handy-troll.ngrok-free.app";

      // Map to GroupSessionParticipantInfo
      const participants: GroupSessionParticipantInfo[] = participantRows.map(
        (row) => ({
          id: row.id,
          name: row.name,
          photoLink: row.image_url
            ? `${baseUrl}/api/student/image/${row.id}`
            : "",
          joinedAt: new Date(row.joinedAt).toISOString(),
          status: row.status,
        })
      );

      // Construct response
      const response: ParticipantListResponse = {
        success: true,
        data: participants,
      };

      console.log("Returning participant list:", response);
      res.status(200).json(response);
    } catch (error: any) {
      console.error("Error fetching participant list:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
}
