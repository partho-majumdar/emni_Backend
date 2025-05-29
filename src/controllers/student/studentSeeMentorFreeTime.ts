import { Request, Response } from "express";
import pool from "../../config/database";
import { RowDataPacket } from "mysql2";

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

interface AvailabilityResponse {
  id: number | string;
  start: string;
  end: string;
  booked: string;
  medium: string[];
}

class MentorAvailabilityController {
  static async getMentorAvailability(req: AuthenticatedRequest, res: Response) {
    const { mentorId } = req.params;

    if (!mentorId) {
      return res.status(400).json({
        message: "Mentor ID is required",
      });
    }

    try {
      const [mentorCheck]: any[] = await pool.query(
        `SELECT mentor_id FROM Mentors WHERE mentor_id = ?`,
        [mentorId]
      );

      if (mentorCheck.length === 0) {
        return res.status(404).json({
          message: "Mentor not found",
        });
      }

      const [availabilitySlots]: any[] = await pool.query(
        `SELECT 
        availability_id as id,
        start_time as start,
        end_time as end,
        is_booked,
        COALESCE(session_id, '') as session_id,
        is_online,
        is_offline
      FROM Mentor_Availability
      WHERE mentor_id = ?
        AND start_time > UTC_TIMESTAMP()
      ORDER BY start_time`,
        [mentorId]
      );

      if (availabilitySlots.length === 0) {
        const [allSlots]: any[] = await pool.query(
          `SELECT COUNT(*) as count FROM Mentor_Availability WHERE mentor_id = ?`,
          [mentorId]
        );

        if (allSlots[0].count === 0) {
          return res.status(200).json({
            message: "This mentor has not set up any availability slots",
            availability: [],
          });
        } else {
          return res.status(200).json({
            message:
              "No upcoming availability slots found (all may be in the past)",
            availability: [],
          });
        }
      }

      const formattedAvailability = availabilitySlots.map((slot: any) => {
        const start = new Date(slot.start);
        const end = new Date(slot.end);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          console.error("Invalid date format in slot:", slot);
          throw new Error("Invalid date format in database");
        }

        const medium = [];
        if (slot.is_online) medium.push("online");
        if (slot.is_offline) medium.push("offline");

        return {
          id: slot.id,
          start: start.toISOString(),
          end: end.toISOString(),
          booked: slot.is_booked ? [slot.session_id] : [], 
          medium: medium.length ? medium : ["online"], 
        };
      });

      console.log(
        "Formatted availability for mentor",
        mentorId,
        ":",
        formattedAvailability
      );
      res.status(200).json(formattedAvailability);
    } catch (error: any) {
      console.error("Error fetching mentor availability:", error);
      res.status(500).json({
        error: "Internal server error",
        details: error.message,
      });
    }
  }

  static async getAvailabilityById(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { availabilityID } = req.params;

    if (!user_id) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: No user ID" });
    }

    if (!availabilityID) {
      return res
        .status(400)
        .json({ success: false, message: "Availability ID is required" });
    }

    try {
      const [mentorRows] = await pool.execute<RowDataPacket[]>(
        "SELECT mentor_id FROM Mentors WHERE user_id = ?",
        [user_id]
      );

      if (mentorRows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Only mentors can view availability",
        });
      }
      const mentor_id = mentorRows[0].mentor_id;

      const GET_AVAILABILITY = `
        SELECT
          availability_id, start_time, end_time,
          is_booked, session_id, is_online, is_offline
        FROM Mentor_Availability
        WHERE availability_id = ? AND mentor_id = ?
      `;

      const [rows] = await pool.execute<RowDataPacket[]>(GET_AVAILABILITY, [
        availabilityID,
        mentor_id,
      ]);
      const availabilityData = rows[0];

      if (!availabilityData) {
        return res.status(404).json({
          success: false,
          message: "Availability not found or doesn't belong to you",
        });
      }

      const medium: string[] = [];
      if (availabilityData.is_online) medium.push("online");
      if (availabilityData.is_offline) medium.push("offline");

      const availability: AvailabilityResponse = {
        id: availabilityData.availability_id,
        start: new Date(availabilityData.start_time).toISOString(),
        end: new Date(availabilityData.end_time).toISOString(),
        booked: availabilityData.session_id || "",
        medium,
      };

      res.status(200).json({
        success: true,
        data: availability,
      });
    } catch (error) {
      console.error("Get availability by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

export default MentorAvailabilityController;
