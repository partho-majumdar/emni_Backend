import { Request, Response } from "express";
import pool from "../../config/database";

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
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
      const [availabilitySlots]: any[] = await pool.query(
        `SELECT 
          availability_id as id,
          start_time as start,
          end_time as end,
          is_booked,
          COALESCE(session_id, '') as session_id
        FROM Mentor_Availability
        WHERE mentor_id = ?
          AND start_time > NOW()
        ORDER BY start_time`,
        [mentorId]
      );

      if (!Array.isArray(availabilitySlots) || availabilitySlots.length === 0) {
        return res.status(200).json({
          message: "No available time slots found for this mentor",
          availability: [],
        });
      }

      // Format the response
      const formattedAvailability = availabilitySlots.map((slot: any) => {
        const start = new Date(slot.start);
        const end = new Date(slot.end);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          console.error("Invalid date format in slot:", slot);
          throw new Error("Invalid date format in database");
        }

        return {
          id: slot.id,
          start: start.toISOString(),
          end: end.toISOString(),
          booked: slot.is_booked ? slot.session_id : "",
        };
      });

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
    const { availabilityID } = req.params;

    if (!availabilityID) {
      return res.status(400).json({ message: "Availability ID is required" });
    }

    try {
      const GET_AVAILABILITY = `
        SELECT
          availability_id, start_time, end_time,
          is_booked, session_id
        FROM Mentor_Availability
        WHERE availability_id = ?
      `;

      const [rows] = await pool.execute(GET_AVAILABILITY, [availabilityID]);
      const availabilityData = (rows as any[])[0];

      if (!availabilityData) {
        return res.status(404).json({ message: "Availability not found" });
      }

      const availability = {
        id: availabilityData.availability_id,
        start: new Date(availabilityData.start_time).toISOString(),
        end: new Date(availabilityData.end_time).toISOString(),
        booked: availabilityData.session_id || "",
      };

      res.status(200).json({
        success: true,
        data: availability,
      });
    } catch (error) {
      console.error("Get availability by ID error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
}

export default MentorAvailabilityController;
