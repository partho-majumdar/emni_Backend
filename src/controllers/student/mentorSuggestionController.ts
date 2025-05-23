// import { Request, Response } from "express";
// import db from "../../config/database";
// import { RowDataPacket } from "mysql2";

// interface JwtPayload {
//   user_id: string;
//   user_type?: string;
// }

// interface AuthenticatedRequest extends Request {
//   user?: JwtPayload;
// }

// type MentorLevelType = "Beginner" | "Intermediate" | "Advanced" | "Expert";

// export const getSuggestedMentorsInterestBased = async (
//   req: AuthenticatedRequest,
//   res: Response
// ) => {
//   const studentUserId = req.user?.user_id;
//   const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
//   // const baseUrl = "http://localhost:5000";

//   if (!studentUserId) {
//     return res.status(401).json({ success: false, message: "Unauthorized" });
//   }

//   try {
//     // Verify student exists
//     const [student] = await db.query<RowDataPacket[]>(
//       "SELECT student_id FROM Students WHERE user_id = ?",
//       [studentUserId]
//     );
//     if (student.length === 0) {
//       return res
//         .status(403)
//         .json({ success: false, message: "User is not a student" });
//     }

//     // Get matching mentors with their details and session counts
//     const [mentors] = await db.query<RowDataPacket[]>(
//       `
//       SELECT
//         m.mentor_id,
//         u.name,
//         u.email,
//         m.bio,
//         u.image_url,
//         COUNT(DISTINCT ui.interest_id) AS matching_interests_count,
//         GROUP_CONCAT(DISTINCT i.interest_name) AS matching_interests,
//         (
//           SELECT COUNT(*)
//           FROM One_On_One_Sessions o
//           JOIN Mentor_Availability ma ON o.availability_id = ma.availability_id
//           WHERE ma.mentor_id = m.mentor_id
//           AND ma.status = 'completed'
//         ) AS sessions_taken
//       FROM Users u
//       JOIN Mentors m ON u.user_id = m.user_id
//       JOIN User_Interests ui ON u.user_id = ui.user_id
//       JOIN Interests i ON ui.interest_id = i.interest_id
//       WHERE m.is_approved = TRUE
//         AND ui.interest_id IN (
//           SELECT interest_id
//           FROM User_Interests
//           WHERE user_id = ?
//         )
//       GROUP BY m.mentor_id
//       HAVING matching_interests_count >= 1
//       ORDER BY matching_interests_count DESC
//       `,
//       [studentUserId]
//     );

//     // Determine level based on actual completed sessions
//     const getMentorLevel = (sessionsTaken: number): MentorLevelType => {
//       if (sessionsTaken >= 50) return "Expert";
//       if (sessionsTaken >= 20) return "Advanced";
//       if (sessionsTaken >= 5) return "Intermediate";
//       return "Beginner";
//     };

//     const mentorsWithStats = mentors.map((mentor) => {
//       const sessionsTaken = mentor.sessions_taken || 0;
//       const randomReviewCount = Math.floor(Math.random() * 51);

//       return {
//         mentorId: mentor.mentor_id,
//         name: mentor.name,
//         organization: "UIU",
//         profile_pic: mentor.image_url
//           ? `${baseUrl}/api/mentor/image/${mentor.mentor_id}`
//           : "",
//         level: getMentorLevel(sessionsTaken),
//         bio: mentor.bio || "",
//         sessions_taken: sessionsTaken,
//         review_count: randomReviewCount,
//       };
//     });

//     res.status(200).json({
//       success: true,
//       data: mentorsWithStats,
//     });
//   } catch (error) {
//     console.error("Error fetching suggested mentors:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };

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

type MentorLevelType = "Beginner" | "Intermediate" | "Advanced" | "Expert";

export const getSuggestedMentorsInterestBased = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const studentUserId = req.user?.user_id;
  // const baseUrl = "https://evidently-handy-troll.ngrok-free.app";
  const baseUrl = "http://localhost:3000";

  if (!studentUserId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    // Verify student exists
    const [student] = await db.query<RowDataPacket[]>(
      "SELECT student_id FROM Students WHERE user_id = ?",
      [studentUserId]
    );
    if (student.length === 0) {
      return res
        .status(403)
        .json({ success: false, message: "User is not a student" });
    }

    // Get matching mentors with their details and session counts
    const [mentors] = await db.query<RowDataPacket[]>(
      `
      SELECT 
        m.mentor_id,
        u.name,
        u.email,
        m.bio,
        u.image_url,
        COUNT(DISTINCT ui.interest_id) AS matching_interests_count,
        GROUP_CONCAT(DISTINCT i.interest_name) AS matching_interests,
        (
          SELECT COUNT(*) 
          FROM One_On_One_Sessions o 
          JOIN Mentor_Availability ma ON o.availability_id = ma.availability_id
          WHERE ma.mentor_id = m.mentor_id 
          AND ma.status = 'completed'
        ) AS sessions_taken
      FROM Users u
      JOIN Mentors m ON u.user_id = m.user_id
      JOIN User_Interests ui ON u.user_id = ui.user_id
      JOIN Interests i ON ui.interest_id = i.interest_id
      WHERE ui.interest_id IN (
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

    // Determine level based on actual completed sessions
    const getMentorLevel = (sessionsTaken: number): MentorLevelType => {
      if (sessionsTaken >= 50) return "Expert";
      if (sessionsTaken >= 20) return "Advanced";
      if (sessionsTaken >= 5) return "Intermediate";
      return "Beginner";
    };

    const mentorsWithStats = mentors.map((mentor) => {
      const sessionsTaken = mentor.sessions_taken || 0;
      const randomReviewCount = Math.floor(Math.random() * 51);

      return {
        mentorId: mentor.mentor_id,
        name: mentor.name,
        organization: "UIU",
        profile_pic: mentor.image_url
          ? `${baseUrl}/api/mentor/image/${mentor.mentor_id}`
          : "",
        level: getMentorLevel(sessionsTaken),
        bio: mentor.bio || "",
        sessions_taken: sessionsTaken,
        review_count: randomReviewCount,
      };
    });

    res.status(200).json({
      success: true,
      data: mentorsWithStats,
    });
  } catch (error) {
    console.error("Error fetching suggested mentors:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
