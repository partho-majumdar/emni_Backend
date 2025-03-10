import { Request, Response } from "express";
import db from "../../config/database";
import { RowDataPacket } from "mysql2";

export const getAllInterests = async (req: Request, res: Response) => {
  try {
    const [interests] = await db.query<RowDataPacket[]>(
      "SELECT interest_id, interest_name FROM Interests"
    );
    res.status(200).json({ success: true, data: interests });
  } catch (error) {
    console.error("Error fetching all interests:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
