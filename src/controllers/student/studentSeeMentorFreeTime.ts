import { Request, Response } from "express";
import pool from "../../config/database";

class MentorAvailabilityController {
  static async getMentorAvailability(req: Request, res: Response) {
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
}

export default MentorAvailabilityController;
