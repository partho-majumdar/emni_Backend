// import { Request, Response } from "express";
// import db from "../../config/database";
// import { RowDataPacket } from "mysql2";

// // Define the user interface to match the JWT payload
// interface JwtPayload {
//   user_id: string;
//   user_type?: string;
// }

// // Extend Request type for type safety
// interface AuthenticatedRequest extends Request {
//   user?: JwtPayload;
// }

// // Fetch the authenticated mentor's chosen interests
// export const getMentorInterests = async (
//   req: AuthenticatedRequest,
//   res: Response
// ) => {
//   const userId = req.user?.user_id;

//   if (!userId) {
//     return res.status(401).json({ success: false, message: "Unauthorized" });
//   }

//   try {
//     const [mentor] = await db.query<RowDataPacket[]>(
//       "SELECT user_id FROM Mentors WHERE user_id = ?",
//       [userId]
//     );
//     if (mentor.length === 0) {
//       return res
//         .status(403)
//         .json({ success: false, message: "User is not a mentor" });
//     }

//     const [interests] = await db.query<RowDataPacket[]>(
//       `SELECT i.interest_id, i.interest_name
//        FROM User_Interests ui
//        JOIN Interests i ON ui.interest_id = i.interest_id
//        WHERE ui.user_id = ?`,
//       [userId]
//     );

//     res.status(200).json({ success: true, data: interests });
//   } catch (error) {
//     console.error("Error fetching mentor interests:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };

// export const addMentorInterests = async (
//   req: AuthenticatedRequest,
//   res: Response
// ) => {
//   console.log("req.user:", req.user);
//   const userId = req.user?.user_id;
//   console.log("userId:", userId);
//   const { interestIds } = req.body;

//   if (!userId) {
//     return res.status(401).json({ success: false, message: "Unauthorized" });
//   }

//   if (!interestIds || !Array.isArray(interestIds)) {
//     return res
//       .status(400)
//       .json({ success: false, message: "Invalid interest IDs" });
//   }

//   try {
//     await db.query("START TRANSACTION");

//     const [mentor] = await db.query<RowDataPacket[]>(
//       "SELECT user_id FROM Mentors WHERE user_id = ?",
//       [userId]
//     );
//     if (mentor.length === 0) {
//       throw new Error("User is not a mentor");
//     }

//     const [existingInterests] = await db.query<RowDataPacket[]>(
//       "SELECT * FROM User_Interests WHERE user_id = ?",
//       [userId]
//     );
//     if (existingInterests.length > 0) {
//       throw new Error(
//         "User already has interests. Use update endpoint instead."
//       );
//     }

//     const values = interestIds.map((interestId) => [userId, interestId]);
//     await db.query(
//       "INSERT INTO User_Interests (user_id, interest_id) VALUES ?",
//       [values]
//     );

//     await db.query("COMMIT");
//     res
//       .status(201)
//       .json({ success: true, message: "Mentor interests added successfully" });
//   } catch (error: any) {
//     await db.query("ROLLBACK");
//     console.error("Error adding mentor interests:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Server error",
//     });
//   }
// };

// export const updateMentorInterests = async (
//   req: AuthenticatedRequest,
//   res: Response
// ) => {
//   const userId = req.user?.user_id;
//   const { interestIds } = req.body;

//   if (!userId) {
//     return res.status(401).json({ success: false, message: "Unauthorized" });
//   }

//   if (!interestIds || !Array.isArray(interestIds)) {
//     return res.status(400).json({
//       success: false,
//       message: "Invalid interest IDs format",
//     });
//   }

//   try {
//     await db.query("START TRANSACTION");

//     // Verify mentor status
//     const [mentor] = await db.query<RowDataPacket[]>(
//       "SELECT user_id FROM Mentors WHERE user_id = ?",
//       [userId]
//     );
//     if (mentor.length === 0) {
//       throw new Error("User is not a mentor");
//     }

//     // Delete all existing interests
//     await db.query("DELETE FROM User_Interests WHERE user_id = ?", [userId]);

//     // If no interests provided, just return after deletion
//     if (interestIds.length === 0) {
//       await db.query("COMMIT");
//       return res.status(200).json({
//         success: true,
//         message: "All interests removed successfully",
//       });
//     }

//     // Filter unique interest IDs
//     const uniqueInterestIds = [...new Set(interestIds)];

//     // Insert new interests
//     const values = uniqueInterestIds.map((interestId) => [userId, interestId]);
//     await db.query(
//       "INSERT INTO User_Interests (user_id, interest_id) VALUES ?",
//       [values]
//     );

//     // Fetch the newly added interests with their names
//     const [updatedInterests] = await db.query<RowDataPacket[]>(
//       `SELECT i.interest_id, i.interest_name
//        FROM User_Interests ui
//        JOIN Interests i ON ui.interest_id = i.interest_id
//        WHERE ui.user_id = ?`,
//       [userId]
//     );

//     await db.query("COMMIT");
//     res.status(200).json({
//       success: true,
//       message: "Mentor interests updated successfully",
//       interestsUpdated: uniqueInterestIds.length,
//       interests: updatedInterests,
//     });
//   } catch (error: any) {
//     await db.query("ROLLBACK");
//     console.error("Mentor interest update error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message || "Internal server error",
//     });
//   }
// };

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
