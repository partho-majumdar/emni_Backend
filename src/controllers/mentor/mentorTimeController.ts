import { Request, Response } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

interface AvailabilityInput {
  startTime: string;
  endTime: string;
  medium: ("online" | "offline")[];
}

interface AvailabilityResponse {
  id: string;
  start: Date;
  end: Date;
  booked: string; // session_id or empty string
}

function parseIsoToDateTime(isoString: string): { date: string; time: string } {
  const dateObj = new Date(isoString);
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid ISO date string: ${isoString}`);
  }
  const date = dateObj.toISOString().split("T")[0];
  const time = dateObj.toISOString().split("T")[1].substring(0, 8);
  return { date, time };
}

export class MentorAvailabilityController {
  // POST /api/mentor/availability/add
  static async addAvailability(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { startTime, endTime, medium } = req.body as AvailabilityInput;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    if (
      !startTime ||
      !endTime ||
      !medium ||
      !Array.isArray(medium) ||
      medium.length === 0
    ) {
      return res
        .status(400)
        .json({ message: "Missing or invalid required fields" });
    }

    const isOnline = medium.includes("online");
    const isOffline = medium.includes("offline");
    if (!isOnline && !isOffline) {
      return res
        .status(400)
        .json({ message: "Medium must include 'online' or 'offline'" });
    }

    const { date: available_date, time: dbStartTime } =
      parseIsoToDateTime(startTime);
    const { time: dbEndTime } = parseIsoToDateTime(endTime);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if user is a mentor
      const [mentorRows] = await connection.execute(
        "SELECT mentor_id FROM Mentors WHERE user_id = ?",
        [user_id]
      );
      const mentor = (mentorRows as any[])[0];
      if (!mentor) {
        await connection.rollback();
        return res
          .status(403)
          .json({ message: "Only mentors can add availability" });
      }
      const mentor_id = mentor.mentor_id;

      // Check for overlapping availability
      const CHECK_OVERLAP = `
        SELECT COUNT(*) as overlap_count 
        FROM Mentor_Availability 
        WHERE mentor_id = ? 
        AND available_date = ? 
        AND (
          (start_time < ? AND end_time > ?) OR 
          (start_time < ? AND end_time > ?) OR 
          (start_time >= ? AND end_time <= ?)
        )
      `;
      const [overlapRows] = await connection.execute(CHECK_OVERLAP, [
        mentor_id,
        available_date,
        dbEndTime,
        dbStartTime,
        dbEndTime,
        dbStartTime,
        dbStartTime,
        dbEndTime,
      ]);
      const overlapCount = (overlapRows as any[])[0].overlap_count;
      if (overlapCount > 0) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Availability overlaps with existing schedule" });
      }

      // Insert new availability
      const availability_id = uuidv4();
      const INSERT_AVAILABILITY = `
        INSERT INTO Mentor_Availability (
          availability_id, mentor_id, is_online, is_offline, available_date, 
          start_time, end_time, is_booked, session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await connection.execute(INSERT_AVAILABILITY, [
        availability_id,
        mentor_id,
        isOnline ? 1 : 0,
        isOffline ? 1 : 0,
        available_date,
        dbStartTime,
        dbEndTime,
        false,
        null,
      ]);

      await connection.commit();
      res.status(201).json({ success: true });
    } catch (error) {
      await connection.rollback();
      console.error("Add availability error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }

  // GET /api/mentor/availability/
  static async getAvailabilities(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    try {
      // Check if user is a mentor
      const [mentorRows] = await pool.execute(
        "SELECT mentor_id FROM Mentors WHERE user_id = ?",
        [user_id]
      );
      const mentor = (mentorRows as any[])[0];
      if (!mentor) {
        return res
          .status(403)
          .json({ message: "Only mentors can view availability" });
      }
      const mentor_id = mentor.mentor_id;

      const GET_AVAILABILITIES = `
        SELECT 
          availability_id, available_date, start_time, end_time, 
          is_booked, session_id
        FROM Mentor_Availability
        WHERE mentor_id = ?
        ORDER BY available_date, start_time
      `;
      const [rows] = await pool.execute(GET_AVAILABILITIES, [mentor_id]);

      const availabilities = (rows as any[]).map(
        (row): AvailabilityResponse => {
          const dateStr =
            row.available_date instanceof Date
              ? row.available_date.toISOString().split("T")[0]
              : row.available_date;
          const startIso = `${dateStr}T${row.start_time}Z`;
          const endIso = `${dateStr}T${row.end_time}Z`;
          const startDate = new Date(startIso);
          const endDate = new Date(endIso);

          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.error("Invalid date construction:", {
              startIso,
              endIso,
              row,
            });
            throw new Error("Failed to parse date/time from database");
          }

          return {
            id: row.availability_id,
            start: startDate,
            end: endDate,
            booked: row.session_id || "", // session_id if booked, empty string if not
          };
        }
      );

      res.status(200).json({
        success: true,
        data: availabilities,
      });
    } catch (error) {
      console.error("Get availabilities error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
}
