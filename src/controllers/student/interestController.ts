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

// Fetch the authenticated student's chosen interests
export const getStudentInterests = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const userId = req.user?.user_id;

  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    const [student] = await db.query<RowDataPacket[]>(
      "SELECT user_id FROM Students WHERE user_id = ?",
      [userId]
    );
    if (student.length === 0) {
      return res
        .status(403)
        .json({ success: false, message: "User is not a student" });
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
    console.error("Error fetching student interests:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const addStudentInterests = async (
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

    const [student] = await db.query<RowDataPacket[]>(
      "SELECT user_id FROM Students WHERE user_id = ?",
      [userId]
    );
    if (student.length === 0) {
      throw new Error("User is not a student");
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
      .json({ success: true, message: "Student interests added successfully" });
  } catch (error: any) {
    await db.query("ROLLBACK");
    console.error("Error adding student interests:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

export const updateStudentInterests = async (
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

  // If interestIds is not provided or not an array, return an error
  if (!interestIds || !Array.isArray(interestIds)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid interest IDs" });
  }

  try {
    await db.query("START TRANSACTION");

    const [student] = await db.query<RowDataPacket[]>(
      "SELECT user_id FROM Students WHERE user_id = ?",
      [userId]
    );
    if (student.length === 0) {
      throw new Error("User is not a student");
    }

    // If interestIds is empty, keep existing interests (no changes)
    if (interestIds.length === 0) {
      await db.query("COMMIT");
      return res.status(200).json({
        success: true,
        message: "No changes made to student interests",
      });
    }

    // Delete existing interests
    await db.query("DELETE FROM User_Interests WHERE user_id = ?", [userId]);

    // Insert ALL new interests from the request
    const values = interestIds.map((interestId) => [userId, interestId]);
    await db.query(
      "INSERT INTO User_Interests (user_id, interest_id) VALUES ?",
      [values]
    );

    await db.query("COMMIT");
    res.status(200).json({
      success: true,
      message: "Student interests updated successfully",
    });
  } catch (error: any) {
    await db.query("ROLLBACK");
    console.error("Error updating student interests:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};
