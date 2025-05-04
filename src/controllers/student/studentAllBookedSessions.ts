import { Request, Response } from "express";
import db from "../../config/database";
import { RowDataPacket } from "mysql2";

interface BookedSession {
  start: Date;
  end: Date;
  session_type: "1:1" | "group";
  sessionId: string;
  medium: string;
}

interface OneOnOneSession extends RowDataPacket {
  start: Date;
  end: Date;
  sessionId: string;
  medium: string;
}

interface GroupSession extends RowDataPacket {
  start: Date;
  end: Date;
  sessionId: string;
}

export const getAllBookedSessions = async (req: Request, res: Response) => {
  const { studentID } = req.params;

  try {
    // 1. Get 1:1 sessions with session_id from Sessions table
    const [oneOnOneSessions] = await db.query<OneOnOneSession[]>(
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
    const [groupSessions] = await db.query<GroupSession[]>(
      `
      SELECT 
        gs.session_date AS start,
        DATE_ADD(gs.session_date, INTERVAL gs.duration_mins MINUTE) AS end,
        gs.group_session_id AS sessionId
      FROM Group_Session_Participants gsp
      JOIN Group_Sessions gs ON gsp.group_session_id = gs.group_session_id
      WHERE gsp.student_id = ? 
        AND gsp.status IN ('registered', 'completed')
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
};
