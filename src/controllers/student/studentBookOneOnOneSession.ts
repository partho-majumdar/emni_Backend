import { Request, Response } from "express";
import db from "../../config/database";
import { RowDataPacket } from "mysql2";
import crypto from "crypto";

// Interface for request body
interface BookSessionRequest {
  AvailabilityID: string;
}

// Define JwtPayload for JWT authentication
interface JwtPayload {
  user_id: string;
  user_type?: string;
}

// Extend Request for type safety
interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// Interface for response data
interface BookSessionResponse {
  sessionId: string;
  availabilityId: string;
  oneOnOneSessionId: string;
}

export class StudentSessionController {
  static async bookSession(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.user_id;
    const sessionId = req.params.sessionID;
    const { AvailabilityID } = req.body as BookSessionRequest;

    if (!userId) {
      console.log("Unauthorized: No user ID in JWT token");
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!sessionId || !AvailabilityID) {
      console.log("Invalid input: sessionId or AvailabilityID missing");
      return res.status(400).json({
        success: false,
        message: "Session ID and Availability ID are required",
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

      // Step 2: Validate session and availability in Sessions and Mentor_Availability tables
      const [sessionRows] = await db.query<RowDataPacket[]>(
        `
        SELECT 
          s.session_id, 
          ma.availability_id, 
          ma.is_booked, 
          ma.start_time, 
          ma.end_time, 
          ma.available_date,
          ma.mentor_id
        FROM Sessions s
        JOIN Mentor_Availability ma ON s.mentor_id = ma.mentor_id
        WHERE s.session_id = ? AND ma.availability_id = ? AND ma.is_booked = FALSE
        `,
        [sessionId, AvailabilityID]
      );
      console.log("Session and availability check result:", sessionRows);
      if (sessionRows.length === 0) {
        // Debug why the query failed
        const [sessionCheck] = await db.query<RowDataPacket[]>(
          "SELECT session_id, mentor_id FROM Sessions WHERE session_id = ?",
          [sessionId]
        );
        const [availabilityCheck] = await db.query<RowDataPacket[]>(
          "SELECT availability_id, mentor_id, is_booked FROM Mentor_Availability WHERE availability_id = ?",
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
        }

        await db.query("ROLLBACK");
        return res.status(404).json({ success: false, message: errorMessage });
      }
      const sessionData = sessionRows[0];

      // Step 3: Check for overlapping bookings in Mentor_Availability and One_On_One_Sessions
      const [overlappingRows] = await db.query<RowDataPacket[]>(
        `
        SELECT COUNT(*) as count
        FROM Mentor_Availability ma
        JOIN One_On_One_Sessions oos ON ma.availability_id = oos.availability_id
        WHERE ma.mentor_id = ?
        AND ma.available_date = ?
        AND (
          (ma.start_time <= ? AND ma.end_time > ?) OR
          (ma.start_time < ? AND ma.end_time >= ?) OR
          (ma.start_time >= ? AND ma.end_time <= ?)
        )
        AND ma.is_booked = TRUE
        `,
        [
          sessionData.mentor_id,
          sessionData.available_date,
          sessionData.start_time,
          sessionData.start_time,
          sessionData.end_time,
          sessionData.end_time,
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

      // Step 4: Insert new record in One_On_One_Sessions (Value Addition)
      const oneOnOneSessionId = crypto.randomUUID();
      const [insertResult] = await db.query(
        `
        INSERT INTO One_On_One_Sessions (one_on_one_session_id, availability_id, student_id, created_at)
        VALUES (?, ?, ?, NOW())
        `,
        [oneOnOneSessionId, AvailabilityID, student.student_id]
      );
      console.log("Inserted into One_On_One_Sessions:", insertResult);

      // Step 5: Update Mentor_Availability to mark as booked and set session_id (Value Change)
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
}
