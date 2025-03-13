import { Request, Response } from "express";
import db from "../../config/database";
import { RowDataPacket } from "mysql2";

// Define the user interface to match the JWT payload
interface JwtPayload {
  user_id: string;
  user_type?: string;
}

// Extend Request type for type safety
interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// Fetch the authenticated mentor's chosen interests
export const getMentorInterests = async (
  req: AuthenticatedRequest,
  res: Response
) => {
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

    res.status(200).json({ success: true, data: interests });
  } catch (error) {
    console.error("Error fetching mentor interests:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const addMentorInterests = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  console.log("req.user:", req.user);
  const userId = req.user?.user_id;
  console.log("userId:", userId);
  const { interestIds } = req.body;

  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  if (!interestIds || !Array.isArray(interestIds)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid interest IDs" });
  }

  try {
    await db.query("START TRANSACTION");

    const [mentor] = await db.query<RowDataPacket[]>(
      "SELECT user_id FROM Mentors WHERE user_id = ?",
      [userId]
    );
    if (mentor.length === 0) {
      throw new Error("User is not a mentor");
    }

    const [existingInterests] = await db.query<RowDataPacket[]>(
      "SELECT * FROM User_Interests WHERE user_id = ?",
      [userId]
    );
    if (existingInterests.length > 0) {
      throw new Error(
        "User already has interests. Use update endpoint instead."
      );
    }

    const values = interestIds.map((interestId) => [userId, interestId]);
    await db.query(
      "INSERT INTO User_Interests (user_id, interest_id) VALUES ?",
      [values]
    );

    await db.query("COMMIT");
    res
      .status(201)
      .json({ success: true, message: "Mentor interests added successfully" });
  } catch (error: any) {
    await db.query("ROLLBACK");
    console.error("Error adding mentor interests:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

export const updateMentorInterests = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const userId = req.user?.user_id;
  const { interestIds } = req.body;

  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  if (!interestIds || !Array.isArray(interestIds)) {
    return res.status(400).json({
      success: false,
      message: "Invalid interest IDs format",
    });
  }

  try {
    await db.query("START TRANSACTION");

    // Verify mentor status
    const [mentor] = await db.query<RowDataPacket[]>(
      "SELECT user_id FROM Mentors WHERE user_id = ?",
      [userId]
    );
    if (mentor.length === 0) {
      throw new Error("User is not a mentor");
    }

    // Get existing mentor interests
    const [existingInterests] = await db.query<RowDataPacket[]>(
      "SELECT interest_id FROM User_Interests WHERE user_id = ?",
      [userId]
    );
    const existingIds = existingInterests.map(
      (interest) => interest.interest_id
    );

    // Process new interests
    const uniqueNewIds = [...new Set(interestIds)]; // Remove request duplicates
    const newInterestIds = uniqueNewIds.filter(
      (id) => !existingIds.includes(id)
    );

    if (newInterestIds.length === 0) {
      await db.query("COMMIT");
      return res.status(200).json({
        success: true,
        message: "No new interests to add",
      });
    }

    // Insert only novel interests
    const values = newInterestIds.map((id) => [userId, id]);
    await db.query(
      "INSERT INTO User_Interests (user_id, interest_id) VALUES ?",
      [values]
    );

    await db.query("COMMIT");
    res.status(200).json({
      success: true,
      message: "Mentor interests updated successfully",
      newInterestsAdded: newInterestIds.length,
    });
  } catch (error: any) {
    await db.query("ROLLBACK");
    console.error("Mentor interest update error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};
