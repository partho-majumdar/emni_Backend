import { Request, Response, NextFunction } from "express";
import db from "../../config/database";
import { RowDataPacket } from "mysql2";
import crypto from "crypto";
import cron from "node-cron";

interface BookSessionRequest {
  AvailabilityID: string;
  medium: "online" | "offline";
}

interface JwtPayload {
  user_id: string;
  user_type?: string;
}

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export class StudentSessionController {
  static async bookSession(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.user_id;
    const sessionId = req.params.sessionID;
    const { AvailabilityID, medium } = req.body as BookSessionRequest;

    if (!userId) {
      console.log("Unauthorized: No user ID in JWT token");
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!sessionId || !AvailabilityID || !medium) {
      console.log(
        "Invalid input: sessionId, AvailabilityID, or medium missing"
      );
      return res.status(400).json({
        success: false,
        message: "Session ID, Availability ID, and medium are required",
      });
    }

    if (medium !== "online" && medium !== "offline") {
      return res.status(400).json({
        success: false,
        message: "Medium must be either 'online' or 'offline'",
      });
    }

    try {
      await db.query("START TRANSACTION");

      // Step 1: Verify student exists in Students table
      const [studentRows] = await db.query<RowDataPacket[]>(
        "SELECT student_id FROM Students WHERE user_id = ?",
        [userId]
      );
      console.log("Student check:", studentRows);
      if (studentRows.length === 0) {
        await db.query("ROLLBACK");
        return res
          .status(404)
          .json({ success: false, message: "Student profile not found" });
      }
      const student = studentRows[0];

      // Step 2: Validate session and availability
      const [sessionRows] = await db.query<RowDataPacket[]>(
        `
        SELECT
          s.session_id,
          ma.availability_id,
          ma.is_booked,
          ma.start_time,
          ma.end_time,
          ma.mentor_id,
          ma.is_online,
          ma.is_offline
        FROM Sessions s
        JOIN Mentor_Availability ma ON s.mentor_id = ma.mentor_id
        WHERE s.session_id = ?
          AND ma.availability_id = ?
          AND ma.is_booked = FALSE
          AND (
            (ma.is_online = TRUE AND ? = 'online') OR
            (ma.is_offline = TRUE AND ? = 'offline')
          )
        `,
        [sessionId, AvailabilityID, medium, medium]
      );

      console.log("Session and availability check result:", sessionRows);
      if (sessionRows.length === 0) {
        const [sessionCheck] = await db.query<RowDataPacket[]>(
          "SELECT session_id, mentor_id FROM Sessions WHERE session_id = ?",
          [sessionId]
        );
        const [availabilityCheck] = await db.query<RowDataPacket[]>(
          "SELECT availability_id, mentor_id, is_booked, is_online, is_offline FROM Mentor_Availability WHERE availability_id = ?",
          [AvailabilityID]
        );
        console.log("Session exists:", sessionCheck);
        console.log("Availability exists:", availabilityCheck);

        let errorMessage =
          "Session or availability not found or already booked";
        if (sessionCheck.length === 0) {
          errorMessage = "Session not found";
        } else if (availabilityCheck.length === 0) {
          errorMessage = "Availability not found";
        } else if (availabilityCheck[0].is_booked) {
          errorMessage = "Availability already booked";
        } else if (
          sessionCheck[0].mentor_id !== availabilityCheck[0].mentor_id
        ) {
          errorMessage = "Session and availability belong to different mentors";
        } else if (
          (medium === "online" && !availabilityCheck[0].is_online) ||
          (medium === "offline" && !availabilityCheck[0].is_offline)
        ) {
          errorMessage = `Availability is not marked as ${medium}`;
        }

        await db.query("ROLLBACK");
        return res.status(404).json({ success: false, message: errorMessage });
      }
      const sessionData = sessionRows[0];

      // Step 3: Check for overlapping bookings using DATETIME
      const [overlappingRows] = await db.query<RowDataPacket[]>(
        `
        SELECT COUNT(*) as count
        FROM Mentor_Availability ma
        JOIN One_On_One_Sessions oos ON ma.availability_id = oos.availability_id
        WHERE ma.mentor_id = ?
        AND (
          (ma.start_time < ? AND ma.end_time > ?) OR
          (ma.start_time < ? AND ma.end_time > ?) OR
          (ma.start_time >= ? AND ma.end_time <= ?)
        )
        AND ma.is_booked = TRUE
        `,
        [
          sessionData.mentor_id,
          sessionData.end_time,
          sessionData.start_time,
          sessionData.end_time,
          sessionData.start_time,
          sessionData.start_time,
          sessionData.end_time,
        ]
      );
      console.log("Overlap check:", overlappingRows);
      const overlapCount = overlappingRows[0].count;

      if (overlapCount > 0) {
        await db.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Time slot conflicts with existing booking",
        });
      }

      // Step 4: Insert into One_On_One_Sessions
      const oneOnOneSessionId = crypto.randomUUID();
      const [insertResult] = await db.query(
        `
        INSERT INTO One_On_One_Sessions (one_on_one_session_id, availability_id, student_id, created_at, medium)
        VALUES (?, ?, ?, NOW(), ?)
        `,
        [oneOnOneSessionId, AvailabilityID, student.student_id, medium]
      );
      console.log("Inserted into One_On_One_Sessions:", insertResult);

      // Step 5: Update Mentor_Availability
      const [updateResult] = await db.query(
        `
        UPDATE Mentor_Availability
        SET is_booked = TRUE, session_id = ?
        WHERE availability_id = ?
        `,
        [sessionId, AvailabilityID]
      );
      console.log("Updated Mentor_Availability:", updateResult);

      // Verify the update
      const [verifyUpdate] = await db.query<RowDataPacket[]>(
        `
        SELECT is_booked, session_id
        FROM Mentor_Availability
        WHERE availability_id = ?
        `,
        [AvailabilityID]
      );
      console.log("Verified Mentor_Availability update:", verifyUpdate);
      if (
        verifyUpdate.length === 0 ||
        !verifyUpdate[0].is_booked ||
        verifyUpdate[0].session_id !== sessionId
      ) {
        await db.query("ROLLBACK");
        return res
          .status(500)
          .json({ success: false, message: "Failed to update availability" });
      }

      await db.query("COMMIT");

      res.status(200).json({
        success: true,
      });
    } catch (error: any) {
      await db.query("ROLLBACK");
      console.error("Error booking session:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }

  static async mentorUpdateSessionPlace(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const mentorUserId = req.user?.user_id;
      const sessionId = req.params.sessionId;
      const { place } = req.body as { place: string };

      if (!mentorUserId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      if (!sessionId || !place) {
        res.status(400).json({
          success: false,
          message: "Session ID and place are required",
        });
        return;
      }

      // Verify mentor owns this session
      const [session] = await db.query<RowDataPacket[]>(
        `SELECT oos.one_on_one_session_id 
         FROM One_On_One_Sessions oos
         JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
         JOIN Mentors m ON ma.mentor_id = m.mentor_id
         WHERE oos.one_on_one_session_id = ? 
         AND m.user_id = ?`,
        [sessionId, mentorUserId]
      );

      if (session.length === 0) {
        res.status(404).json({
          success: false,
          message: "Session not found or you don't have permission",
        });
        return;
      }

      // Update place
      await db.query(
        `UPDATE One_On_One_Sessions 
         SET place = ?
         WHERE one_on_one_session_id = ?`,
        [place, sessionId]
      );

      res.status(200).json({
        success: true,
        // message: "Session location updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  static async getBookedSessionBySessionID(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const bookedId = req.params.bookedId;

      if (!bookedId) {
        res.status(400).json({
          success: false,
          message: "Booked session ID is required",
        });
        return;
      }

      // Get session details
      const [session] = await db.query<RowDataPacket[]>(
        `SELECT 
          student_id,
          availability_id
         FROM One_On_One_Sessions
         WHERE one_on_one_session_id = ?`,
        [bookedId]
      );

      if (session.length === 0) {
        res.status(404).json({
          success: false,
          message: "Session not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          studentId: session[0].student_id,
          availabilityId: session[0].availability_id,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateSessionStatuses() {
    try {
      await db.query("START TRANSACTION");

      // Update Ongoing sessions
      await db.query(
        `UPDATE Mentor_Availability
         SET status = 'Ongoing'
         WHERE is_booked = TRUE
           AND status = 'Upcoming'
           AND start_time <= NOW()
           AND end_time >= NOW()`
      );

      // Update Completed sessions
      await db.query(
        `UPDATE Mentor_Availability
         SET status = 'Completed'
         WHERE is_booked = TRUE
           AND status IN ('Upcoming', 'Ongoing')
           AND end_time < NOW()`
      );

      // Update Cancelled sessions
      await db.query(
        `UPDATE Mentor_Availability
         SET status = 'Cancelled'
         WHERE is_booked = FALSE
           AND status = 'Upcoming'
           AND end_time < NOW()`
      );

      await db.query("COMMIT");
      console.log("1:1 Session statuses updated successfully");
      return { success: true, message: "1:1 Session statuses updated" };
    } catch (error: any) {
      await db.query("ROLLBACK");
      console.error("Error updating session statuses:", error);
      return { success: false, message: error.message };
    }
  }
}

// Cron job for status updates (runs every 10 minutes)
cron.schedule("*/10 * * * *", async () => {
  console.log("Running 1:1 session status update...");
  try {
    const result = await StudentSessionController.updateSessionStatuses();
    console.log("1:1 Session Status update result:", result);
  } catch (error) {
    console.error("Error in scheduled status update:", error);
  }
});
