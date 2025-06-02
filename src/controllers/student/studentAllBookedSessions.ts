// import { Request, Response } from "express";
// import db from "../../config/database";
// import { RowDataPacket } from "mysql2";

// interface BookedSession {
//   start: Date;
//   end: Date;
//   session_type: "1:1" | "group";
//   sessionId: string;
//   medium: string;
// }

// interface OneOnOneSession extends RowDataPacket {
//   start: Date;
//   end: Date;
//   sessionId: string;
//   medium: string;
// }

// interface GroupSession extends RowDataPacket {
//   start: Date;
//   end: Date;
//   sessionId: string;
// }

// export const getAllBookedSessions = async (req: Request, res: Response) => {
//   const { studentID } = req.params;

//   try {
//     // 1. Get 1:1 sessions with session_id from Sessions table
//     const [oneOnOneSessions] = await db.query<OneOnOneSession[]>(
//       `
//       SELECT
//         ma.start_time AS start,
//         ma.end_time AS end,
//         s.session_id AS sessionId,
//         oos.medium
//       FROM One_On_One_Sessions oos
//       JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
//       JOIN Sessions s ON ma.session_id = s.session_id
//       WHERE oos.student_id = ?
//       `,
//       [studentID]
//     );

//     // 2. Get Group Sessions with group_session_id from Group_Sessions table
//     const [groupSessions] = await db.query<GroupSession[]>(
//       `
//       SELECT
//         gs.session_date AS start,
//         DATE_ADD(gs.session_date, INTERVAL gs.duration_mins MINUTE) AS end,
//         gs.group_session_id AS sessionId
//       FROM Group_Session_Participants gsp
//       JOIN Group_Sessions gs ON gsp.group_session_id = gs.group_session_id
//       WHERE gsp.student_id = ?
//         AND gsp.status IN ('registered', 'completed')
//       `,
//       [studentID]
//     );

//     // 3. Format all sessions
//     const bookedSessions: BookedSession[] = [
//       ...oneOnOneSessions.map((session) => ({
//         start: new Date(session.start),
//         end: new Date(session.end),
//         session_type: "1:1" as const,
//         sessionId: session.sessionId,
//         medium: session.medium,
//       })),
//       ...groupSessions.map((session) => ({
//         start: new Date(session.start),
//         end: new Date(session.end),
//         session_type: "group" as const,
//         sessionId: session.sessionId,
//         medium: "online",
//       })),
//     ];

//     res.json({
//       success: true,
//       data: bookedSessions,
//     });
//   } catch (error) {
//     console.error("Error fetching booked sessions:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to retrieve booked sessions",
//     });
//   }
// };

import { Request, Response } from "express";
import db from "../../config/database";
import { RowDataPacket } from "mysql2";

// Lightweight interface for basic session info
interface BookedSession {
  start: Date;
  end: Date;
  session_type: "1:1" | "group";
  sessionId: string;
  medium: string;
}

// Detailed interfaces for comprehensive session info
interface DetailedSessionBase {
  session_type: "1:1" | "group";
  booking_id: string;
  start: Date;
  end: Date;
  mentor: {
    id: string;
    user_id: string;
    name: string;
    email: string;
    username: string;
    image_url: string | null;
  };
}

interface DetailedOneOnOneSession extends DetailedSessionBase {
  session_type: "1:1";
  session_info: {
    id: string;
    title: string;
    description: string;
    type: string;
    duration: number;
    price: number;
    is_online: boolean;
    is_offline: boolean;
    created_at: Date;
  };
  time_slot: {
    status: string;
    booked_at: Date;
  };
  meeting_details: {
    medium: string;
    place: string | null;
    online_link: string | null;
  };
  payment_info?: {
    transaction_id: string | null;
    amount: number | null;
    status: string | null;
  };
}

interface DetailedGroupSession extends DetailedSessionBase {
  session_type: "group";
  session_info: {
    title: string;
    description: string;
    duration: number;
    max_participants: number;
    platform: string | null;
    status: string;
    created_at: Date;
  };
  booking_details: {
    participation_status: string;
    booked_at: Date;
  };
}

interface JwtPayload {
  user_id: string;
  user_type?: string;
}

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

class StudentBookSessionController {
  // Lightweight version - just basic timing info (unchanged except for status conditions)
  static async getAllBookedSessions(req: Request, res: Response) {
    const { studentID } = req.params;

    try {
      // 1. Get 1:1 sessions with session_id from Sessions table
      const [oneOnOneSessions] = await db.query<RowDataPacket[]>(
        `
        SELECT 
          ma.start_time AS start,
          ma.end_time AS end,
          s.session_id AS sessionId,
          oos.medium
        FROM One_On_One_Sessions oos
        JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
        JOIN Sessions s ON ma.session_id = s.session_id
        WHERE oos.student_id = ?
        `,
        [studentID]
      );

      // 2. Get Group Sessions with group_session_id from Group_Sessions table
      const [groupSessions] = await db.query<RowDataPacket[]>(
        `
        SELECT 
          gs.session_date AS start,
          DATE_ADD(gs.session_date, INTERVAL gs.duration_mins MINUTE) AS end,
          gs.group_session_id AS sessionId
        FROM Group_Session_Participants gsp
        JOIN Group_Sessions gs ON gsp.group_session_id = gs.group_session_id
        WHERE gsp.student_id = ?
        `,
        [studentID]
      );

      // 3. Format all sessions
      const bookedSessions: BookedSession[] = [
        ...oneOnOneSessions.map((session) => ({
          start: new Date(session.start),
          end: new Date(session.end),
          session_type: "1:1" as const,
          sessionId: session.sessionId,
          medium: session.medium,
        })),
        ...groupSessions.map((session) => ({
          start: new Date(session.start),
          end: new Date(session.end),
          session_type: "group" as const,
          sessionId: session.sessionId,
          medium: "online",
        })),
      ];

      res.json({
        success: true,
        data: bookedSessions,
      });
    } catch (error) {
      console.error("Error fetching booked sessions:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve booked sessions",
      });
    }
  }

  // Detailed version - comprehensive session info
  static async getAllBookedSessionsForStudent(
    req: AuthenticatedRequest,
    res: Response
  ) {
    const studentID = req.user?.user_id;

    if (!studentID) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
      // Verify student exists
      const [studentCheck] = await db.query<RowDataPacket[]>(
        "SELECT s.student_id FROM Students s JOIN Users u ON s.user_id = u.user_id WHERE u.user_id = ?",
        [studentID]
      );

      if (studentCheck.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Student not found",
        });
      }

      const student_id = studentCheck[0].student_id;

      // 1. Get detailed 1:1 sessions
      const [oneOnOneSessions] = await db.query<RowDataPacket[]>(
        `
        SELECT 
          '1:1' AS session_type,
          oos.one_on_one_session_id AS booking_id,
          oos.availability_id,
          oos.medium,
          oos.place,
          oos.created_at AS booking_time,
          ma.start_time AS start,
          ma.end_time AS end,
          ma.status AS availability_status,
          s.session_id,
          s.session_title,
          s.description AS session_description,
          s.type AS session_type_detail,
          s.duration_mins,
          s.price,
          s.is_online,
          s.is_offline,
          s.created_at AS session_created_at,
          m.mentor_id,
          u.user_id AS mentor_user_id,
          u.name AS mentor_name,
          u.email AS mentor_email,
          u.username AS mentor_username,
          u.image_url AS mentor_image,
          bsl.link,
          st.transaction_id,
          st.ucoin_amount,
          st.status AS payment_status
        FROM One_On_One_Sessions oos
        JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
        JOIN Sessions s ON ma.session_id = s.session_id
        JOIN Mentors m ON ma.mentor_id = m.mentor_id
        JOIN Users u ON m.user_id = u.user_id
        LEFT JOIN BookedSessionLinks bsl ON oos.one_on_one_session_id = bsl.one_on_one_session_id
        LEFT JOIN Session_Transactions st ON oos.one_on_one_session_id = st.one_on_one_session_id
        WHERE oos.student_id = ?
        ORDER BY ma.start_time DESC
        `,
        [student_id]
      );

      // 2. Get detailed Group Sessions
      const [groupSessions] = await db.query<RowDataPacket[]>(
        `
        SELECT 
          'group' AS session_type,
          gsp.group_session_id AS booking_id,
          gsp.joined_at AS booking_time,
          gsp.status AS participation_status,
          gs.title AS session_title,
          gs.description AS session_description,
          gs.session_date AS start,
          DATE_ADD(gs.session_date, INTERVAL gs.duration_mins MINUTE) AS end,
          gs.duration_mins,
          gs.max_participants,
          gs.platform,
          gs.status AS session_status,
          gs.created_at AS session_created_at,
          m.mentor_id,
          u.user_id AS mentor_user_id,
          u.name AS mentor_name,
          u.email AS mentor_email,
          u.username AS mentor_username,
          u.image_url AS mentor_image
        FROM Group_Session_Participants gsp
        JOIN Group_Sessions gs ON gsp.group_session_id = gs.group_session_id
        JOIN Mentors m ON gs.mentor_id = m.mentor_id
        JOIN Users u ON m.user_id = u.user_id
        WHERE gsp.student_id = ?
        ORDER BY gs.session_date DESC
        `,
        [student_id]
      );

      // Format the detailed response data
      const formattedOneOnOneSessions: DetailedOneOnOneSession[] =
        oneOnOneSessions.map((session) => ({
          session_type: "1:1",
          booking_id: session.booking_id,
          start: new Date(session.start),
          end: new Date(session.end),
          mentor: {
            id: session.mentor_id,
            user_id: session.mentor_user_id,
            name: session.mentor_name,
            email: session.mentor_email,
            username: session.mentor_username,
            image_url: session.mentor_image,
          },
          session_info: {
            id: session.session_id,
            title: session.session_title,
            description: session.session_description,
            type: session.session_type_detail,
            duration: session.duration_mins,
            price: session.price,
            is_online: session.is_online,
            is_offline: session.is_offline,
            created_at: new Date(session.session_created_at),
          },
          time_slot: {
            status: session.availability_status,
            booked_at: new Date(session.booking_time),
          },
          meeting_details: {
            medium: session.medium,
            place: session.place,
            online_link: session.link,
          },
          payment_info: session.transaction_id
            ? {
                transaction_id: session.transaction_id,
                amount: session.ucoin_amount,
                status: session.payment_status,
              }
            : undefined,
        }));

      const formattedGroupSessions: DetailedGroupSession[] = groupSessions.map(
        (session) => ({
          session_type: "group",
          booking_id: session.booking_id,
          start: new Date(session.start),
          end: new Date(session.end),
          mentor: {
            id: session.mentor_id,
            user_id: session.mentor_user_id,
            name: session.mentor_name,
            email: session.mentor_email,
            username: session.mentor_username,
            image_url: session.mentor_image,
          },
          session_info: {
            title: session.session_title,
            description: session.session_description,
            duration: session.duration_mins,
            max_participants: session.max_participants,
            platform: session.platform,
            status: session.session_status,
            created_at: new Date(session.session_created_at),
          },
          booking_details: {
            participation_status: session.participation_status,
            booked_at: new Date(session.booking_time),
          },
        })
      );

      // Combine and sort sessions by start time (newest first)
      const allSessions = [
        ...formattedOneOnOneSessions,
        ...formattedGroupSessions,
      ].sort((a, b) => b.start.getTime() - a.start.getTime());

      res.json({
        success: true,
        data: allSessions,
        counts: {
          total: allSessions.length,
          one_on_one: formattedOneOnOneSessions.length,
          group: formattedGroupSessions.length,
        },
      });
    } catch (error) {
      console.error("Error fetching detailed booked sessions:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve detailed booked sessions",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

export default StudentBookSessionController;
