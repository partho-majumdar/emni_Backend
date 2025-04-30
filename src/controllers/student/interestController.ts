import { Request, Response } from "express";
import db from "../../config/database";
import { RowDataPacket } from "mysql2";

// Define InterestType to match response format
interface InterestType {
  interest_id: string;
  interest_name: string;
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

export class StudentInterestController {
  // Fetch the authenticated student's chosen interests
  static async getStudentInterests(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
      // Verify user is a student
      const [student] = await db.query<RowDataPacket[]>(
        "SELECT user_id FROM Students WHERE user_id = ?",
        [userId]
      );
      if (student.length === 0) {
        return res
          .status(403)
          .json({ success: false, message: "User is not a student" });
      }

      // Fetch interests
      const [interests] = await db.query<RowDataPacket[]>(
        `SELECT i.interest_id, i.interest_name 
         FROM User_Interests ui 
         JOIN Interests i ON ui.interest_id = i.interest_id 
         WHERE ui.user_id = ?`,
        [userId]
      );

      res
        .status(200)
        .json({ success: true, data: interests as InterestType[] });
    } catch (error) {
      console.error("Error fetching student interests:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  // Update student's interests by replacing existing ones
  static async updateStudentInterests(
    req: AuthenticatedRequest,
    res: Response
  ) {
    const userId = req.user?.user_id;
    const { interestIds } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!interestIds || !Array.isArray(interestIds)) {
      return res.status(400).json({
        success: false,
        message: "Invalid interest IDs: must be an array",
      });
    }

    try {
      await db.query("START TRANSACTION");

      // Verify user is a student
      const [student] = await db.query<RowDataPacket[]>(
        "SELECT user_id FROM Students WHERE user_id = ?",
        [userId]
      );
      if (student.length === 0) {
        await db.query("ROLLBACK");
        return res
          .status(403)
          .json({ success: false, message: "User is not a student" });
      }

      // Validate interest IDs
      const [validInterests] = await db.query<RowDataPacket[]>(
        "SELECT interest_id FROM Interests WHERE interest_id IN (?)",
        [interestIds]
      );
      const validInterestIds = validInterests.map((i) => i.interest_id);
      if (validInterestIds.length !== interestIds.length) {
        await db.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "One or more interest IDs are invalid",
        });
      }

      // Delete all existing interests
      await db.query("DELETE FROM User_Interests WHERE user_id = ?", [userId]);

      // Insert new interests (if any)
      let data: InterestType[] = [];
      if (interestIds.length > 0) {
        const uniqueInterestIds = [...new Set(interestIds)];
        const values = uniqueInterestIds.map((interestId) => [
          userId,
          interestId,
        ]);
        await db.query(
          "INSERT INTO User_Interests (user_id, interest_id) VALUES ?",
          [values]
        );

        // Fetch the newly added interests
        const [updatedInterests] = await db.query<RowDataPacket[]>(
          `SELECT i.interest_id, i.interest_name 
           FROM User_Interests ui
           JOIN Interests i ON ui.interest_id = i.interest_id
           WHERE ui.user_id = ?`,
          [userId]
        );
        data = updatedInterests as InterestType[];
      }

      await db.query("COMMIT");
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      await db.query("ROLLBACK");
      console.error("Error updating student interests:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
}
