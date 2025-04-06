import { Request, Response } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

interface AvailabilityInput {
  medium: "Online" | "Offline";
  available_date: string;
  start_time: string;
  end_time: string;
  meeting_link?: string;
  offline_address?: string;
}

interface AvailabilityResponse {
  id: string;
  start: Date;
  end: Date;
  meet_link?: string;
  offline_address?: string;
  booked: boolean;
}

function convertTimeTo24Hour(timeStr: string): string {
  const [time, period] =
    timeStr.match(/(\d{1,2}(?::\d{2})?)(am|pm)/i)?.slice(1) || [];
  if (!time || !period) throw new Error(`Invalid time format: ${timeStr}`);

  let [hours, minutes = "00"] = time.split(":");
  hours = parseInt(hours).toString();
  if (period.toLowerCase() === "pm" && hours !== "12") {
    hours = (parseInt(hours) + 12).toString();
  } else if (period.toLowerCase() === "am" && hours === "12") {
    hours = "00";
  }
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:44`;
}

function normalizeTime(time: any): string {
  if (!time) return "00:00:00";
  if (typeof time === "string") {
    const [hms] = time.split(".");
    const [hours, minutes, seconds = "00"] = hms.split(":");
    return `${hours.padStart(2, "0")}:${minutes.padStart(
      2,
      "0"
    )}:${seconds.padStart(2, "0")}`;
  }

  if (typeof time === "object" && time.toString) {
    return time.toString().substring(0, 8);
  }
  throw new Error(`Unexpected time format: ${JSON.stringify(time)}`);
}

export class MentorAvailabilityController {
  static async addAvailability(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const {
      medium,
      available_date,
      start_time,
      end_time,
      meeting_link,
      offline_address,
    } = req.body as AvailabilityInput;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    if (!medium || !available_date || !start_time || !end_time) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (medium === "Online" && !meeting_link) {
      return res
        .status(400)
        .json({ message: "Meeting link is required for online sessions" });
    }

    if (medium === "Offline" && !offline_address) {
      return res
        .status(400)
        .json({ message: "Offline address required for offline sessions" });
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
          .json({ message: "Only mentors can add availability" });
      }

      const mentor_id = mentor.mentor_id;
      const dbStartTime = convertTimeTo24Hour(start_time);
      const dbEndTime = convertTimeTo24Hour(end_time);
      const availability_id = uuidv4();

      const INSERT_AVAILABILITY = `
      INSERT INTO Mentor_Availability (
        availability_id, mentor_id, medium, available_date, start_time, end_time, 
        meeting_link, offline_address, is_booked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

      await connection.execute(INSERT_AVAILABILITY, [
        availability_id,
        mentor_id,
        medium,
        available_date,
        dbStartTime,
        dbEndTime,
        medium === "Online" ? meeting_link : null,
        medium === "Offline" ? offline_address : null,
        false,
      ]);

      await connection.commit();

      res.status(201).json({
        message: "Availability created successfully",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Add availability error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }

  static async getAvailabilities(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    try {
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
        availability_id, medium, available_date, start_time, end_time,
        meeting_link, offline_address, is_booked
      FROM Mentor_Availability
      WHERE mentor_id = ?
      ORDER BY available_date, start_time
    `;

      const [rows] = await pool.execute(GET_AVAILABILITIES, [mentor_id]);
      const availabilities = (rows as any[]).map((row) => {
        const normalizedStartTime = normalizeTime(row.start_time);
        const normalizedEndTime = normalizeTime(row.end_time);

        const dateStr =
          row.available_date instanceof Date
            ? row.available_date.toISOString().split("T")[0]
            : row.available_date;

        const startIso = `${dateStr}T${normalizedStartTime}Z`;
        const endIso = `${dateStr}T${normalizedEndTime}Z`;
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

        const response: AvailabilityResponse = {
          id: row.availability_id,
          start: startDate,
          end: endDate,
          booked: !!row.is_booked,
        };

        if (row.medium === "Online") {
          response.meet_link = row.meeting_link || undefined;
        }
        if (row.medium === "Offline") {
          response.offline_address = row.offline_address || undefined;
        }

        return response;
      });

      res.status(200).json({
        data: availabilities,
      });
    } catch (error) {
      console.error("Get availabilities error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
}
