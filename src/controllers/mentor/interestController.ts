import { Request, Response } from "express";
import db from "../../config/database";
import { RowDataPacket } from "mysql2";

interface InterestType {
  interest_id: string;
  interest_name: string;
}

interface JwtPayload {
  user_id: string;
  user_type?: string;
}

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export class MentorInterestController {
  static async getMentorInterests(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
      const [mentor] = await db.query<RowDataPacket[]>(
        "SELECT user_id FROM Mentors WHERE user_id = ?",
        [userId]
      );
      if (mentor.length === 0) {
        return res
          .status(403)
          .json({ success: false, message: "User is not a mentor" });
      }

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
      console.error("Error fetching mentor interests:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  static async updateMentorInterests(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.user_id;
    const { interestIds } = req.body;

    console.log(
      "PUT /api/mentor/interests - userId:",
      userId,
      "interestIds:",
      interestIds
    );

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!interestIds || !Array.isArray(interestIds)) {
      console.log("Invalid interestIds: not an array or undefined");
      return res.status(400).json({
        success: false,
        message: "Invalid interest IDs: must be an array",
      });
    }

    try {
      await db.query("START TRANSACTION");

      const [mentor] = await db.query<RowDataPacket[]>(
        "SELECT user_id FROM Mentors WHERE user_id = ?",
        [userId]
      );
      console.log("Mentor check:", mentor);
      if (mentor.length === 0) {
        await db.query("ROLLBACK");
        return res
          .status(403)
          .json({ success: false, message: "User is not a mentor" });
      }

      const [validInterests] = await db.query<RowDataPacket[]>(
        "SELECT interest_id, interest_name FROM Interests WHERE interest_id IN (?)",
        [interestIds]
      );
      const validInterestIds = validInterests.map((i) => i.interest_id);
      console.log(
        "Valid interest IDs:",
        validInterestIds,
        "Input interestIds:",
        interestIds
      );
      if (validInterestIds.length !== interestIds.length) {
        await db.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "One or more interest IDs are invalid",
        });
      }

      await db.query("DELETE FROM User_Interests WHERE user_id = ?", [userId]);
      console.log("Deleted existing interests for userId:", userId);

      let data: InterestType[] = [];
      if (interestIds.length > 0) {
        const uniqueInterestIds = [...new Set(interestIds)];
        const values = uniqueInterestIds.map((interestId) => [
          userId,
          interestId,
        ]);
        const [insertResult] = await db.query(
          "INSERT INTO User_Interests (user_id, interest_id) VALUES ?",
          [values]
        );
        console.log("Insert result:", insertResult);

        const [updatedInterests] = await db.query<RowDataPacket[]>(
          `SELECT i.interest_id, i.interest_name 
           FROM User_Interests ui
           JOIN Interests i ON ui.interest_id = i.interest_id
           WHERE ui.user_id = ?`,
          [userId]
        );
        data = updatedInterests as InterestType[];
        console.log("Fetched updated interests:", data);
      } else {
        console.log("No interests provided, returning empty data");
      }

      await db.query("COMMIT");
      console.log("Transaction committed, returning data:", data);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      await db.query("ROLLBACK");
      console.error("Error updating mentor interests:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
}
