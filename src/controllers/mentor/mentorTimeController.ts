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
  medium: string[];
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

      // Return the newly created availability
      const newAvailability = {
        id: availability_id,
        start: startTime,
        end: endTime,
        medium: medium,
        booked: false,
      };

      res.status(201).json({ success: true, data: newAvailability });
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
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: No user ID" });
    }

    try {
      // Check if user is a mentor
      const [mentorRows] = await pool.execute<RowDataPacket[]>(
        "SELECT mentor_id FROM Mentors WHERE user_id = ?",
        [user_id]
      );

      if (mentorRows.length === 0) {
        return res
          .status(403)
          .json({ success: false, message: "Only mentors can view availability" });
      }
      const mentor_id = mentorRows[0].mentor_id;

      const GET_AVAILABILITIES = `
        SELECT
          availability_id, start_time, end_time,
          is_booked, session_id, is_online, is_offline
        FROM Mentor_Availability
        WHERE mentor_id = ?
        ORDER BY start_time
      `;
      const [rows] = await pool.execute<RowDataPacket[]>(GET_AVAILABILITIES, [mentor_id]);

      const availabilities = rows.map((row): AvailabilityResponse => {
        const start = new Date(row.start_time).toISOString();
        const end = new Date(row.end_time).toISOString();
        const medium: string[] = [];
        if (row.is_online) medium.push("online");
        if (row.is_offline) medium.push("offline");

        return {
          id: row.availability_id,
          start,
          end,
          booked: row.session_id || "",
          medium,
        };
      });

      res.status(200).json({
        success: true,
        data: availabilities,
      });
    } catch (error) {
      console.error("Get availabilities error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  static async updateAvailability(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { availability_id } = req.params;
    const { startTime, endTime, medium } = req.body;

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
          message: "Only mentors can update availability",
        });
      }
      const mentor_id = mentorRows[0].mentor_id;

      // Check if availability exists and belongs to this mentor
      const [availabilityRows] = await connection.execute<RowDataPacket[]>(
        `SELECT availability_id, start_time, end_time, is_online, is_offline, is_booked
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
          message: "Cannot update availability that is already booked",
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
          message: "Cannot update availability with existing sessions",
        });
      }

      // Prepare update fields
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      // Handle startTime
      const newStartTime = startTime ? new Date(startTime) : new Date(availability.start_time);
      if (startTime) {
        updateFields.push("start_time = ?");
        updateValues.push(newStartTime.toISOString().slice(0, 19).replace('T', ' '));
      }

      // Handle endTime
      const newEndTime = endTime ? new Date(endTime) : new Date(availability.end_time);
      if (endTime) {
        updateFields.push("end_time = ?");
        updateValues.push(newEndTime.toISOString().slice(0, 19).replace('T', ' '));
      }

      // Validate time range
      if (newStartTime >= newEndTime) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Start time must be before end time",
        });
      }

      // Check for overlapping availability
      const CHECK_OVERLAP = `
        SELECT COUNT(*) as overlap_count
        FROM Mentor_Availability
        WHERE mentor_id = ?
        AND availability_id != ?
        AND (
          (start_time < ? AND end_time > ?) OR
          (start_time < ? AND end_time > ?) OR
          (start_time >= ? AND end_time <= ?)
        )
      `;
      const [overlapRows] = await connection.execute<RowDataPacket[]>(CHECK_OVERLAP, [
        mentor_id,
        availability_id,
        newEndTime.toISOString().slice(0, 19).replace('T', ' '),
        newStartTime.toISOString().slice(0, 19).replace('T', ' '),
        newEndTime.toISOString().slice(0, 19).replace('T', ' '),
        newStartTime.toISOString().slice(0, 19).replace('T', ' '),
        newStartTime.toISOString().slice(0, 19).replace('T', ' '),
        newEndTime.toISOString().slice(0, 19).replace('T', ' '),
      ]);

      const overlapCount = overlapRows[0].overlap_count;
      if (overlapCount > 0) {
        await connection.rollback();
        return res
          .status(400)
          .json({ success: false, message: "Availability overlaps with existing schedule" });
      }

      // Handle medium (is_online, is_offline)
      let is_online = availability.is_online;
      let is_offline = availability.is_offline;
      if (medium && Array.isArray(medium)) {
        is_online = medium.includes("online") ? 1 : 0;
        is_offline = medium.includes("offline") ? 1 : 0;
        updateFields.push("is_online = ?", "is_offline = ?");
        updateValues.push(is_online, is_offline);

        // Validate medium
        if (!is_online && !is_offline) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: "At least one medium (online or offline) must be selected",
          });
        }
      }

      // If no fields to update, return early
      if (updateFields.length === 0) {
        await connection.commit();
        return res.status(200).json({
          success: true,
          message: "No changes provided, availability unchanged",
          data: {
            id: availability_id,
            start: availability.start_time,
            end: availability.end_time,
            medium: [
              ...(availability.is_online ? ["online"] : []),
              ...(availability.is_offline ? ["offline"] : []),
            ],
            booked: availability.is_booked,
          },
        });
      }

      // Update Mentor_Availability
      updateValues.push(availability_id);
      const [updateResult] = await connection.execute<ResultSetHeader>(
        `UPDATE Mentor_Availability 
        SET ${updateFields.join(", ")}
        WHERE availability_id = ?`,
        updateValues
      );

      await connection.commit();

      if (updateResult.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Availability not found",
        });
      }

      // Return the updated availability
      const updatedAvailability = {
        id: availability_id,
        start: newStartTime.toISOString(),
        end: newEndTime.toISOString(),
        medium: [
          ...(is_online ? ["online"] : []),
          ...(is_offline ? ["offline"] : []),
        ],
        booked: availability.is_booked,
      };

      res.status(200).json({
        success: true,
        message: "Availability updated successfully",
        data: updatedAvailability,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Update availability error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      connection.release();
    }
  }

  static async deleteAvailability(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { availability_id } = req.params;

    console.log(`Attempting to delete availability_id: ${availability_id} for user_id: ${user_id}`);

    if (!user_id) {
      console.error('No user_id found in request');
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: No user ID" });
    }

    if (!availability_id) {
      console.error('No availability_id provided in request');
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
        console.error(`No mentor found for user_id: ${user_id}`);
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: "Only mentors can delete availability",
        });
      }
      const mentor_id = mentorRows[0].mentor_id;
      console.log(`Found mentor_id: ${mentor_id} for user_id: ${user_id}`);

      // Check if availability exists and belongs to this mentor
      const [availabilityRows] = await connection.execute<RowDataPacket[]>(
        `SELECT availability_id, status, is_booked, is_online, is_offline
         FROM Mentor_Availability 
         WHERE availability_id = ? AND mentor_id = ?`,
        [availability_id, mentor_id]
      );

      if (availabilityRows.length === 0) {
        console.error(`No availability found for availability_id: ${availability_id} and mentor_id: ${mentor_id}`);
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Availability not found or doesn't belong to you",
        });
      }

      const availability = availabilityRows[0];
      console.log(`Availability found: ${JSON.stringify(availability)}`);

      // Check if the availability is booked
      if (availability.is_booked) {
        console.warn(`Availability is booked: ${availability_id}`);
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
        console.warn(`Availability has existing sessions: ${availability_id}`);
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Cannot delete availability with existing sessions",
        });
      }

      // Delete from Mentor_Availability
      const [deleteResult] = await connection.execute<ResultSetHeader>(
        "DELETE FROM Mentor_Availability WHERE availability_id = ?",
        [availability_id]
      );

      await connection.commit();

      if (deleteResult.affectedRows === 0) {
        console.error(`No rows deleted for availability_id: ${availability_id}`);
        return res.status(404).json({
          success: false,
          message: "Availability not found",
        });
      }

      console.log(`Successfully deleted availability_id: ${availability_id}`);
      res.status(200).json({
        success: true,
        message: "Availability deleted successfully",
      });
    } catch (error) {
      console.error(`Delete availability error for availability_id: ${availability_id}`, error);
      await connection.rollback();
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
