// import { Request, Response } from "express";
// import db from "../../config/database";
// import { RowDataPacket } from "mysql2";
// import crypto from "crypto";
// import cron from "node-cron";

// // Interface for request body
// interface BookSessionRequest {
//   AvailabilityID: string;
//   medium: "online" | "offline";
// }

// // Define JwtPayload for JWT authentication
// interface JwtPayload {
//   user_id: string;
//   user_type?: string;
// }

// // Extend Request for type safety
// interface AuthenticatedRequest extends Request {
//   user?: JwtPayload;
// }

// export class StudentSessionController {
//   static async bookSession(req: AuthenticatedRequest, res: Response) {
//     const userId = req.user?.user_id;
//     const sessionId = req.params.sessionID;
//     const { AvailabilityID, medium } = req.body as {
//       AvailabilityID: string;
//       medium: "online" | "offline";
//     };

//     if (!userId) {
//       console.log("Unauthorized: No user ID in JWT token");
//       return res.status(401).json({ success: false, message: "Unauthorized" });
//     }

//     if (!sessionId || !AvailabilityID || !medium) {
//       console.log(
//         "Invalid input: sessionId, AvailabilityID, or medium missing"
//       );
//       return res.status(400).json({
//         success: false,
//         message: "Session ID, Availability ID, and medium are required",
//       });
//     }

//     if (medium !== "online" && medium !== "offline") {
//       return res.status(400).json({
//         success: false,
//         message: "Medium must be either 'online' or 'offline'",
//       });
//     }

//     try {
//       await db.query("START TRANSACTION");

//       // Step 1: Verify student exists in Students table
//       const [studentRows] = await db.query<RowDataPacket[]>(
//         "SELECT student_id FROM Students WHERE user_id = ?",
//         [userId]
//       );
//       console.log("Student check:", studentRows);
//       if (studentRows.length === 0) {
//         await db.query("ROLLBACK");
//         return res
//           .status(404)
//           .json({ success: false, message: "Student profile not found" });
//       }
//       const student = studentRows[0];

//       // Step 2: Validate session and availability
//       const [sessionRows] = await db.query<RowDataPacket[]>(
//         `
//         SELECT
//           s.session_id,
//           ma.availability_id,
//           ma.is_booked,
//           ma.start_time,
//           ma.end_time,
//           ma.available_date,
//           ma.mentor_id,
//           ma.is_online,
//           ma.is_offline
//         FROM Sessions s
//         JOIN Mentor_Availability ma ON s.mentor_id = ma.mentor_id
//         WHERE s.session_id = ?
//           AND ma.availability_id = ?
//           AND ma.is_booked = FALSE
//           AND (
//             (ma.is_online = TRUE AND ? = 'online') OR
//             (ma.is_offline = TRUE AND ? = 'offline')
//           )
//         `,
//         [sessionId, AvailabilityID, medium, medium]
//       );

//       console.log("Session and availability check result:", sessionRows);
//       if (sessionRows.length === 0) {
//         // Debug why the query failed
//         const [sessionCheck] = await db.query<RowDataPacket[]>(
//           "SELECT session_id, mentor_id FROM Sessions WHERE session_id = ?",
//           [sessionId]
//         );
//         const [availabilityCheck] = await db.query<RowDataPacket[]>(
//           "SELECT availability_id, mentor_id, is_booked, is_online, is_offline FROM Mentor_Availability WHERE availability_id = ?",
//           [AvailabilityID]
//         );
//         console.log("Session exists:", sessionCheck);
//         console.log("Availability exists:", availabilityCheck);

//         let errorMessage =
//           "Session or availability not found or already booked";
//         if (sessionCheck.length === 0) {
//           errorMessage = "Session not found";
//         } else if (availabilityCheck.length === 0) {
//           errorMessage = "Availability not found";
//         } else if (availabilityCheck[0].is_booked) {
//           errorMessage = "Availability already booked";
//         } else if (
//           sessionCheck[0].mentor_id !== availabilityCheck[0].mentor_id
//         ) {
//           errorMessage = "Session and availability belong to different mentors";
//         } else if (
//           (medium === "online" && !availabilityCheck[0].is_online) ||
//           (medium === "offline" && !availabilityCheck[0].is_offline)
//         ) {
//           errorMessage = `Availability is not marked as ${medium}`;
//         }

//         await db.query("ROLLBACK");
//         return res.status(404).json({ success: false, message: errorMessage });
//       }
//       const sessionData = sessionRows[0];

//       // Step 3: Check for overlapping bookings
//       const [overlappingRows] = await db.query<RowDataPacket[]>(
//         `
//         SELECT COUNT(*) as count
//         FROM Mentor_Availability ma
//         JOIN One_On_One_Sessions oos ON ma.availability_id = oos.availability_id
//         WHERE ma.mentor_id = ?
//         AND ma.available_date = ?
//         AND (
//           (ma.start_time <= ? AND ma.end_time > ?) OR
//           (ma.start_time < ? AND ma.end_time >= ?) OR
//           (ma.start_time >= ? AND ma.end_time <= ?)
//         )
//         AND ma.is_booked = TRUE
//         `,
//         [
//           sessionData.mentor_id,
//           sessionData.available_date,
//           sessionData.start_time,
//           sessionData.start_time,
//           sessionData.end_time,
//           sessionData.end_time,
//           sessionData.start_time,
//           sessionData.end_time,
//         ]
//       );
//       console.log("Overlap check:", overlappingRows);
//       const overlapCount = overlappingRows[0].count;

//       if (overlapCount > 0) {
//         await db.query("ROLLBACK");
//         return res.status(400).json({
//           success: false,
//           message: "Time slot conflicts with existing booking",
//         });
//       }

//       // Step 4: Insert into One_On_One_Sessions
//       const oneOnOneSessionId = crypto.randomUUID();
//       const [insertResult] = await db.query(
//         `
//         INSERT INTO One_On_One_Sessions (one_on_one_session_id, availability_id, student_id, created_at, medium)
//         VALUES (?, ?, ?, NOW(), ?)
//         `,
//         [oneOnOneSessionId, AvailabilityID, student.student_id, medium]
//       );
//       console.log("Inserted into One_On_One_Sessions:", insertResult);

//       // Step 5: Update Mentor_Availability
//       const [updateResult] = await db.query(
//         `
//         UPDATE Mentor_Availability
//         SET is_booked = TRUE, session_id = ?
//         WHERE availability_id = ?
//         `,
//         [sessionId, AvailabilityID]
//       );
//       console.log("Updated Mentor_Availability:", updateResult);

//       // Verify the update
//       const [verifyUpdate] = await db.query<RowDataPacket[]>(
//         `
//         SELECT is_booked, session_id
//         FROM Mentor_Availability
//         WHERE availability_id = ?
//         `,
//         [AvailabilityID]
//       );
//       console.log("Verified Mentor_Availability update:", verifyUpdate);
//       if (
//         verifyUpdate.length === 0 ||
//         !verifyUpdate[0].is_booked ||
//         verifyUpdate[0].session_id !== sessionId
//       ) {
//         await db.query("ROLLBACK");
//         return res
//           .status(500)
//           .json({ success: false, message: "Failed to update availability" });
//       }

//       await db.query("COMMIT");

//       res.status(200).json({
//         success: true,
//       });
//     } catch (error: any) {
//       await db.query("ROLLBACK");
//       console.error("Error booking session:", error);
//       res.status(500).json({
//         success: false,
//         message: "Server error",
//         error: error.message,
//       });
//     }
//   }

//   static async updateSessionStatuses() {
//     try {
//       await db.query("START TRANSACTION");

//       // Update Ongoing sessions
//       await db.query(
//         `UPDATE Mentor_Availability
//          SET status = 'Ongoing'
//          WHERE is_booked = TRUE
//            AND status = 'Upcoming'
//            AND available_date = CURDATE()
//            AND start_time <= CURTIME()
//            AND end_time >= CURTIME()`
//       );

//       // Update Completed sessions
//       await db.query(
//         `UPDATE Mentor_Availability
//          SET status = 'Completed'
//          WHERE is_booked = TRUE
//            AND status IN ('Upcoming', 'Ongoing')
//            AND (
//              available_date < CURDATE() OR
//              (available_date = CURDATE() AND end_time < CURTIME())
//            )`
//       );

//       // Update Cancelled sessions
//       await db.query(
//         `UPDATE Mentor_Availability
//          SET status = 'Cancelled'
//          WHERE is_booked = FALSE
//            AND status = 'Upcoming'
//            AND (
//              available_date < CURDATE() OR
//              (available_date = CURDATE() AND end_time < CURTIME())
//            )`
//       );

//       await db.query("COMMIT");
//       console.log("Session statuses updated successfully");
//       return { success: true, message: "Session statuses updated" };
//     } catch (error: any) {
//       await db.query("ROLLBACK");
//       console.error("Error updating session statuses:", error);
//       return { success: false, message: error.message };
//     }
//   }

//   static async getSessionStatus(req: AuthenticatedRequest, res: Response) {
//     const { availabilityId } = req.params;

//     try {
//       const [session] = await db.query<RowDataPacket[]>(
//         `
//         SELECT
//           ma.status,
//           ma.available_date,
//           ma.start_time,
//           ma.end_time,
//           s.session_title,
//           s.description,
//           s.duration_mins,
//           s.price,
//           u.name as mentor_name,
//           oos.medium,
//           oos.created_at as booking_time
//         FROM Mentor_Availability ma
//         JOIN Sessions s ON ma.session_id = s.session_id
//         JOIN Mentors m ON ma.mentor_id = m.mentor_id
//         JOIN Users u ON m.user_id = u.user_id
//         LEFT JOIN One_On_One_Sessions oos ON ma.availability_id = oos.availability_id
//         WHERE ma.availability_id = ?
//         `,
//         [availabilityId]
//       );

//       if (session.length === 0) {
//         return res.status(404).json({
//           success: false,
//           message: "Session not found",
//         });
//       }

//       res.status(200).json({
//         success: true,
//         data: session[0],
//       });
//     } catch (error: any) {
//       console.error("Error getting session status:", error);
//       res.status(500).json({
//         success: false,
//         message: "Failed to get session status",
//         error: error.message,
//       });
//     }
//   }
// }

// // Cron job for status updates (runs every 10 minutes)
// cron.schedule("*/10 * * * *", async () => {
//   console.log("Running session status update...");
//   try {
//     const result = await StudentSessionController.updateSessionStatuses();
//     console.log("Status update result:", result);
//   } catch (error) {
//     console.error("Error in scheduled status update:", error);
//   }
// });

import { Request, Response } from "express";
import db from "../../config/database";
import { RowDataPacket } from "mysql2";
import crypto from "crypto";
import cron from "node-cron";

// Interface for request body
interface BookSessionRequest {
  AvailabilityID: string;
  medium: "online" | "offline";
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

export class StudentSessionController {
  static async bookSession(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.user_id;
    const sessionId = req.params.sessionID;
    const { AvailabilityID, medium } = req.body as {
      AvailabilityID: string;
      medium: "online" | "offline";
    };

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
        // Debug why the query failed
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
      console.log("Session statuses updated successfully");
      return { success: true, message: "Session statuses updated" };
    } catch (error: any) {
      await db.query("ROLLBACK");
      console.error("Error updating session statuses:", error);
      return { success: false, message: error.message };
    }
  }

  static async getSessionStatus(req: AuthenticatedRequest, res: Response) {
    const { availabilityId } = req.params;

    try {
      const [session] = await db.query<RowDataPacket[]>(
        `
        SELECT 
          ma.status,
          DATE(ma.start_time) as available_date,
          ma.start_time,
          ma.end_time,
          s.session_title,
          s.description,
          s.duration_mins,
          s.price,
          u.name as mentor_name,
          oos.medium,
          oos.created_at as booking_time
        FROM Mentor_Availability ma
        JOIN Sessions s ON ma.session_id = s.session_id
        JOIN Mentors m ON ma.mentor_id = m.mentor_id
        JOIN Users u ON m.user_id = u.user_id
        LEFT JOIN One_On_One_Sessions oos ON ma.availability_id = oos.availability_id
        WHERE ma.availability_id = ?
        `,
        [availabilityId]
      );

      if (session.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Session not found",
        });
      }

      res.status(200).json({
        success: true,
        data: session[0],
      });
    } catch (error: any) {
      console.error("Error getting session status:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get session status",
        error: error.message,
      });
    }
  }
}

// Cron job for status updates (runs every 10 minutes)
cron.schedule("*/10 * * * *", async () => {
  console.log("Running session status update...");
  try {
    const result = await StudentSessionController.updateSessionStatuses();
    console.log("Status update result:", result);
  } catch (error) {
    console.error("Error in scheduled status update:", error);
  }
});
