import { Request, Response } from "express";
import pool from "../../config/database";
import { RowDataPacket } from "mysql2";

interface GroupSessionRequest {
  GroupSessionId: string;
  ParticipantId: string;
}

interface GroupSessionResponse {
  success: boolean;
  data?: {
    participants?: {
      current: number;
      max: number;
    };
    status?: "registered" | "waiting";
  };
  message?: string;
}

interface GroupSessionParticipantInfo {
  id: string;
  name: string;
  photoLink: string;
  joinedAt: string;
  status: "registered" | "cancelled" | "completed" | "waiting";
  points: number;
  email: string;
}

interface ParticipantListResponse {
  success: boolean;
  data: GroupSessionParticipantInfo[];
  message?: string;
}

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type?: string };
}

export class BookGroupSessionController {
  static async bookGroupSession(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.user_id;
    const { GroupSessionId, ParticipantId } = req.body as GroupSessionRequest;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!GroupSessionId || !ParticipantId) {
      return res.status(400).json({
        success: false,
        message: "Group Session ID and Participant ID are required",
      });
    }

    try {
      await pool.query("START TRANSACTION");

      const [studentRows] = await pool.query<RowDataPacket[]>(
        "SELECT student_id, user_id FROM Students WHERE student_id = ? AND user_id = ?",
        [ParticipantId, userId]
      );
      if (studentRows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(403).json({
          success: false,
          message: "Invalid student ID or unauthorized user",
        });
      }

      const [groupSessionRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT 
          group_session_id, 
          max_participants,
          (SELECT COUNT(*) FROM Group_Session_Participants gsp 
           WHERE gsp.group_session_id = gs.group_session_id 
           AND gsp.status = 'registered') AS current_registered,
          title
        FROM Group_Sessions gs
        WHERE gs.group_session_id = ?
        `,
        [GroupSessionId]
      );
      if (groupSessionRows.length === 0) {
        await pool.query("ROLLBACK");
        return res
          .status(404)
          .json({ success: false, message: "Group session not found" });
      }
      const groupSession = groupSessionRows[0];

      const [participantRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT group_session_id, student_id, status
        FROM Group_Session_Participants
        WHERE group_session_id = ? AND student_id = ?
        `,
        [GroupSessionId, ParticipantId]
      );
      if (participantRows.length > 0) {
        if (participantRows[0].status === "cancelled") {
          await pool.query(
            `
            DELETE FROM Group_Session_Participants
            WHERE group_session_id = ? AND student_id = ?
            `,
            [GroupSessionId, ParticipantId]
          );
        } else {
          await pool.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: `Student is already a participant with status '${participantRows[0].status}'`,
          });
        }
      }

      const status =
        groupSession.current_registered < groupSession.max_participants
          ? "registered"
          : "waiting";

      await pool.query(
        `
        INSERT INTO Group_Session_Participants (group_session_id, student_id, joined_at, status)
        VALUES (?, ?, NOW(), ?)
        `,
        [GroupSessionId, ParticipantId, status]
      );

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

      const response: GroupSessionResponse = {
        success: true,
        data: {
          participants: {
            current: updatedParticipants[0].current_registered,
            max: updatedParticipants[0].max_participants,
          },
          status,
        },
      };

      res.status(200).json(response);
    } catch (error: any) {
      await pool.query("ROLLBACK");
      console.error("Error booking group session:", error);
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(400).json({
          success: false,
          message: "Student is already a participant",
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
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!GroupSessionId || !ParticipantId) {
      return res.status(400).json({
        success: false,
        message: "Group Session ID and Participant ID are required",
      });
    }

    try {
      await pool.query("START TRANSACTION");

      const [studentRows] = await pool.query<RowDataPacket[]>(
        "SELECT student_id, user_id FROM Students WHERE student_id = ? AND user_id = ?",
        [ParticipantId, userId]
      );
      if (studentRows.length === 0) {
        await pool.query("ROLLBACK");
        return res.status(403).json({
          success: false,
          message: "Invalid student ID or unauthorized user",
        });
      }

      const [groupSessionRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT group_session_id, max_participants
        FROM Group_Sessions
        WHERE group_session_id = ?
        `,
        [GroupSessionId]
      );
      if (groupSessionRows.length === 0) {
        await pool.query("ROLLBACK");
        return res
          .status(404)
          .json({ success: false, message: "Group session not found" });
      }
      const groupSession = groupSessionRows[0];

      const [participantRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT status
        FROM Group_Session_Participants
        WHERE group_session_id = ? AND student_id = ?
        `,
        [GroupSessionId, ParticipantId]
      );
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

      await pool.query(
        `
        UPDATE Group_Session_Participants
        SET status = 'cancelled'
        WHERE group_session_id = ? AND student_id = ?
        `,
        [GroupSessionId, ParticipantId]
      );

      const [waitingParticipants] = await pool.query<RowDataPacket[]>(
        `
        SELECT student_id
        FROM Group_Session_Participants
        WHERE group_session_id = ? AND status = 'waiting'
        ORDER BY joined_at ASC
        LIMIT 1
        `,
        [GroupSessionId]
      );

      const [currentRegistered] = await pool.query<RowDataPacket[]>(
        `
        SELECT COUNT(*) AS current_registered
        FROM Group_Session_Participants
        WHERE group_session_id = ? AND status = 'registered'
        `,
        [GroupSessionId]
      );

      if (
        waitingParticipants.length > 0 &&
        currentRegistered[0].current_registered < groupSession.max_participants
      ) {
        await pool.query(
          `
          UPDATE Group_Session_Participants
          SET status = 'registered'
          WHERE group_session_id = ? AND student_id = ?
          `,
          [GroupSessionId, waitingParticipants[0].student_id]
        );
      }

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

      const response: GroupSessionResponse = {
        success: true,
        data: {
          participants: {
            current: updatedParticipants[0].current_registered,
            max: updatedParticipants[0].max_participants,
          },
        },
      };

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
    const userType = req.user?.user_type;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!groupSessionId) {
      return res
        .status(400)
        .json({ success: false, message: "Group Session ID is required" });
    }

    try {
      let isAuthorized = false;
      
      if (userType === "Mentor") {
        // Simplified mentor authorization check
        const [sessionRows] = await pool.query<RowDataPacket[]>(
          `
          SELECT 1
          FROM Group_Sessions gs
          INNER JOIN Mentors m ON gs.mentor_id = m.mentor_id
          WHERE gs.group_session_id = ? AND m.user_id = ?
          `,
          [groupSessionId, userId]
        );
        isAuthorized = sessionRows.length > 0;
        
      } else if (userType === "Student") {
        // Check if student is enrolled in the group session
        const [participantRows] = await pool.query<RowDataPacket[]>(
          `
          SELECT 1
          FROM Group_Session_Participants gsp
          INNER JOIN Students s ON gsp.student_id = s.student_id
          WHERE gsp.group_session_id = ? AND s.user_id = ?
          `,
          [groupSessionId, userId]
        );
        isAuthorized = participantRows.length > 0;
      }

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized access to participant list",
        });
      }

      // Get participant list
      const [participantRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT 
          s.student_id AS id,
          u.name,
          u.image_url,
          u.email,
          gsp.joined_at AS joinedAt,
          gsp.status
        FROM Group_Session_Participants gsp
        INNER JOIN Students s ON gsp.student_id = s.student_id
        INNER JOIN Users u ON s.user_id = u.user_id
        WHERE gsp.group_session_id = ?
        ORDER BY gsp.joined_at ASC
        `,
        [groupSessionId]
      );

      const baseUrl = "http://localhost:3000";
      const participants: GroupSessionParticipantInfo[] = participantRows.map(
        (row) => ({
          id: row.id,
          name: row.name,
          photoLink: row.image_url
            ? `${baseUrl}/api/student/image/${row.id}`
            : "",
          joinedAt: new Date(row.joinedAt).toISOString(),
          status: row.status,
          points: Math.floor(Math.random() * 100),
          email: row.email,
        })
      );

      const response: ParticipantListResponse = {
        success: true,
        data: participants,
      };

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
