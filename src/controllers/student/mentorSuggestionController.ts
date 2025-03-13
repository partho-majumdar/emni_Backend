import { Request, Response } from "express";
import db from "../../config/database";
import { RowDataPacket } from "mysql2";

interface JwtPayload {
  user_id: string;
  user_type?: string;
}

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export const getSuggestedMentors = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const studentUserId = req.user?.user_id;

  if (!studentUserId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    // Verify student exists
    const [student] = await db.query<RowDataPacket[]>(
      "SELECT user_id FROM Students WHERE user_id = ?",
      [studentUserId]
    );
    if (student.length === 0) {
      return res
        .status(403)
        .json({ success: false, message: "User is not a student" });
    }

    // Get matching mentors
    const [mentors] = await db.query<RowDataPacket[]>(
      `
      SELECT 
        m.mentor_id,
        u.name,
        u.email,
        m.bio,
        m.social_link,
        m.image_url,
        m.organization,
        COUNT(ui.interest_id) AS matching_interests_count,
        GROUP_CONCAT(i.interest_name) AS matching_interests
      FROM Users u
      JOIN Mentors m ON u.user_id = m.user_id
      JOIN User_Interests ui ON u.user_id = ui.user_id
      JOIN Interests i ON ui.interest_id = i.interest_id
      WHERE m.is_approved = TRUE
        AND ui.interest_id IN (
          SELECT interest_id 
          FROM User_Interests 
          WHERE user_id = ?
        )
      GROUP BY m.mentor_id
      HAVING matching_interests_count >= 1
      ORDER BY matching_interests_count DESC
    `,
      [studentUserId]
    );

    res.status(200).json({
      success: true,
      data: {
        mentors: mentors.map((mentor) => ({
          mentor_id: mentor.mentor_id,
          name: mentor.name,
          email: mentor.email,
          bio: mentor.bio,
          social_link: mentor.social_link,
          image_url: mentor.image_url,
          organization: mentor.organization,
          matching_interests_count: mentor.matching_interests_count,
          matching_interests: mentor.matching_interests.split(","),
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching suggested mentors:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
