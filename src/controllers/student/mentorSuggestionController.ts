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

    // Get matching mentors with their details and statistics
    const [mentors] = await db.query<RowDataPacket[]>(
      `
      SELECT 
        m.mentor_id,
        u.user_id,
        u.name,
        u.username,
        u.email,
        m.bio,
        COUNT(DISTINCT ui.interest_id) AS matching_interests_count,
        GROUP_CONCAT(DISTINCT i.interest_name) AS matching_interests,
        (
          SELECT GROUP_CONCAT(DISTINCT i2.interest_name)
          FROM User_Interests ui2
          JOIN Interests i2 ON ui2.interest_id = i2.interest_id
          WHERE ui2.user_id = u.user_id
        ) AS all_mentor_interests,
        (
          SELECT COUNT(*) 
          FROM One_On_One_Sessions o 
          JOIN Mentor_Availability ma ON o.availability_id = ma.availability_id
          WHERE ma.mentor_id = m.mentor_id 
          AND ma.end_time < NOW()
        ) + 
        (
          SELECT COUNT(*) 
          FROM Group_Sessions gs
          WHERE gs.mentor_id = m.mentor_id 
          AND gs.session_date + INTERVAL gs.duration_mins MINUTE < NOW()
        ) AS total_completed_sessions,
        (
          SELECT COALESCE(AVG(r.rating), 0)
          FROM Reviews r
          WHERE r.mentor_id = m.mentor_id
        ) AS avg_rating
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
      ORDER BY matching_interests_count DESC, avg_rating DESC
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
      const sessionsTaken = mentor.total_completed_sessions || 0;
      const avgRating = parseFloat(mentor.avg_rating) || 0;

      return {
        mentorId: mentor.mentor_id,
        userId: mentor.user_id,
        username: mentor.username,
        name: mentor.name,
        email: mentor.email,
        bio: mentor.bio || "",
        level: getMentorLevel(sessionsTaken),
        sessionsTaken: sessionsTaken,
        avgRating: avgRating.toFixed(1),
        matchingInterests: mentor.matching_interests
          ? mentor.matching_interests.split(",")
          : [],
        allInterests: mentor.all_mentor_interests
          ? mentor.all_mentor_interests.split(",")
          : [],
        matchingInterestsCount: mentor.matching_interests_count,
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

export const getNonMatchingMentors = async (
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
      "SELECT student_id FROM Students WHERE user_id = ?",
      [studentUserId]
    );
    if (student.length === 0) {
      return res
        .status(403)
        .json({ success: false, message: "User is not a student" });
    }

    // Get mentors who DON'T share interests with the student
    const [mentors] = await db.query<RowDataPacket[]>(
      `
      SELECT 
        m.mentor_id,
        u.user_id,
        u.name,
        u.username,
        u.email,
        m.bio,
        (
          SELECT GROUP_CONCAT(DISTINCT i.interest_name)
          FROM User_Interests ui
          JOIN Interests i ON ui.interest_id = i.interest_id
          WHERE ui.user_id = u.user_id
        ) AS all_mentor_interests,
        (
          SELECT COUNT(*) 
          FROM One_On_One_Sessions o 
          JOIN Mentor_Availability ma ON o.availability_id = ma.availability_id
          WHERE ma.mentor_id = m.mentor_id 
          AND ma.end_time < NOW()
        ) + 
        (
          SELECT COUNT(*) 
          FROM Group_Sessions gs
          WHERE gs.mentor_id = m.mentor_id 
          AND gs.session_date + INTERVAL gs.duration_mins MINUTE < NOW()
        ) AS total_completed_sessions,
        (
          SELECT COALESCE(AVG(r.rating), 0)
          FROM Reviews r
          WHERE r.mentor_id = m.mentor_id
        ) AS avg_rating
      FROM Users u
      JOIN Mentors m ON u.user_id = m.user_id
      WHERE m.mentor_id NOT IN (
        SELECT DISTINCT m2.mentor_id
        FROM Mentors m2
        JOIN User_Interests ui ON m2.user_id = ui.user_id
        WHERE ui.interest_id IN (
          SELECT interest_id 
          FROM User_Interests 
          WHERE user_id = ?
        )
      )
      GROUP BY m.mentor_id
      ORDER BY avg_rating DESC, total_completed_sessions DESC
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
      const sessionsTaken = mentor.total_completed_sessions || 0;
      const avgRating = parseFloat(mentor.avg_rating) || 0;

      return {
        mentorId: mentor.mentor_id,
        userId: mentor.user_id,
        username: mentor.username,
        name: mentor.name,
        email: mentor.email,
        bio: mentor.bio || "",
        level: getMentorLevel(sessionsTaken),
        sessionsTaken: sessionsTaken,
        avgRating: avgRating.toFixed(1),
        allInterests: mentor.all_mentor_interests
          ? mentor.all_mentor_interests.split(",")
          : [],
      };
    });

    res.status(200).json({
      success: true,
      data: mentorsWithStats,
    });
  } catch (error) {
    console.error("Error fetching non-matching mentors:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getMentorDetails = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const { mentor_id } = req.params;
  const userId = req.user?.user_id;

  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    // Verify user is either a mentor or student
    const [user] = await db.query<RowDataPacket[]>(
      "SELECT user_type FROM Users WHERE user_id = ?",
      [userId]
    );
    if (
      user.length === 0 ||
      !["Mentor", "Student"].includes(user[0].user_type)
    ) {
      return res
        .status(403)
        .json({ success: false, message: "User is not a mentor or student" });
    }

    // Get mentor basic details
    const [mentors] = await db.query<RowDataPacket[]>(
      `
      SELECT 
        m.mentor_id,
        u.user_id,
        u.name,
        u.username,
        u.email,
        u.gender,
        u.dob,
        u.graduation_year,
        u.image_url,
        m.bio,
        GROUP_CONCAT(DISTINCT i.interest_name) AS interests,
        GROUP_CONCAT(DISTINCT ms.platform) AS social_platforms,
        GROUP_CONCAT(DISTINCT ms.url) AS social_urls,
        (
          SELECT COUNT(DISTINCT o.student_id)
          FROM One_On_One_Sessions o
          JOIN Mentor_Availability ma ON o.availability_id = ma.availability_id
          WHERE ma.mentor_id = m.mentor_id
          AND ma.end_time < NOW()
        ) AS completed_one_on_one_sessions,
        (
          SELECT COUNT(*) 
          FROM Sessions s
          WHERE s.mentor_id = m.mentor_id
        ) AS total_one_on_one_sessions,
        (
          SELECT COUNT(*) 
          FROM Group_Sessions gs
          WHERE gs.mentor_id = m.mentor_id
        ) AS completed_group_sessions,
        (
          SELECT COUNT(DISTINCT gsp.student_id)
          FROM Group_Session_Participants gsp
          JOIN Group_Sessions gs ON gsp.group_session_id = gs.group_session_id
          WHERE gs.mentor_id = m.mentor_id
          AND gs.session_date + INTERVAL gs.duration_mins MINUTE < NOW()
        ) AS group_session_participants,
        (
          SELECT COALESCE(AVG(r.rating), 0)
          FROM Reviews r
          WHERE r.mentor_id = m.mentor_id
        ) AS avg_rating,
        (
          SELECT COUNT(*)
          FROM Reviews r
          WHERE r.mentor_id = m.mentor_id
        ) AS total_reviews
      FROM Users u
      JOIN Mentors m ON u.user_id = m.user_id
      LEFT JOIN User_Interests ui ON u.user_id = ui.user_id
      LEFT JOIN Interests i ON ui.interest_id = i.interest_id
      LEFT JOIN Mentor_Socials ms ON m.mentor_id = ms.mentor_id
      WHERE m.mentor_id = ?
      GROUP BY m.mentor_id, u.user_id
      `,
      [mentor_id]
    );

    if (mentors.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Mentor not found" });
    }

    const mentor = mentors[0];

    // Fetch all one-on-one sessions (including those without reviews, excluding start_time, end_time, medium, created_at)
    const [oneOnOneRows] = await db.query<RowDataPacket[]>(
      `
      SELECT 
        s.session_id,
        s.session_title,
        s.description,
        s.duration_mins,
        s.type AS session_type,
        s.price,
        s.is_online,
        s.is_offline
      FROM Sessions s
      WHERE s.mentor_id = ?
      `,
      [mentor_id]
    );

    const oneOnOneSessions = oneOnOneRows as {
      session_id: string;
      session_title: string;
      description: string;
      duration_mins: number;
      session_type: string;
      price: number;
      is_online: boolean;
      is_offline: boolean;
    }[];

    // Fetch reviews for one-on-one sessions
    const oneOnOneReviewsPromises = oneOnOneSessions.map(async (session) => {
      const [reviewRows] = await db.query<RowDataPacket[]>(
        `
        SELECT 
          r.review_id,
          r.student_id,
          r.mentor_id,
          r.rating,
          r.review_text,
          r.created_at,
          u.username,
          u.user_type,
          COALESCE(u.name, 'Anonymous') AS student_name,
          u.email AS student_email
        FROM One_On_One_Reviews o
        JOIN Reviews r ON o.review_id = r.review_id
        JOIN Users u ON (
          SELECT user_id FROM Students WHERE student_id = r.student_id
        ) = u.user_id
        JOIN One_On_One_Sessions os ON o.one_on_one_session_id = os.one_on_one_session_id
        JOIN Mentor_Availability a ON os.availability_id = a.availability_id
        JOIN Sessions s ON a.session_id = s.session_id
        WHERE s.session_id = ? AND s.mentor_id = ?
        `,
        [session.session_id, mentor_id]
      );
      const reviews = reviewRows.map((review) => ({
        review_id: review.review_id,
        student_id: review.student_id,
        mentor_id: review.mentor_id,
        rating: review.rating,
        review_text: review.review_text,
        created_at: review.created_at.toISOString(),
        student: {
          student_id: review.student_id,
          name: review.student_name,
          username: review.username,
          email: review.student_email,
        },
      }));
      return {
        session: {
          session_id: session.session_id,
          session_type: "OneOnOne",
          session_title: session.session_title,
          type: session.session_type,
          description: session.description,
          duration_mins: session.duration_mins,
          price: session.price,
          is_online: session.is_online,
          is_offline: session.is_offline,
        },
        reviews,
      };
    });

    const oneOnOneResults = await Promise.all(oneOnOneReviewsPromises);

    // Fetch all group sessions (including those without reviews)
    const [groupRows] = await db.query<RowDataPacket[]>(
      `
      SELECT 
        g.group_session_id,
        g.title AS session_title,
        g.description,
        g.session_date,
        g.duration_mins,
        g.max_participants,
        g.platform,
        g.status,
        (
          SELECT COUNT(*)
          FROM Group_Session_Participants gsp
          WHERE gsp.group_session_id = g.group_session_id
          AND gsp.status = 'registered'
        ) AS registered_participants
      FROM Group_Sessions g
      WHERE g.mentor_id = ?
      `,
      [mentor_id]
    );

    const groupSessions = groupRows as {
      group_session_id: string;
      session_title: string;
      description: string;
      session_date: Date;
      duration_mins: number;
      max_participants: number;
      platform: string;
      status: string;
      registered_participants: number;
    }[];

    // Fetch reviews for group sessions
    const groupReviewsPromises = groupSessions.map(async (session) => {
      const [reviewRows] = await db.query<RowDataPacket[]>(
        `
        SELECT 
          r.review_id,
          r.student_id,
          r.mentor_id,
          r.rating,
          r.review_text,
          r.created_at,
          u.username,
          u.user_type,
          COALESCE(u.name, 'Anonymous') AS student_name,
          u.email AS student_email
        FROM Group_Session_Reviews g
        JOIN Reviews r ON g.review_id = r.review_id
        JOIN Users u ON (
          SELECT user_id FROM Students WHERE student_id = r.student_id
        ) = u.user_id
        WHERE g.group_session_id = ?
        `,
        [session.group_session_id]
      );
      const reviews = reviewRows.map((review) => ({
        review_id: review.review_id,
        student_id: review.student_id,
        mentor_id: review.mentor_id,
        rating: review.rating,
        review_text: review.review_text,
        created_at: review.created_at.toISOString(),
        student: {
          student_id: review.student_id,
          name: review.student_name,
          username: review.username,
          email: review.student_email,
        },
      }));
      return {
        session: {
          session_id: session.group_session_id,
          session_type: "Group",
          session_title: session.session_title,
          description: session.description,
          start_time: session.session_date.toISOString(),
          end_time: new Date(
            new Date(session.session_date).getTime() +
              session.duration_mins * 60000
          ).toISOString(),
          duration_mins: session.duration_mins,
          max_participants: session.max_participants,
          registered_participants: session.registered_participants,
          platform: session.platform,
          status: session.status,
        },
        reviews,
      };
    });

    const groupResults = await Promise.all(groupReviewsPromises);

    // Combine sessions
    const sessions = [...oneOnOneResults, ...groupResults];

    // Determine mentor level
    const getMentorLevel = (sessionsTaken: number): MentorLevelType => {
      if (sessionsTaken >= 50) return "Expert";
      if (sessionsTaken >= 20) return "Advanced";
      if (sessionsTaken >= 5) return "Intermediate";
      return "Beginner";
    };

    const totalSessions =
      (mentor.total_one_on_one_sessions || 0) +
      (mentor.completed_group_sessions || 0);
    const avgRating = parseFloat(mentor.avg_rating) || 0;

    const mentorDetails = {
      mentorId: mentor.mentor_id,
      userId: mentor.user_id,
      name: mentor.name,
      username: mentor.username,
      email: mentor.email,
      gender: mentor.gender || null,
      dateOfBirth: mentor.dob || null,
      graduationYear: mentor.graduation_year || null,
      profileImage: mentor.image_url || null,
      bio: mentor.bio || "",
      level: getMentorLevel(totalSessions),
      interests: mentor.interests ? mentor.interests.split(",") : [],
      socialMedia:
        mentor.social_platforms && mentor.social_urls
          ? mentor.social_platforms
              .split(",")
              .map((platform: string, index: number) => ({
                platform,
                url: mentor.social_urls.split(",")[index],
              }))
          : [],
      statistics: {
        oneOnOneSessions: mentor.completed_one_on_one_sessions || 0,
        groupSessions: mentor.completed_group_sessions || 0,
        totalSessions: totalSessions,
        groupSessionParticipants: mentor.group_session_participants || 0,
        averageRating: avgRating.toFixed(1),
        totalReviews: mentor.total_reviews || 0,
      },
      sessions,
    };

    res.status(200).json({
      success: true,
      data: mentorDetails,
    });
  } catch (error) {
    console.error("Error fetching mentor details:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getAllMentors = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const mentorUserId = req.user?.user_id;

  if (!mentorUserId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  try {
    // Verify mentor exists
    const [mentor] = await db.query<RowDataPacket[]>(
      "SELECT mentor_id FROM Mentors WHERE user_id = ?",
      [mentorUserId]
    );
    if (mentor.length === 0) {
      return res
        .status(403)
        .json({ success: false, message: "User is not a mentor" });
    }

    const requestingMentorId = mentor[0].mentor_id;

    // Get all other mentors with their details and statistics
    const [mentors] = await db.query<RowDataPacket[]>(
      `
      SELECT 
        m.mentor_id,
        u.user_id,
        u.name,
        u.username,
        u.email,
        u.gender,
        u.dob,
        u.graduation_year,
        u.image_url,
        m.bio,
        GROUP_CONCAT(DISTINCT i.interest_name) AS all_mentor_interests,
        GROUP_CONCAT(DISTINCT ms.platform) AS social_platforms,
        GROUP_CONCAT(DISTINCT ms.url) AS social_urls,
        (
          SELECT COUNT(DISTINCT ui2.interest_id)
          FROM User_Interests ui2
          JOIN Interests i2 ON ui2.interest_id = i2.interest_id
          WHERE ui2.user_id = u.user_id
          AND ui2.interest_id IN (
            SELECT interest_id 
            FROM User_Interests 
            WHERE user_id = ?
          )
        ) AS matching_interests_count,
        (
          SELECT GROUP_CONCAT(DISTINCT i2.interest_name)
          FROM User_Interests ui2
          JOIN Interests i2 ON ui2.interest_id = i2.interest_id
          WHERE ui2.user_id = u.user_id
          AND ui2.interest_id IN (
            SELECT interest_id 
            FROM User_Interests 
            WHERE user_id = ?
          )
        ) AS matching_interests,
        (
          SELECT COUNT(*) 
          FROM One_On_One_Sessions o 
          JOIN Mentor_Availability ma ON o.availability_id = ma.availability_id
          WHERE ma.mentor_id = m.mentor_id 
          AND ma.end_time < NOW()
        ) AS completed_one_on_one_sessions,
        (
          SELECT COUNT(*) 
          FROM Group_Sessions gs
          WHERE gs.mentor_id = m.mentor_id 
          AND gs.session_date + INTERVAL gs.duration_mins MINUTE < NOW()
        ) AS completed_group_sessions,
        (
          SELECT COUNT(DISTINCT gsp.student_id)
          FROM Group_Session_Participants gsp
          JOIN Group_Sessions gs ON gsp.group_session_id = gs.group_session_id
          WHERE gs.mentor_id = m.mentor_id
          AND gs.session_date + INTERVAL gs.duration_mins MINUTE < NOW()
        ) AS group_session_participants,
        (
          SELECT COALESCE(AVG(r.rating), 0)
          FROM Reviews r
          WHERE r.mentor_id = m.mentor_id
        ) AS avg_rating,
        (
          SELECT COUNT(*)
          FROM Reviews r
          WHERE r.mentor_id = m.mentor_id
        ) AS total_reviews
      FROM Users u
      JOIN Mentors m ON u.user_id = m.user_id
      LEFT JOIN User_Interests ui ON u.user_id = ui.user_id
      LEFT JOIN Interests i ON ui.interest_id = i.interest_id
      LEFT JOIN Mentor_Socials ms ON m.mentor_id = ms.mentor_id
      WHERE m.mentor_id != ?
      GROUP BY m.mentor_id, u.user_id
      ORDER BY avg_rating DESC, completed_one_on_one_sessions + completed_group_sessions DESC
      `,
      [mentorUserId, mentorUserId, requestingMentorId]
    );

    // Determine level based on actual completed sessions
    const getMentorLevel = (sessionsTaken: number): MentorLevelType => {
      if (sessionsTaken >= 50) return "Expert";
      if (sessionsTaken >= 20) return "Advanced";
      if (sessionsTaken >= 5) return "Intermediate";
      return "Beginner";
    };

    const mentorsWithDetails = await Promise.all(
      mentors.map(async (mentor) => {
        const sessionsTaken =
          (mentor.completed_one_on_one_sessions || 0) +
          (mentor.completed_group_sessions || 0);
        const avgRating = parseFloat(mentor.avg_rating) || 0;

        // Fetch one-on-one sessions
        const [oneOnOneRows] = await db.query<RowDataPacket[]>(
          `
          SELECT 
            s.session_id,
            s.session_title,
            s.description,
            s.duration_mins,
            s.type AS session_type,
            s.price,
            s.is_online,
            s.is_offline
          FROM Sessions s
          WHERE s.mentor_id = ?
          `,
          [mentor.mentor_id]
        );

        const oneOnOneSessions = oneOnOneRows as {
          session_id: string;
          session_title: string;
          description: string;
          duration_mins: number;
          session_type: string;
          price: number;
          is_online: boolean;
          is_offline: boolean;
        }[];

        // Fetch reviews for one-on-one sessions
        const oneOnOneReviewsPromises = oneOnOneSessions.map(
          async (session) => {
            const [reviewRows] = await db.query<RowDataPacket[]>(
              `
            SELECT 
              r.review_id,
              r.student_id,
              r.mentor_id,
              r.rating,
              r.review_text,
              r.created_at,
              u.username,
              u.user_type,
              COALESCE(u.name, 'Anonymous') AS student_name,
              u.email AS student_email
            FROM One_On_One_Reviews o
            JOIN Reviews r ON o.review_id = r.review_id
            JOIN Users u ON (
              SELECT user_id FROM Students WHERE student_id = r.student_id
            ) = u.user_id
            JOIN One_On_One_Sessions os ON o.one_on_one_session_id = os.one_on_one_session_id
            JOIN Mentor_Availability a ON os.availability_id = a.availability_id
            JOIN Sessions s ON a.session_id = s.session_id
            WHERE s.session_id = ? AND s.mentor_id = ?
            `,
              [session.session_id, mentor.mentor_id]
            );
            const reviews = reviewRows.map((review) => ({
              review_id: review.review_id,
              student_id: review.student_id,
              mentor_id: review.mentor_id,
              rating: review.rating,
              review_text: review.review_text,
              created_at: review.created_at.toISOString(),
              student: {
                student_id: review.student_id,
                name: review.student_name,
                username: review.username,
                email: review.student_email,
              },
            }));
            return {
              session: {
                session_id: session.session_id,
                session_type: "OneOnOne",
                session_title: session.session_title,
                type: session.session_type,
                description: session.description,
                duration_mins: session.duration_mins,
                price: session.price,
                is_online: session.is_online,
                is_offline: session.is_offline,
              },
              reviews,
            };
          }
        );

        const oneOnOneResults = await Promise.all(oneOnOneReviewsPromises);

        // Fetch group sessions
        const [groupRows] = await db.query<RowDataPacket[]>(
          `
          SELECT 
            g.group_session_id,
            g.title AS session_title,
            g.description,
            g.session_date,
            g.duration_mins,
            g.max_participants,
            g.platform,
            g.status,
            (
              SELECT COUNT(*)
              FROM Group_Session_Participants gsp
              WHERE gsp.group_session_id = g.group_session_id
              AND gsp.status = 'registered'
            ) AS registered_participants
          FROM Group_Sessions g
          WHERE g.mentor_id = ?
          `,
          [mentor.mentor_id]
        );

        const groupSessions = groupRows as {
          group_session_id: string;
          session_title: string;
          description: string;
          session_date: Date;
          duration_mins: number;
          max_participants: number;
          platform: string;
          status: string;
          registered_participants: number;
        }[];

        // Fetch reviews for group sessions
        const groupReviewsPromises = groupSessions.map(async (session) => {
          const [reviewRows] = await db.query<RowDataPacket[]>(
            `
            SELECT 
              r.review_id,
              r.student_id,
              r.mentor_id,
              r.rating,
              r.review_text,
              r.created_at,
              u.username,
              u.user_type,
              COALESCE(u.name, 'Anonymous') AS student_name,
              u.email AS student_email
            FROM Group_Session_Reviews g
            JOIN Reviews r ON g.review_id = r.review_id
            JOIN Users u ON (
              SELECT user_id FROM Students WHERE student_id = r.student_id
            ) = u.user_id
            WHERE g.group_session_id = ?
            `,
            [session.group_session_id]
          );
          const reviews = reviewRows.map((review) => ({
            review_id: review.review_id,
            student_id: review.student_id,
            mentor_id: review.mentor_id,
            rating: review.rating,
            review_text: review.review_text,
            created_at: review.created_at.toISOString(),
            student: {
              student_id: review.student_id,
              name: review.student_name,
              username: review.username,
              email: review.student_email,
            },
          }));
          return {
            session: {
              session_id: session.group_session_id,
              session_type: "Group",
              session_title: session.session_title,
              description: session.description,
              start_time: session.session_date.toISOString(),
              end_time: new Date(
                new Date(session.session_date).getTime() +
                  session.duration_mins * 60000
              ).toISOString(),
              duration_mins: session.duration_mins,
              max_participants: session.max_participants,
              registered_participants: session.registered_participants,
              platform: session.platform,
              status: session.status,
            },
            reviews,
          };
        });

        const groupResults = await Promise.all(groupReviewsPromises);

        // Combine sessions
        const sessions = [...oneOnOneResults, ...groupResults];

        return {
          mentorId: mentor.mentor_id,
          userId: mentor.user_id,
          name: mentor.name,
          username: mentor.username,
          email: mentor.email,
          gender: mentor.gender || null,
          dateOfBirth: mentor.dob || null,
          graduationYear: mentor.graduation_year || null,
          profileImage: mentor.image_url || null,
          bio: mentor.bio || "",
          level: getMentorLevel(sessionsTaken),
          interests: mentor.all_mentor_interests
            ? mentor.all_mentor_interests.split(",")
            : [],
          matchingInterests: mentor.matching_interests
            ? mentor.matching_interests.split(",")
            : [],
          matchingInterestsCount: mentor.matching_interests_count || 0,
          socialMedia:
            mentor.social_platforms && mentor.social_urls
              ? mentor.social_platforms
                  .split(",")
                  .map((platform: string, index: number) => ({
                    platform,
                    url: mentor.social_urls.split(",")[index],
                  }))
              : [],
          statistics: {
            oneOnOneSessions: mentor.completed_one_on_one_sessions || 0,
            groupSessions: mentor.completed_group_sessions || 0,
            totalSessions: sessionsTaken,
            groupSessionParticipants: mentor.group_session_participants || 0,
            averageRating: avgRating.toFixed(1),
            totalReviews: mentor.total_reviews || 0,
          },
          sessions,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: mentorsWithDetails,
    });
  } catch (error) {
    console.error("Error fetching all mentors:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
