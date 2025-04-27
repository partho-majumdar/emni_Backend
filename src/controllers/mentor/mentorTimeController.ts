// ------------------------- USE TIMESTAMP this give me 6hr + time ---------------------------

import { Request, Response } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { format } from "date-fns";

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
  start: string;
  end: string;
  booked: string;
}

export class MentorAvailabilityController {
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

    try {
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      // Format for database (MySQL DATETIME in UTC)
      const dbStartTime = startDate
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      const dbEndTime = endDate.toISOString().slice(0, 19).replace("T", " ");

      console.log("Input startTime:", startTime);
      console.log("Input endTime:", endTime);
      console.log("Stored start_time (UTC):", dbStartTime);
      console.log("Stored end_time (UTC):", dbEndTime);

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
          AND (
            (start_time < ? AND end_time > ?) OR
            (start_time < ? AND end_time > ?) OR
            (start_time >= ? AND end_time <= ?)
          )
        `;
        const [overlapRows] = await connection.execute(CHECK_OVERLAP, [
          mentor_id,
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
            availability_id, mentor_id, is_online, is_offline, 
            start_time, end_time, is_booked, session_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await connection.execute(INSERT_AVAILABILITY, [
          availability_id,
          mentor_id,
          isOnline ? 1 : 0,
          isOffline ? 1 : 0,
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
    } catch (error) {
      console.error("Date parsing error:", error);
      res.status(400).json({ message: "Invalid date/time format" });
    }
  }

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
          availability_id, start_time, end_time, 
          is_booked, session_id
        FROM Mentor_Availability
        WHERE mentor_id = ?
        ORDER BY start_time
      `;
      const [rows] = await pool.execute(GET_AVAILABILITIES, [mentor_id]);

      const availabilities = (rows as any[]).map(
        (row): AvailabilityResponse => {
          const start = new Date(row.start_time).toISOString();
          const end = new Date(row.end_time).toISOString();

          console.log("-----------------------");
          console.log("Raw start_time (DB):", row.start_time);
          console.log("Raw end_time (DB):", row.end_time);
          console.log("Returned start (UTC):", start);
          console.log("Returned end (UTC):", end);
          console.log("-----------------------");

          return {
            id: row.availability_id,
            start,
            end,
            booked: row.session_id || "",
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

  static async deleteAvailability(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { availability_id } = req.params;

    if (!user_id) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: No user ID" });
    }

    if (!availability_id) {
      return res
        .status(400)
        .json({ success: false, message: "Availability ID is required" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Verify the user is a mentor
      const [mentorRows] = await connection.execute<RowDataPacket[]>(
        "SELECT mentor_id FROM Mentors WHERE user_id = ?",
        [user_id]
      );

      if (mentorRows.length === 0) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: "Only mentors can delete availability",
        });
      }
      const mentor_id = mentorRows[0].mentor_id;

      // Check if availability exists and belongs to this mentor
      const [availabilityRows] = await connection.execute<RowDataPacket[]>(
        `SELECT availability_id, status, is_booked
         FROM Mentor_Availability 
         WHERE availability_id = ? AND mentor_id = ?`,
        [availability_id, mentor_id]
      );

      if (availabilityRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Availability not found or doesn't belong to you",
        });
      }

      const availability = availabilityRows[0];

      // Check if the availability is booked
      if (availability.is_booked) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Cannot delete availability that is already booked",
        });
      }

      // Check if there are any one-on-one sessions for this availability
      const [sessionRows] = await connection.execute<RowDataPacket[]>(
        `SELECT one_on_one_session_id 
         FROM One_On_One_Sessions 
         WHERE availability_id = ?`,
        [availability_id]
      );

      if (sessionRows.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Cannot delete availability with existing sessions",
        });
      }

      // Delete from Availability_Medium_Details first
      await connection.execute(
        "DELETE FROM Availability_Medium_Details WHERE availability_id = ?",
        [availability_id]
      );

      // Delete from Mentor_Availability
      const [deleteResult] = await connection.execute<ResultSetHeader>(
        "DELETE FROM Mentor_Availability WHERE availability_id = ?",
        [availability_id]
      );

      await connection.commit();

      if (deleteResult.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Availability not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Availability deleted successfully",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Delete availability error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      connection.release();
    }
  }
}



// ----------------------------- USE DATETIME -----------------------------------------
/*
import { Request, Response } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { format } from "date-fns";

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

interface AvailabilityInput {
  startTime: string; // ISO string with offset, e.g., "2025-04-28T11:00:00+05:30"
  endTime: string; // ISO string with offset, e.g., "2025-04-28T12:00:00+05:30"
  medium: ("online" | "offline")[];
}

interface AvailabilityResponse {
  id: string;
  start: string; // ISO string in UTC, e.g., "2025-04-28T05:30:00.000Z"
  end: string; // ISO string in UTC, e.g., "2025-04-28T06:30:00.000Z"
  booked: string;
}

export class MentorAvailabilityController {
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

    try {
      // Parse ISO strings with offset and convert to UTC
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      // Format for database (MySQL DATETIME in UTC)
      const dbStartTime = startDate
        .toISOString()
        .slice(0, 19)
        .replace("T", " "); // e.g., "2025-04-28 05:30:00"
      const dbEndTime = endDate.toISOString().slice(0, 19).replace("T", " "); // e.g., "2025-04-28 06:30:00"

      console.log("Input startTime:", startTime);
      console.log("Input endTime:", endTime);
      console.log("Stored start_time (UTC):", dbStartTime);
      console.log("Stored end_time (UTC):", dbEndTime);

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
          AND (
            (start_time < ? AND end_time > ?) OR
            (start_time < ? AND end_time > ?) OR
            (start_time >= ? AND end_time <= ?)
          )
        `;
        const [overlapRows] = await connection.execute(CHECK_OVERLAP, [
          mentor_id,
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
            availability_id, mentor_id, is_online, is_offline, 
            start_time, end_time, is_booked, session_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await connection.execute(INSERT_AVAILABILITY, [
          availability_id,
          mentor_id,
          isOnline ? 1 : 0,
          isOffline ? 1 : 0,
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
    } catch (error) {
      console.error("Date parsing error:", error);
      res.status(400).json({ message: "Invalid date/time format" });
    }
  }

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
          availability_id, start_time, end_time, 
          is_booked, session_id
        FROM Mentor_Availability
        WHERE mentor_id = ?
        ORDER BY start_time
      `;
      const [rows] = await pool.execute(GET_AVAILABILITIES, [mentor_id]);

      const availabilities = (rows as any[]).map(
        (row): AvailabilityResponse => {
          const start = new Date(row.start_time);
          const end = new Date(row.end_time);

          if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            console.error("Invalid date format in database:", row);
            throw new Error("Invalid date format in database");
          }

          const startIso = start.toISOString();
          const endIso = end.toISOString();

          console.log("-----------------------");
          console.log("Raw start_time (DB):", row.start_time);
          console.log("Raw end_time (DB):", row.end_time);
          console.log("Returned start (UTC):", startIso);
          console.log("Returned end (UTC):", endIso);
          console.log("-----------------------");

          return {
            id: row.availability_id,
            start: startIso,
            end: endIso,
            booked: row.session_id || "",
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

  static async deleteAvailability(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { availability_id } = req.params;

    if (!user_id) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: No user ID" });
    }

    if (!availability_id) {
      return res
        .status(400)
        .json({ success: false, message: "Availability ID is required" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Verify the user is a mentor
      const [mentorRows] = await connection.execute<RowDataPacket[]>(
        "SELECT mentor_id FROM Mentors WHERE user_id = ?",
        [user_id]
      );

      if (mentorRows.length === 0) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: "Only mentors can delete availability",
        });
      }
      const mentor_id = mentorRows[0].mentor_id;

      // Check if availability exists and belongs to this mentor
      const [availabilityRows] = await connection.execute<RowDataPacket[]>(
        `SELECT availability_id, status, is_booked
         FROM Mentor_Availability 
         WHERE availability_id = ? AND mentor_id = ?`,
        [availability_id, mentor_id]
      );

      if (availabilityRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Availability not found or doesn't belong to you",
        });
      }

      const availability = availabilityRows[0];

      // Check if the availability is booked
      if (availability.is_booked) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Cannot delete availability that is already booked",
        });
      }

      // Check if there are any one-on-one sessions for this availability
      const [sessionRows] = await connection.execute<RowDataPacket[]>(
        `SELECT one_on_one_session_id 
         FROM One_On_One_Sessions 
         WHERE availability_id = ?`,
        [availability_id]
      );

      if (sessionRows.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Cannot delete availability with existing sessions",
        });
      }

      // Delete from Availability_Medium_Details first
      await connection.execute(
        "DELETE FROM Availability_Medium_Details WHERE availability_id = ?",
        [availability_id]
      );

      // Delete from Mentor_Availability
      const [deleteResult] = await connection.execute<ResultSetHeader>(
        "DELETE FROM Mentor_Availability WHERE availability_id = ?",
        [availability_id]
      );

      await connection.commit();

      if (deleteResult.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Availability not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Availability deleted successfully",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Delete availability error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      connection.release();
    }
  }
}
*/