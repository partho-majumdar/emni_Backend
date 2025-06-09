import { Request, Response, NextFunction } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";
import cron from "node-cron";
import { RowDataPacket } from "mysql2";

// Add missing type for group session info
type GroupSessionInfoType = {
  id: string;
  title: string;
  description: string;
  startTime: Date;
  durationInMinutes: number;
  mentor: {
    id: string;
    name: string;
    photoLink: string;
  };
  participants: {
    current: number;
    max: number;
  };
  previewParticipants: {
    id: string;
    name: string;
    photoLink: string;
  }[];
  platform_link: string;
};

interface GroupSessionRequest {
  title: string;
  description: string;
  durationInMinutes: number;
  startTime: string;
  maxParticipant: number;
  platform_link: string;
}

interface MentorInfo {
  mentor_id: string;
  name: string;
  image_url: string;
}

interface ParticipantPreview {
  id: string;
  name: string;
  photoLink: string;
}

interface GroupSession {
  id: string;
  title: string;
  description: string;
  durationInMinutes: number;
  startTime: string;
  mentor: {
    id: string;
    name: string;
    photoLink: string;
  };
  participants: {
    current: number;
    max: number;
  };
  platform_link: string;
  status: string;
  previewParticipants?: ParticipantPreview[];
}

interface GroupSessionResponse {
  success: boolean;
  data: GroupSession;
}

interface GroupSessionListResponse {
  success: boolean;
  data: GroupSession[];
}

// const BASE_URL = "https://evidently-handy-troll.ngrok-free.app";
const BASE_URL = "http://localhost:3000";

class GroupSessionController {
  private static async getMentorInfo(
    userId: string
  ): Promise<MentorInfo | null> {
    const [mentorRows]: any[] = await pool.query(
      `SELECT m.mentor_id, u.name, u.image_url
       FROM Mentors m
       JOIN Users u ON m.user_id = u.user_id
       WHERE m.user_id = ?`,
      [userId]
    );
    return mentorRows?.[0] || null;
  }

  private static validateSessionRequest(
    req: GroupSessionRequest
  ): string | null {
    if (
      !req.title ||
      !req.description ||
      !req.durationInMinutes ||
      !req.startTime ||
      !req.maxParticipant ||
      !req.platform_link
    ) {
      return "Missing required fields";
    }

    const sessionDate = new Date(req.startTime);
    if (isNaN(sessionDate.getTime())) {
      return "Invalid date format for startTime. Use ISO 8601 (e.g., '2025-04-08T10:00:00Z')";
    }

    if (req.durationInMinutes <= 0 || req.maxParticipant <= 0) {
      return "durationInMinutes and maxParticipant must be positive numbers";
    }

    return null;
  }

  static async createGroupSession(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const sessionReq = req.body as GroupSessionRequest;
      const userId = (req as any).user?.user_id;

      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const validationError =
        GroupSessionController.validateSessionRequest(sessionReq);
      if (validationError) {
        res.status(400).json({ success: false, error: validationError });
        return;
      }

      const mentor = await GroupSessionController.getMentorInfo(userId);
      if (!mentor) {
        res.status(403).json({
          success: false,
          error: "User is not a registered mentor",
        });
        return;
      }

      const sessionDate = new Date(sessionReq.startTime);
      const groupSessionId = uuidv4();

      await pool.query(
        `INSERT INTO Group_Sessions (
          group_session_id, mentor_id, title, description,
          session_date, duration_mins, max_participants, platform, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Upcoming')`,
        [
          groupSessionId,
          mentor.mentor_id,
          sessionReq.title,
          sessionReq.description,
          sessionDate,
          sessionReq.durationInMinutes,
          sessionReq.maxParticipant,
          sessionReq.platform_link,
        ]
      );

      const response: GroupSessionResponse = {
        success: true,
        data: {
          id: groupSessionId,
          title: sessionReq.title,
          description: sessionReq.description,
          durationInMinutes: sessionReq.durationInMinutes,
          startTime: sessionDate.toISOString(),
          mentor: {
            id: mentor.mentor_id,
            name: mentor.name,
            photoLink: mentor.image_url
              ? `${BASE_URL}/api/mentor/image/${mentor.mentor_id}`
              : "",
          },
          participants: {
            current: 0,
            max: sessionReq.maxParticipant,
          },
          platform_link: sessionReq.platform_link,
          status: "Upcoming",
        },
      };

      res.status(201).json(response);
    } catch (error: any) {
      console.error("Error creating group session:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message,
      });
    }
  }

  static async updateGroupSession(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { groupSessionId } = req.params;
      const updates = req.body as Partial<GroupSessionRequest>;
      const userId = (req as any).user?.user_id;

      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const [sessionRows]: any[] = await pool.query(
        `SELECT gs.*
         FROM Group_Sessions gs
         JOIN Mentors m ON gs.mentor_id = m.mentor_id
         WHERE gs.group_session_id = ? AND m.user_id = ?`,
        [groupSessionId, userId]
      );

      if (!sessionRows?.length) {
        res.status(404).json({
          success: false,
          error: "Group session not found or no permission to edit",
        });
        return;
      }

      const currentSession = sessionRows[0];
      const updateFields: Record<string, any> = {};
      const updateValues: any[] = [];

      if (updates.title !== undefined && updates.title !== "") {
        updateFields.title = updates.title;
        updateValues.push(updates.title);
      } else if (updates.title === "") {
        updateFields.title = currentSession.title;
        updateValues.push(currentSession.title);
      }

      if (updates.description !== undefined && updates.description !== "") {
        updateFields.description = updates.description;
        updateValues.push(updates.description);
      } else if (updates.description === "") {
        updateFields.description = currentSession.description;
        updateValues.push(currentSession.description);
      }

      if (updates.durationInMinutes !== undefined) {
        if (updates.durationInMinutes <= 0) {
          res.status(400).json({
            success: false,
            error: "durationInMinutes must be positive",
          });
          return;
        }
        updateFields.duration_mins = updates.durationInMinutes;
        updateValues.push(updates.durationInMinutes);
      }

      if (updates.startTime !== undefined && updates.startTime !== "") {
        const sessionDate = new Date(updates.startTime);
        if (isNaN(sessionDate.getTime())) {
          res.status(400).json({
            success: false,
            error: "Invalid date format for startTime",
          });
          return;
        }
        updateFields.session_date = sessionDate;
        updateValues.push(sessionDate);
      } else if (updates.startTime === "") {
        updateFields.session_date = currentSession.session_date;
        updateValues.push(currentSession.session_date);
      }

      if (updates.maxParticipant !== undefined) {
        if (updates.maxParticipant <= 0) {
          res.status(400).json({
            success: false,
            error: "maxParticipant must be positive",
          });
          return;
        }
        updateFields.max_participants = updates.maxParticipant;
        updateValues.push(updates.maxParticipant);
      }

      if (updates.platform_link !== undefined && updates.platform_link !== "") {
        updateFields.platform = updates.platform_link;
        updateValues.push(updates.platform_link);
      } else if (updates.platform_link === "") {
        updateFields.platform = currentSession.platform;
        updateValues.push(currentSession.platform);
      }

      if (Object.keys(updateFields).length === 0) {
        res.status(400).json({
          success: false,
          error: "No valid fields provided for update",
        });
        return;
      }

      const setClause = Object.keys(updateFields)
        .map((field) => `${field} = ?`)
        .join(", ");

      await pool.query(
        `UPDATE Group_Sessions SET ${setClause} WHERE group_session_id = ?`,
        [...updateValues, groupSessionId]
      );

      res.status(200).json({
        success: true,
        message: "Session updated successfully",
      });
    } catch (error: any) {
      console.error("Error updating group session:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message,
      });
    }
  }

  // static async updateGroupSessionStatuses() {
  //   try {
  //     await pool.query("START TRANSACTION");

  //     await pool.query(
  //       `UPDATE Group_Sessions
  //        SET status = 'Ongoing'
  //        WHERE status = 'Upcoming'
  //        AND NOW() BETWEEN session_date AND DATE_ADD(session_date, INTERVAL duration_mins MINUTE)`
  //     );

  //     await pool.query(
  //       `UPDATE Group_Sessions
  //        SET status = 'Completed'
  //        WHERE status IN ('Upcoming', 'Ongoing')
  //        AND NOW() > DATE_ADD(session_date, INTERVAL duration_mins MINUTE)`
  //     );

  //     await pool.query("COMMIT");
  //     return { success: true, message: "Group Session Statuses updated" };
  //   } catch (error: any) {
  //     await pool.query("ROLLBACK");
  //     return { success: false, message: error.message };
  //   }
  // }

  static async getGroupSessionsByMentorId(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const mentorId = req.params.mID;

      if (!mentorId) {
        res.status(400).json({ success: false, error: "Mentor ID required" });
        return;
      }

      const [mentorRows]: any[] = await pool.query(
        `SELECT m.mentor_id, u.name, u.image_url
         FROM Mentors m
         JOIN Users u ON m.user_id = u.user_id
         WHERE m.mentor_id = ?`,
        [mentorId]
      );

      if (!mentorRows?.length) {
        res.status(404).json({ success: false, error: "Mentor not found" });
        return;
      }

      const mentor = mentorRows[0];
      const [sessionRows]: any[] = await pool.query(
        `SELECT
          gs.group_session_id AS id,
          gs.title,
          gs.description,
          gs.duration_mins AS durationInMinutes,
          gs.session_date AS startTime,
          gs.max_participants AS maxParticipants,
          gs.platform AS platform_link,
          gs.status,
          (SELECT COUNT(*) FROM Group_Session_Participants
           WHERE group_session_id = gs.group_session_id
           AND status = 'registered') AS currentParticipants
         FROM Group_Sessions gs
         WHERE gs.mentor_id = ?`,
        [mentorId]
      );

      const sessionIds = sessionRows.map((row: any) => row.id);
      const participantsBySession: Record<string, ParticipantPreview[]> = {};

      if (sessionIds.length > 0) {
        const [participantRows]: any[] = await pool.query(
          `SELECT
            gsp.group_session_id,
            s.student_id AS id,
            u.name,
            u.image_url
           FROM Group_Session_Participants gsp
           JOIN Students s ON gsp.student_id = s.student_id
           JOIN Users u ON s.user_id = u.user_id
           WHERE gsp.group_session_id IN (?)
           AND gsp.status = 'registered'
           ORDER BY gsp.joined_at ASC
           LIMIT 5`,
          [sessionIds]
        );

        participantRows.forEach((participant: any) => {
          const sessionId = participant.group_session_id;
          if (!participantsBySession[sessionId]) {
            participantsBySession[sessionId] = [];
          }
          if (participantsBySession[sessionId].length < 5) {
            participantsBySession[sessionId].push({
              id: participant.id,
              name: participant.name,
              photoLink: participant.image_url
                ? `${BASE_URL}/api/student/image/${participant.id}`
                : "",
            });
          }
        });
      }

      const response: GroupSessionListResponse = {
        success: true,
        data: sessionRows.map((row: any) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          durationInMinutes: row.durationInMinutes,
          startTime: new Date(row.startTime).toISOString(),
          mentor: {
            id: mentor.mentor_id,
            name: mentor.name,
            photoLink: mentor.image_url
              ? `${BASE_URL}/api/mentor/image/${mentor.mentor_id}`
              : "",
          },
          participants: {
            current: parseInt(row.currentParticipants, 10),
            max: row.maxParticipants,
          },
          platform_link: row.platform_link,
          status: row.status,
          previewParticipants: participantsBySession[row.id] || [],
        })),
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error("Error fetching group sessions:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message,
      });
    }
  }

  // In GroupSessionController.ts
  static async deleteGroupSession(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const groupSessionId = req.params.groupSessionId;
      const userId = (req as any).user?.user_id;

      if (!groupSessionId) {
        res.status(400).json({ success: false, error: "Session ID required" });
        return;
      }

      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const mentor = await GroupSessionController.getMentorInfo(userId);
      if (!mentor) {
        res.status(403).json({
          success: false,
          error: "User is not a mentor",
        });
        return;
      }

      const [sessionRows]: any[] = await pool.query(
        `SELECT
        gs.group_session_id AS id,
        gs.title,
        gs.description,
        gs.duration_mins AS durationInMinutes,
        gs.session_date AS startTime,
        gs.mentor_id,
        gs.max_participants AS maxParticipants,
        gs.platform AS platform_link,
        COUNT(gsp.student_id) AS currentParticipants
       FROM Group_Sessions gs
       LEFT JOIN Group_Session_Participants gsp 
       ON gs.group_session_id = gsp.group_session_id
       AND gsp.status IN ('registered', 'waiting')
       WHERE gs.group_session_id = ?
       GROUP BY gs.group_session_id`,
        [groupSessionId]
      );

      if (!sessionRows?.length) {
        res.status(404).json({
          success: false,
          error: "Session not found",
        });
        return;
      }

      const session = sessionRows[0];
      if (session.mentor_id !== mentor.mentor_id) {
        res.status(403).json({
          success: false,
          error: "Not authorized to delete this session",
        });
        return;
      }

      if (session.currentParticipants > 0) {
        res.status(403).json({
          success: false,
          error: "Cannot delete session with enrolled participants",
        });
        return;
      }

      await pool.query(
        `DELETE FROM Group_Sessions WHERE group_session_id = ?`,
        [groupSessionId]
      );

      const response: GroupSessionResponse = {
        success: true,
        data: {
          id: session.id,
          title: session.title,
          description: session.description,
          durationInMinutes: session.durationInMinutes,
          startTime: new Date(session.startTime).toISOString(),
          mentor: {
            id: mentor.mentor_id,
            name: mentor.name,
            photoLink: mentor.image_url
              ? `${BASE_URL}/api/mentor/image/${mentor.mentor_id}`
              : "",
          },
          participants: {
            current: parseInt(session.currentParticipants, 10),
            max: session.maxParticipants,
          },
          platform_link: session.platform_link,
          status: "Cancelled",
        },
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error("Error deleting group session:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message,
      });
    }
  }

  static async getAllGroupSessions(
    req: Request & { user?: any },
    res: Response
  ) {
    try {
      const [sessions] = await pool.query<RowDataPacket[]>(
        `
      SELECT 
        gs.group_session_id AS id,
        gs.title,
        gs.description,
        gs.session_date AS startTime,
        gs.duration_mins AS durationInMinutes,
        gs.max_participants,
        (SELECT COUNT(*) FROM Group_Session_Participants gsp 
         WHERE gsp.group_session_id = gs.group_session_id 
         AND gsp.status = 'registered') AS current_registered,
        gs.platform AS platform_link,
        m.mentor_id,
        u.name AS mentor_name,
        u.image_url AS mentor_photo
      FROM Group_Sessions gs
      JOIN Mentors m ON gs.mentor_id = m.mentor_id
      JOIN Users u ON m.user_id = u.user_id
      `
      );

      const baseUrl = process.env.API_BASE_URL || "http://localhost:3000";
      const groupSessions: GroupSessionInfoType[] = await Promise.all(
        sessions.map(async (session) => {
          const [participants] = await pool.query<RowDataPacket[]>(
            `
          SELECT 
            s.student_id AS id,
            u.name,
            u.image_url AS photoLink
          FROM Group_Session_Participants gsp
          JOIN Students s ON gsp.student_id = s.student_id
          JOIN Users u ON s.user_id = u.user_id
          WHERE gsp.group_session_id = ? AND gsp.status = 'registered'
          ORDER BY gsp.joined_at ASC
          LIMIT 3
          `,
            [session.id]
          );

          return {
            id: session.id,
            title: session.title,
            description: session.description,
            startTime: new Date(session.startTime),
            durationInMinutes: session.durationInMinutes,
            mentor: {
              id: session.mentor_id,
              name: session.mentor_name,
              photoLink: session.mentor_photo
                ? `${baseUrl}/api/mentor/image/${session.mentor_id}`
                : "",
            },
            participants: {
              current: session.current_registered,
              max: session.max_participants,
            },
            previewParticipants: participants.map((p) => ({
              id: p.id,
              name: p.name,
              photoLink: p.photoLink
                ? `${baseUrl}/api/student/image/${p.id}`
                : "",
            })),
            platform_link: session.platform_link || "",
          };
        })
      );

      res.status(200).json({ success: true, data: groupSessions });
    } catch (error: any) {
      console.error("getAllGroupSessions error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }

  static async getGroupSessionById(
    req: Request & { user?: any },
    res: Response
  ) {
    const groupSessionId = req.params.gsid;
    try {
      const [sessions] = await pool.query<RowDataPacket[]>(
        `
      SELECT 
        gs.group_session_id AS id,
        gs.title,
        gs.description,
        gs.session_date AS startTime,
        gs.duration_mins AS durationInMinutes,
        gs.max_participants,
        (SELECT COUNT(*) FROM Group_Session_Participants gsp 
         WHERE gsp.group_session_id = gs.group_session_id 
         AND gsp.status = 'registered') AS current_registered,
        gs.platform AS platform_link,
        m.mentor_id,
        u.name AS mentor_name,
        u.image_url AS mentor_photo
      FROM Group_Sessions gs
      JOIN Mentors m ON gs.mentor_id = m.mentor_id
      JOIN Users u ON m.user_id = u.user_id
      WHERE gs.group_session_id = ?
      `,
        [groupSessionId]
      );

      if (sessions.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Group session not found" });
      }

      const session = sessions[0];
      const [participants] = await pool.query<RowDataPacket[]>(
        `
      SELECT 
        s.student_id AS id,
        u.name,
        u.image_url AS photoLink
      FROM Group_Session_Participants gsp
      JOIN Students s ON gsp.student_id = s.student_id
      JOIN Users u ON s.user_id = u.user_id
      WHERE gsp.group_session_id = ? AND gsp.status = 'registered'
      ORDER BY gsp.joined_at ASC
      LIMIT 3
      `,
        [groupSessionId]
      );

      const baseUrl = process.env.API_BASE_URL || "http://localhost:3000";
      const groupSession: GroupSessionInfoType = {
        id: session.id,
        title: session.title,
        description: session.description,
        startTime: new Date(session.startTime),
        durationInMinutes: session.durationInMinutes,
        mentor: {
          id: session.mentor_id,
          name: session.mentor_name,
          photoLink: session.mentor_photo
            ? `${baseUrl}/api/mentor/image/${session.mentor_id}`
            : "",
        },
        participants: {
          current: session.current_registered,
          max: session.max_participants,
        },
        previewParticipants: participants.map((p) => ({
          id: p.id,
          name: p.name,
          photoLink: p.photoLink ? `${baseUrl}/api/student/image/${p.id}` : "",
        })),
        platform_link: session.platform_link || "",
      };

      res.status(200).json({ success: true, data: groupSession });
    } catch (error: any) {
      console.error(
        `getGroupSessionById error for gsid=${groupSessionId}:`,
        error
      );
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
}

export default GroupSessionController;
