import { Request, Response } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

interface Review {
  review_id: string;
  student_id: string;
  mentor_id: string;
  rating: number;
  review_text: string | null;
  created_at: Date;
  username: string;
  user_type: string;
  student_name: string;
  student_email: string;
}

export class ReviewController {
  static async createOneOnOneReview(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { one_on_one_session_id } = req.params;
      const { rating, review_text } = req.body;

      if (!rating) {
        return res.status(400).json({
          message: "Rating is required",
        });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          message: "Rating must be between 1 and 5",
        });
      }

      if (!review_text || review_text.trim().length === 0) {
        return res.status(400).json({
          message: "Review text is required",
        });
      }

      await connection.beginTransaction();

      // Verify session exists and is completed
      const VERIFY_SESSION = `
        SELECT o.student_id, o.availability_id, a.mentor_id
        FROM One_On_One_Sessions o
        JOIN Mentor_Availability a ON o.availability_id = a.availability_id
        WHERE o.one_on_one_session_id = ?
          AND a.end_time < CURRENT_TIMESTAMP
      `;
      const [sessionRows] = await connection.execute(VERIFY_SESSION, [
        one_on_one_session_id,
      ]);
      const session = (
        sessionRows as {
          student_id: string;
          availability_id: string;
          mentor_id: string;
        }[]
      )[0];

      if (!session) {
        return res.status(404).json({
          message: "Session not found or not completed",
        });
      }

      // Verify student is authorized
      const FIND_STUDENT = `
        SELECT user_id FROM Students WHERE student_id = ?
      `;
      const [studentRows] = await connection.execute(FIND_STUDENT, [
        session.student_id,
      ]);
      const student = (studentRows as { user_id: string }[])[0];

      if (!student || student.user_id !== user.user_id) {
        return res.status(403).json({
          message: "Not authorized to review this session",
        });
      }

      // Check for existing review
      const CHECK_EXISTING_REVIEW = `
        SELECT r.review_id 
        FROM One_On_One_Reviews o
        JOIN Reviews r ON o.review_id = r.review_id
        WHERE o.one_on_one_session_id = ? AND r.student_id = ?
      `;
      const [reviewRows] = await connection.execute(CHECK_EXISTING_REVIEW, [
        one_on_one_session_id,
        session.student_id,
      ]);
      if ((reviewRows as any[]).length > 0) {
        return res.status(400).json({
          message: "Review already exists for this session",
        });
      }

      const review_id = uuidv4();
      const CREATE_REVIEW = `
        INSERT INTO Reviews (review_id, student_id, mentor_id, rating, review_text)
        VALUES (?, ?, ?, ?, ?)
      `;
      await connection.execute(CREATE_REVIEW, [
        review_id,
        session.student_id,
        session.mentor_id,
        rating,
        review_text,
      ]);

      const LINK_REVIEW = `
        INSERT INTO One_On_One_Reviews (review_id, one_on_one_session_id)
        VALUES (?, ?)
      `;
      await connection.execute(LINK_REVIEW, [review_id, one_on_one_session_id]);

      await connection.commit();
      res.status(201).json({ success: true, review_id });
    } catch (error) {
      console.error("Create one-on-one review error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  static async createGroupSessionReview(
    req: AuthenticatedRequest,
    res: Response
  ) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { group_session_id } = req.params;
      const { rating, review_text } = req.body;

      if (!rating) {
        return res.status(400).json({
          message: "Rating is required",
        });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          message: "Rating must be between 1 and 5",
        });
      }

      if (!review_text || review_text.trim().length === 0) {
        return res.status(400).json({
          message: "Review text is required",
        });
      }

      await connection.beginTransaction();

      // Verify participation and session completion
      const VERIFY_PARTICIPATION = `
        SELECT p.student_id, g.mentor_id 
        FROM Group_Session_Participants p
        JOIN Group_Sessions g ON p.group_session_id = g.group_session_id
        WHERE p.group_session_id = ? 
          AND p.student_id = (
            SELECT student_id FROM Students WHERE user_id = ?
          )
          AND DATE_ADD(g.session_date, INTERVAL g.duration_mins MINUTE) < CURRENT_TIMESTAMP
      `;
      const [participationRows] = await connection.execute(
        VERIFY_PARTICIPATION,
        [group_session_id, user.user_id]
      );
      const participation = (
        participationRows as {
          student_id: string;
          mentor_id: string;
        }[]
      )[0];

      if (!participation) {
        return res.status(403).json({
          message:
            "Not authorized to review this session or session not completed",
        });
      }

      // Check for existing review
      const CHECK_EXISTING_REVIEW = `
        SELECT r.review_id 
        FROM Group_Session_Reviews g
        JOIN Reviews r ON g.review_id = r.review_id
        WHERE g.group_session_id = ? AND r.student_id = ?
      `;
      const [reviewRows] = await connection.execute(CHECK_EXISTING_REVIEW, [
        group_session_id,
        participation.student_id,
      ]);
      if ((reviewRows as any[]).length > 0) {
        return res.status(400).json({
          message: "You have already reviewed this session",
        });
      }

      const review_id = uuidv4();
      const CREATE_REVIEW = `
        INSERT INTO Reviews (review_id, student_id, mentor_id, rating, review_text)
        VALUES (?, ?, ?, ?, ?)
      `;
      await connection.execute(CREATE_REVIEW, [
        review_id,
        participation.student_id,
        participation.mentor_id,
        rating,
        review_text,
      ]);

      const LINK_REVIEW = `
        INSERT INTO Group_Session_Reviews (review_id, group_session_id)
        VALUES (?, ?)
      `;
      await connection.execute(LINK_REVIEW, [review_id, group_session_id]);

      await connection.commit();
      res.status(201).json({ success: true, review_id });
    } catch (error) {
      console.error("Create group session review error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  static async getOneOnOneSessionReview(
    req: AuthenticatedRequest,
    res: Response
  ) {
    try {
      const user = req.user;
      const { one_on_one_session_id } = req.params;

      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!one_on_one_session_id) {
        return res.status(400).json({
          message: "Session ID is required",
        });
      }

      const VERIFY_SESSION = `
        SELECT o.student_id, a.mentor_id
        FROM One_On_One_Sessions o
        JOIN Mentor_Availability a ON o.availability_id = a.availability_id
        WHERE o.one_on_one_session_id = ?
      `;
      const [sessionRows] = await pool.execute(VERIFY_SESSION, [
        one_on_one_session_id,
      ]);
      const session = (
        sessionRows as {
          student_id: string;
          mentor_id: string;
        }[]
      )[0];

      if (!session) {
        return res.status(404).json({
          message: "Session not found",
        });
      }

      const FIND_STUDENT = `
        SELECT user_id FROM Students WHERE student_id = ?
      `;
      const [studentRows] = await pool.execute(FIND_STUDENT, [
        session.student_id,
      ]);
      const student = (studentRows as { user_id: string }[])[0];

      const FIND_MENTOR = `
        SELECT user_id FROM Mentors WHERE mentor_id = ?
      `;
      const [mentorRows] = await pool.execute(FIND_MENTOR, [session.mentor_id]);
      const mentor = (mentorRows as { user_id: string }[])[0];

      if (
        (!student || student.user_id !== user.user_id) &&
        (!mentor || mentor.user_id !== user.user_id) &&
        user.user_type !== "Admin"
      ) {
        return res.status(403).json({
          message: "Not authorized to view this review",
        });
      }

      const GET_REVIEW = `
        SELECT 
          r.review_id, 
          r.student_id, 
          r.mentor_id, 
          r.rating, 
          r.review_text, 
          r.created_at,
          u.username,
          u.user_type,
          u.name AS student_name,
          u.email AS student_email
        FROM One_On_One_Reviews o
        JOIN Reviews r ON o.review_id = r.review_id
        JOIN Users u ON (
          SELECT user_id FROM Students WHERE student_id = r.student_id
        ) = u.user_id
        WHERE o.one_on_one_session_id = ?
      `;
      const [reviewRows] = await pool.execute(GET_REVIEW, [
        one_on_one_session_id,
      ]);

      if ((reviewRows as any[]).length === 0) {
        return res.status(404).json({
          success: true,
          data: null,
          message: "No review found for this session",
        });
      }

      const review = (reviewRows as Review[])[0];

      res.status(200).json({
        success: true,
        data: {
          ...review,
          created_at: review.created_at.toISOString(),
        },
      });
    } catch (error) {
      console.error("Get one-on-one session review error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }

  static async getGroupSessionReviews(
    req: AuthenticatedRequest,
    res: Response
  ) {
    try {
      const user = req.user;
      const { group_session_id } = req.params;

      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!group_session_id) {
        return res.status(400).json({
          message: "Session ID is required",
        });
      }

      const VERIFY_SESSION = `
        SELECT mentor_id, title, session_date, duration_mins, description, platform
        FROM Group_Sessions WHERE group_session_id = ?
      `;
      const [sessionRows] = await pool.execute(VERIFY_SESSION, [
        group_session_id,
      ]);
      const session = (
        sessionRows as {
          mentor_id: string;
          title: string;
          session_date: string;
          duration_mins: number;
          description: string;
          platform: string;
        }[]
      )[0];

      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const FIND_MENTOR = `
        SELECT user_id FROM Mentors WHERE mentor_id = ?
      `;
      const [mentorRows] = await pool.execute(FIND_MENTOR, [session.mentor_id]);
      const mentor = (mentorRows as { user_id: string }[])[0];

      const FIND_PARTICIPANT = `
        SELECT student_id FROM Group_Session_Participants WHERE group_session_id = ? 
        AND student_id IN (
          SELECT student_id FROM Students WHERE user_id = ?
        )
      `;
      const [participantRows] = await pool.execute(FIND_PARTICIPANT, [
        group_session_id,
        user.user_id,
      ]);
      const participant = (participantRows as { student_id: string }[])[0];

      if (
        (!mentor || mentor.user_id !== user.user_id) &&
        !participant &&
        user.user_type !== "Admin"
      ) {
        return res.status(403).json({
          message: "Not authorized to view these reviews",
        });
      }

      const GET_REVIEWS = `
        SELECT 
          r.review_id, 
          r.student_id, 
          r.mentor_id, 
          r.rating, 
          r.review_text, 
          r.created_at,
          u.username,
          u.user_type,
          u.name AS student_name,
          u.email AS student_email
        FROM Group_Session_Reviews g
        JOIN Reviews r ON g.review_id = r.review_id
        JOIN Users u ON (
          SELECT user_id FROM Students WHERE student_id = r.student_id
        ) = u.user_id
        WHERE g.group_session_id = ?
        ORDER BY r.created_at DESC
      `;
      const [reviewRows] = await pool.execute(GET_REVIEWS, [group_session_id]);

      const AVG_RATING = `
        SELECT AVG(r.rating) as average_rating 
        FROM Group_Session_Reviews g
        JOIN Reviews r ON g.review_id = r.review_id
        WHERE g.group_session_id = ?
      `;
      const [avgRows] = await pool.execute(AVG_RATING, [group_session_id]);
      const avgRatingResult = (
        avgRows as { average_rating: string | number | null }[]
      )[0].average_rating;
      const average_rating =
        avgRatingResult !== null ? Number(avgRatingResult) : 0;

      const formattedReviews = (reviewRows as Review[]).map((review) => ({
        ...review,
        created_at: review.created_at.toISOString(),
      }));

      res.status(200).json({
        success: true,
        data: {
          session: {
            session_id: group_session_id,
            session_type: "group",
            session_title: session.title,
            start_time: new Date(session.session_date).toISOString(),
            end_time: new Date(
              new Date(session.session_date).getTime() +
                session.duration_mins * 60000
            ).toISOString(),
            duration_mins: session.duration_mins,
            description: session.description,
            platform: session.platform,
          },
          reviews: formattedReviews,
          average_rating: parseFloat(average_rating.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("Get group session reviews error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }
}
