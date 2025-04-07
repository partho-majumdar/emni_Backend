// import { Request, Response, NextFunction } from "express";
// import pool from "../../config/database"; // Assuming this is your MySQL connection pool
// import { v4 as uuidv4 } from "uuid";

// // Request body interface
// interface GroupSessionRequest {
//   title: string;
//   description: string;
//   durationInMinutes: number;
//   startTime: string;
//   maxParticipant: number;
//   platform_link: string;
// }

// // Response data type
// interface GroupSession {
//   id: string;
//   title: string;
//   description: string;
//   durationInMinutes: number;
//   startTime: string;
//   mentor: {
//     id: string;
//     name: string;
//     photoLink: string; // Will be constructed as /api/mentor/image/<mentorId>
//   };
//   participants: {
//     current: number;
//     max: number;
//   };
// }

// // Response interface
// interface GroupSessionResponse {
//   success: boolean;
//   data: GroupSession;
// }

// class GroupSessionController {
//   static async createGroupSession(
//     req: Request,
//     res: Response,
//     next: NextFunction
//   ): Promise<void> {
//     try {
//       const {
//         title,
//         description,
//         durationInMinutes,
//         startTime,
//         maxParticipant,
//         platform_link,
//       } = req.body as GroupSessionRequest;

//       // Get user_id from JWT (via authenticateToken middleware)
//       const userId = (req as any).user?.user_id;
//       if (!userId) {
//         res.status(401).json({
//           success: false,
//           error: "Unauthorized: No user ID found in token",
//         });
//         return;
//       }

//       // Validate required fields
//       if (
//         !title ||
//         !description ||
//         !durationInMinutes ||
//         !startTime ||
//         !maxParticipant ||
//         !platform_link
//       ) {
//         res.status(400).json({
//           success: false,
//           error: "Missing required fields",
//           required_fields: {
//             title: "string",
//             description: "string",
//             durationInMinutes: "number",
//             startTime: "ISO 8601 date string",
//             maxParticipant: "number",
//             platform_link: "string",
//           },
//         });
//         return;
//       }

//       // Validate startTime format
//       const sessionDate = new Date(startTime);
//       if (isNaN(sessionDate.getTime())) {
//         res.status(400).json({
//           success: false,
//           error:
//             "Invalid date format for startTime. Use ISO 8601 (e.g., '2025-04-08T10:00:00Z')",
//         });
//         return;
//       }

//       // Validate numeric values
//       if (durationInMinutes <= 0 || maxParticipant <= 0) {
//         res.status(400).json({
//           success: false,
//           error:
//             "durationInMinutes and maxParticipant must be positive numbers",
//         });
//         return;
//       }

//       // Fetch mentor details based on authenticated user_id
//       const [mentorRows]: any[] = await pool.query(
//         `SELECT m.mentor_id, u.name, m.image_url
//          FROM Mentors m
//          JOIN Users u ON m.user_id = u.user_id
//          WHERE m.user_id = ?`,
//         [userId]
//       );

//       if (!mentorRows || mentorRows.length === 0) {
//         res.status(403).json({
//           success: false,
//           error: "User is not a registered mentor",
//           details: "Please complete mentor registration",
//         });
//         return;
//       }

//       const mentor = mentorRows[0];
//       const mentorId = mentor.mentor_id;

//       // Create group session in database
//       const groupSessionId = uuidv4();
//       await pool.query(
//         `INSERT INTO Group_Sessions (
//           group_session_id, mentor_id, title, description,
//           session_date, duration_mins, max_participants, platform
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
//         [
//           groupSessionId,
//           mentorId,
//           title,
//           description,
//           sessionDate,
//           durationInMinutes,
//           maxParticipant,
//           platform_link,
//         ]
//       );

//       // Construct the photoLink URL
//       const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
//       const photoLink = `${baseUrl}/api/mentor/image/${mentorId}`;

//       // Construct response
//       const response: GroupSessionResponse = {
//         success: true,
//         data: {
//           id: groupSessionId,
//           title,
//           description,
//           durationInMinutes,
//           startTime: sessionDate.toISOString(),
//           mentor: {
//             id: mentor.mentor_id,
//             name: mentor.name,
//             photoLink: photoLink, // Use constructed URL
//           },
//           participants: {
//             current: 0, // New session, no participants yet
//             max: maxParticipant,
//           },
//         },
//       };

//       res.status(201).json(response);
//     } catch (error: any) {
//       console.error("Error creating group session:", error);
//       if (error.code === "ER_DUP_ENTRY") {
//         res.status(400).json({
//           success: false,
//           error: "Duplicate entry",
//           details: "A group session with this ID already exists",
//         });
//         return;
//       }
//       res.status(500).json({
//         success: false,
//         error: "Internal server error",
//         details: error.message,
//       });
//     }
//   }
// }

// export default GroupSessionController;

import { Request, Response, NextFunction } from "express";
import pool from "../../config/database"; // Assuming this is your MySQL connection pool
import { v4 as uuidv4 } from "uuid";

// Request body interface for create (unchanged)
interface GroupSessionRequest {
  title: string;
  description: string;
  durationInMinutes: number;
  startTime: string;
  maxParticipant: number;
  platform_link: string;
}

// GroupSession type (as per your response body)
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
}

// Response interface for create (unchanged)
interface GroupSessionResponse {
  success: boolean;
  data: GroupSession;
}

// Response interface for list
interface GroupSessionListResponse {
  success: boolean;
  data: GroupSession[];
}

class GroupSessionController {
  // Existing createGroupSession method (unchanged, included for completeness)
  static async createGroupSession(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        title,
        description,
        durationInMinutes,
        startTime,
        maxParticipant,
        platform_link,
      } = req.body as GroupSessionRequest;

      const userId = (req as any).user?.user_id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized: No user ID found in token",
        });
        return;
      }

      if (
        !title ||
        !description ||
        !durationInMinutes ||
        !startTime ||
        !maxParticipant ||
        !platform_link
      ) {
        res.status(400).json({
          success: false,
          error: "Missing required fields",
          required_fields: {
            title: "string",
            description: "string",
            durationInMinutes: "number",
            startTime: "ISO 8601 date string",
            maxParticipant: "number",
            platform_link: "string",
          },
        });
        return;
      }

      const sessionDate = new Date(startTime);
      if (isNaN(sessionDate.getTime())) {
        res.status(400).json({
          success: false,
          error:
            "Invalid date format for startTime. Use ISO 8601 (e.g., '2025-04-08T10:00:00Z')",
        });
        return;
      }

      if (durationInMinutes <= 0 || maxParticipant <= 0) {
        res.status(400).json({
          success: false,
          error:
            "durationInMinutes and maxParticipant must be positive numbers",
        });
        return;
      }

      const [mentorRows]: any[] = await pool.query(
        `SELECT m.mentor_id, u.name, m.image_url
         FROM Mentors m
         JOIN Users u ON m.user_id = u.user_id
         WHERE m.user_id = ?`,
        [userId]
      );

      if (!mentorRows || mentorRows.length === 0) {
        res.status(403).json({
          success: false,
          error: "User is not a registered mentor",
          details: "Please complete mentor registration",
        });
        return;
      }

      const mentor = mentorRows[0];
      const mentorId = mentor.mentor_id;

      const groupSessionId = uuidv4();
      await pool.query(
        `INSERT INTO Group_Sessions (
          group_session_id, mentor_id, title, description, 
          session_date, duration_mins, max_participants, platform
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          groupSessionId,
          mentorId,
          title,
          description,
          sessionDate,
          durationInMinutes,
          maxParticipant,
          platform_link,
        ]
      );

      const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
      const photoLink = `${baseUrl}/api/mentor/image/${mentorId}`;

      const response: GroupSessionResponse = {
        success: true,
        data: {
          id: groupSessionId,
          title,
          description,
          durationInMinutes,
          startTime: sessionDate.toISOString(),
          mentor: {
            id: mentor.mentor_id,
            name: mentor.name,
            photoLink: photoLink,
          },
          participants: {
            current: 0,
            max: maxParticipant,
          },
        },
      };

      res.status(201).json(response);
    } catch (error: any) {
      console.error("Error creating group session:", error);
      if (error.code === "ER_DUP_ENTRY") {
        res.status(400).json({
          success: false,
          error: "Duplicate entry",
          details: "A group session with this ID already exists",
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message,
      });
    }
  }

  // New method to get group sessions by mentor ID from URL parameter
  static async getGroupSessionsByMentorId(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Get mentorId from URL parameter
      const mentorId = req.params.mID;

      if (!mentorId) {
        res.status(400).json({
          success: false,
          error: "Mentor ID is required in URL path",
        });
        return;
      }

      // Verify mentor exists and fetch mentor details
      const [mentorRows]: any[] = await pool.query(
        `SELECT m.mentor_id, u.name, m.image_url
         FROM Mentors m
         JOIN Users u ON m.user_id = u.user_id
         WHERE m.mentor_id = ?`,
        [mentorId]
      );

      if (!mentorRows || mentorRows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Mentor not found",
          details: `No mentor exists with ID: ${mentorId}`,
        });
        return;
      }

      const mentor = mentorRows[0];

      // Fetch all group sessions for this mentor
      const [sessionRows]: any[] = await pool.query(
        `SELECT 
          gs.group_session_id AS id,
          gs.title,
          gs.description,
          gs.duration_mins AS durationInMinutes,
          gs.session_date AS startTime,
          gs.max_participants AS maxParticipants,
          COUNT(gsp.student_id) AS currentParticipants
        FROM Group_Sessions gs
        LEFT JOIN Group_Session_Participants gsp ON gs.group_session_id = gsp.group_session_id
        WHERE gs.mentor_id = ?
        GROUP BY gs.group_session_id, gs.title, gs.description, gs.duration_mins, gs.session_date, gs.max_participants`,
        [mentorId]
      );

      // Construct the base URL for photoLink
      const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
      const photoLink = `${baseUrl}/api/mentor/image/${mentorId}`;

      // Map database rows to GroupSession type
      const groupSessions: GroupSession[] = sessionRows.map((row: any) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        durationInMinutes: row.durationInMinutes,
        startTime: new Date(row.startTime).toISOString(), // Convert to ISO string
        mentor: {
          id: mentor.mentor_id,
          name: mentor.name,
          photoLink: photoLink,
        },
        participants: {
          current: parseInt(row.currentParticipants, 10), // Convert string to number
          max: row.maxParticipants,
        },
      }));

      // Construct response
      const response: GroupSessionListResponse = {
        success: true,
        data: groupSessions,
      };

      res.status(200).json(response);
    } catch (error: any) {
      console.error("Error fetching group sessions by mentor ID:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
        details: error.message,
      });
    }
  }

  static async deleteGroupSession(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const groupSessionId = req.params.groupSessionId;

      // Validate URL parameter
      if (!groupSessionId) {
        res.status(400).json({
          success: false,
          error: "GroupSessionId is required in URL path",
        });
        return;
      }

      // Get user_id from JWT (via authenticateToken middleware)
      const userId = (req as any).user?.user_id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Unauthorized: No user ID found in token",
        });
        return;
      }

      // Fetch authenticated mentor details
      const [mentorRows]: any[] = await pool.query(
        `SELECT m.mentor_id, u.name, m.image_url
         FROM Mentors m
         JOIN Users u ON m.user_id = u.user_id
         WHERE m.user_id = ?`,
        [userId]
      );

      if (!mentorRows || mentorRows.length === 0) {
        res.status(403).json({
          success: false,
          error: "User is not a registered mentor",
          details: "Please complete mentor registration",
        });
        return;
      }

      const mentor = mentorRows[0];
      const authenticatedMentorId = mentor.mentor_id;

      // Fetch group session details to verify ownership and get data for response
      const [sessionRows]: any[] = await pool.query(
        `SELECT 
          gs.group_session_id AS id,
          gs.title,
          gs.description,
          gs.duration_mins AS durationInMinutes,
          gs.session_date AS startTime,
          gs.mentor_id,
          gs.max_participants AS maxParticipants,
          COUNT(gsp.student_id) AS currentParticipants
        FROM Group_Sessions gs
        LEFT JOIN Group_Session_Participants gsp ON gs.group_session_id = gsp.group_session_id
        WHERE gs.group_session_id = ?
        GROUP BY gs.group_session_id, gs.title, gs.description, gs.duration_mins, gs.session_date, gs.mentor_id, gs.max_participants`,
        [groupSessionId]
      );

      if (!sessionRows || sessionRows.length === 0) {
        res.status(404).json({
          success: false,
          error: "Group session not found",
          details: `No group session exists with ID: ${groupSessionId}`,
        });
        return;
      }

      const session = sessionRows[0];

      // Check if the authenticated mentor is the creator of the group session
      if (session.mentor_id !== authenticatedMentorId) {
        res.status(403).json({
          success: false,
          error: "Unauthorized: You can only delete your own group sessions",
          details: `Mentor ID ${authenticatedMentorId} does not match session creator ID ${session.mentor_id}`,
        });
        return;
      }

      // Delete the group session
      await pool.query(
        `DELETE FROM Group_Sessions WHERE group_session_id = ?`,
        [groupSessionId]
      );

      // Construct the base URL for photoLink
      const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
      const photoLink = `${baseUrl}/api/mentor/image/${authenticatedMentorId}`;

      // Construct the deleted session data for response
      const deletedSession: GroupSession = {
        id: session.id,
        title: session.title,
        description: session.description,
        durationInMinutes: session.durationInMinutes,
        startTime: new Date(session.startTime).toISOString(),
        mentor: {
          id: authenticatedMentorId,
          name: mentor.name,
          photoLink: photoLink,
        },
        participants: {
          current: parseInt(session.currentParticipants, 10),
          max: session.maxParticipants,
        },
      };

      // Construct response
      const response: GroupSessionResponse = {
        success: true,
        data: deletedSession,
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
}

export default GroupSessionController;
