import { Request, Response } from "express";
import pool from "../../config/database";

class MentorAvailabilityController {
  static async getMentorAvailability(req: Request, res: Response) {
    const { mentorId } = req.params;

    try {
      const [availabilitySlots]: any[] = await pool.query(
        `SELECT 
          availability_id as id,
          CONCAT(available_date, ' ', start_time) as start,
          CONCAT(available_date, ' ', end_time) as end,
          is_booked,
          COALESCE(session_id, '') as session_id
        FROM Mentor_Availability
        WHERE mentor_id = ?
          AND CONCAT(available_date, ' ', start_time) > NOW()
        ORDER BY available_date, start_time`,
        [mentorId]
      );

      if (!Array.isArray(availabilitySlots) || availabilitySlots.length === 0) {
        return res.status(200).json({
          message: "No available time slots found for this mentor",
          availability: [],
        });
      }

      // Format the response
      const formattedAvailability = availabilitySlots.map((slot: any) => ({
        id: slot.id,
        start: new Date(slot.start),
        end: new Date(slot.end),
        booked: slot.is_booked ? slot.session_id : "",
      }));

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
