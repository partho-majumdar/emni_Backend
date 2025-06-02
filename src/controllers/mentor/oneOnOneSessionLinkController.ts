import { Request, Response } from "express";
import pool from "../../config/database";
import { RowDataPacket } from "mysql2";

interface SessionLinkRequest {
  link: string;
}

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type?: string };
}

class OneOnOneSessionLinkController {
  static async updateSessionLinkOrAddress(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const oneOnOneSessionId = req.params.oneOnOneSessionId;
      const { link } = req.body as { link: string };
      const userId = req.user?.user_id;

      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      if (!oneOnOneSessionId || link === undefined) {
        res.status(400).json({
          success: false,
          message: "Session ID and link/address are required",
        });
        return;
      }

      // Verify mentor owns this session and check medium
      const [session] = await connection.query<RowDataPacket[]>(
        `SELECT oos.one_on_one_session_id, oos.medium
         FROM One_On_One_Sessions oos
         JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
         JOIN Mentors m ON ma.mentor_id = m.mentor_id
         WHERE oos.one_on_one_session_id = ? 
         AND m.user_id = ?`,
        [oneOnOneSessionId, userId]
      );

      if (session.length === 0) {
        res.status(404).json({
          success: false,
          message: "Session not found or you don’t have permission",
        });
        return;
      }

      // Validate based on session medium
      if (session[0].medium === "online") {
        // Basic URL validation for online sessions
        if (link && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+[/#?]?.*$/.test(link)) {
          res.status(400).json({
            success: false,
            message: "Invalid meeting link format",
          });
          return;
        }
      } else {
        // Validate address length for offline sessions
        if (link.length > 255) {
          res.status(400).json({
            success: false,
            message: "Address must not exceed 255 characters",
          });
          return;
        }
      }

      // Handle link/address removal
      if (link === "") {
        await connection.query(
          `DELETE FROM BookedSessionLinks WHERE one_on_one_session_id = ?`,
          [oneOnOneSessionId]
        );
        await connection.commit();
        res.status(200).json({
          success: true,
          message: `${
            session[0].medium === "online" ? "Meeting link" : "Address"
          } removed successfully`,
        });
        return;
      }

      // Update or insert link/address
      const [existingLinkRows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM BookedSessionLinks WHERE one_on_one_session_id = ?`,
        [oneOnOneSessionId]
      );

      if (existingLinkRows.length > 0) {
        await connection.query(
          `UPDATE BookedSessionLinks 
           SET link = ? 
           WHERE one_on_one_session_id = ?`,
          [link, oneOnOneSessionId]
        );
      } else {
        await connection.query(
          `INSERT INTO BookedSessionLinks 
           (one_on_one_session_id, link) 
           VALUES (?, ?)`,
          [oneOnOneSessionId, link]
        );
      }

      await connection.commit();
      res.status(200).json({
        success: true,
        message: `${
          session[0].medium === "online" ? "Meeting link" : "Address"
        } updated successfully`,
      });
    } catch (error: any) {
      await connection.rollback();
      console.error("Error updating session link/address:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update session link/address",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  }

  // static async getBookedSessionBySessionID(
  //   req: AuthenticatedRequest,
  //   res: Response
  // ): Promise<void> {
  //   try {
  //     const userId = req.user?.user_id;
  //     const bookedId = req.params.bookedId;

  //     if (!userId) {
  //       res.status(401).json({ success: false, message: "Unauthorized" });
  //       return;
  //     }

  //     if (!bookedId) {
  //       res.status(400).json({
  //         success: false,
  //         message: "Booked session ID is required",
  //       });
  //       return;
  //     }

  //     // Get session details with authorization check
  //     const [session] = await pool.query<RowDataPacket[]>(
  //       `SELECT
  //         oos.one_on_one_session_id,
  //         oos.student_id,
  //         oos.availability_id,
  //         oos.medium,
  //         ma.mentor_id,
  //         ma.start_time,
  //         ma.end_time,
  //         s.price,
  //         s.session_title,
  //         u_student.name as student_name,
  //         u_mentor.name as mentor_name,
  //         bsl.link
  //        FROM One_On_One_Sessions oos
  //        JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
  //        JOIN Sessions s ON ma.session_id = s.session_id
  //        JOIN Students st ON oos.student_id = st.student_id
  //        JOIN Mentors m ON ma.mentor_id = m.mentor_id
  //        JOIN Users u_student ON st.user_id = u_student.user_id
  //        JOIN Users u_mentor ON m.user_id = u_mentor.user_id
  //        LEFT JOIN BookedSessionLinks bsl ON oos.one_on_one_session_id = bsl.one_on_one_session_id
  //        WHERE oos.one_on_one_session_id = ?
  //        AND (st.user_id = ? OR m.user_id = ?)`,
  //       [bookedId, userId, userId]
  //     );

  //     if (session.length === 0) {
  //       res.status(404).json({
  //         success: false,
  //         message: "Session not found or you don’t have permission",
  //       });
  //       return;
  //     }

  //     res.status(200).json({
  //       success: true,
  //       message: "Session details retrieved successfully",
  //       data: {
  //         one_on_one_session_id: session[0].one_on_one_session_id,
  //         student_id: session[0].student_id,
  //         student_name: session[0].student_name,
  //         mentor_id: session[0].mentor_id,
  //         mentor_name: session[0].mentor_name,
  //         availability_id: session[0].availability_id,
  //         session_title: session[0].session_title,
  //         medium: session[0].medium,
  //         link: session[0].link, // Will be meeting link for online, address for offline
  //         start_time: session[0].start_time,
  //         end_time: session[0].end_time,
  //         price: session[0].price,
  //       },
  //     });
  //   } catch (error: any) {
  //     console.error("Get booked session error:", error);
  //     res.status(500).json({
  //       success: false,
  //       message: "Failed to get session details",
  //       error: error.message,
  //     });
  //   }
  // }

  static async getBookedSessionBySessionID(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.user_id;
      const bookedId = req.params.bookedId;

      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      if (!bookedId) {
        res.status(400).json({
          success: false,
          message: "Booked session ID is required",
        });
        return;
      }

      const [session] = await pool.query<RowDataPacket[]>(
        `SELECT 
          oos.one_on_one_session_id,
          oos.student_id,
          oos.availability_id,
          oos.medium,
          oos.place,
          ma.mentor_id,
          ma.start_time,
          ma.end_time,
          ma.status as availability_status,
          s.price,
          s.session_title,
          s.description as session_description,
          s.type as session_type,
          u_student.user_id as student_user_id,
          u_student.name as student_name,
          u_student.email as student_email,
          u_student.username as student_username,
          u_student.user_type as student_user_type,
          u_student.image_url as student_image,
          u_mentor.user_id as mentor_user_id,
          u_mentor.name as mentor_name,
          u_mentor.email as mentor_email,
          u_mentor.username as mentor_username,
          u_mentor.user_type as mentor_user_type,
          u_mentor.image_url as mentor_image,
          bsl.link
         FROM One_On_One_Sessions oos
         JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
         JOIN Sessions s ON ma.session_id = s.session_id
         JOIN Students st ON oos.student_id = st.student_id
         JOIN Mentors m ON ma.mentor_id = m.mentor_id
         JOIN Users u_student ON st.user_id = u_student.user_id
         JOIN Users u_mentor ON m.user_id = u_mentor.user_id
         LEFT JOIN BookedSessionLinks bsl ON oos.one_on_one_session_id = bsl.one_on_one_session_id
         WHERE oos.one_on_one_session_id = ?
         AND (st.user_id = ? OR m.user_id = ?)`,
        [bookedId, userId, userId]
      );

      if (session.length === 0) {
        res.status(404).json({
          success: false,
          message: "Session not found or you don't have permission",
        });
        return;
      }

      const sessionData = session[0];

      // Prepare response data
      const responseData = {
        one_on_one_session_id: sessionData.one_on_one_session_id,
        session_type: "1:1", // Explicitly set as 1:1 session
        session_title: sessionData.session_title,
        session_description: sessionData.session_description,
        session_type_category: sessionData.session_type,
        start_time: sessionData.start_time,
        end_time: sessionData.end_time,
        medium: sessionData.medium,
        place: sessionData.place,
        price: sessionData.price,
        link: sessionData.link,
        status: sessionData.availability_status,

        // Student info
        student: {
          student_id: sessionData.student_id,
          user_id: sessionData.student_user_id,
          name: sessionData.student_name,
          email: sessionData.student_email,
          username: sessionData.student_username,
          user_type: sessionData.student_user_type,
          image_url: sessionData.student_image,
        },

        // Mentor info
        mentor: {
          mentor_id: sessionData.mentor_id,
          user_id: sessionData.mentor_user_id,
          name: sessionData.mentor_name,
          email: sessionData.mentor_email,
          username: sessionData.mentor_username,
          user_type: sessionData.mentor_user_type,
          image_url: sessionData.mentor_image,
        },
      };

      res.status(200).json({
        success: true,
        message: "Session details retrieved successfully",
        data: responseData,
      });
    } catch (error: any) {
      console.error("Get booked session error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get session details",
        error: error.message,
      });
    }
  }

  static async getSessionLinkOrAddress(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.user_id;
      const oneOnOneSessionId = req.params.oneOnOneSessionId;

      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      if (!oneOnOneSessionId) {
        res.status(400).json({
          success: false,
          message: "Session ID is required",
        });
        return;
      }

      // Get session details with authorization check
      const [session] = await pool.query<RowDataPacket[]>(
        `SELECT 
          oos.one_on_one_session_id,
          oos.medium,
          bsl.link,
          st.user_id as student_user_id,
          m.user_id as mentor_user_id
         FROM One_On_One_Sessions oos
         JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
         JOIN Mentors m ON ma.mentor_id = m.mentor_id
         JOIN Students st ON oos.student_id = st.student_id
         LEFT JOIN BookedSessionLinks bsl ON oos.one_on_one_session_id = bsl.one_on_one_session_id
         WHERE oos.one_on_one_session_id = ?
         AND (st.user_id = ? OR m.user_id = ?)`,
        [oneOnOneSessionId, userId, userId]
      );

      if (session.length === 0) {
        res.status(404).json({
          success: false,
          message: "Session not found or you don’t have permission",
        });
        return;
      }

      const { medium, link } = session[0];

      if (!link) {
        res.status(404).json({
          success: false,
          message: `No ${
            medium === "online" ? "meeting link" : "address"
          } set for this session`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: `${
          medium === "online" ? "Meeting link" : "Address"
        } retrieved successfully`,
        data: {
          one_on_one_session_id: session[0].one_on_one_session_id,
          medium,
          [medium === "online" ? "meeting_link" : "address"]: link,
        },
      });
    } catch (error: any) {
      console.error("Get session link/address error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve session link/address",
        error: error.message,
      });
    }
  }

  static async getBookedOneOnOneSessions(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      // Check if user is a mentor or student
      const [user] = await pool.query<RowDataPacket[]>(
        `SELECT u.user_id, u.user_type, 
                m.mentor_id, s.student_id
         FROM Users u
         LEFT JOIN Mentors m ON u.user_id = m.user_id
         LEFT JOIN Students s ON u.user_id = s.user_id
         WHERE u.user_id = ?`,
        [userId]
      );

      if (user.length === 0) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      const userType = user[0].user_type;
      const mentorId = user[0].mentor_id;
      const studentId = user[0].student_id;

      let query = "";
      let params: any[] = [];

      if (userType === 'Mentor') {
        // Get all booked sessions for this mentor
        query = `
          SELECT 
            oos.one_on_one_session_id,
            oos.student_id,
            oos.availability_id,
            oos.medium,
            oos.place,
            oos.created_at as booking_time,
            ma.mentor_id,
            ma.start_time,
            ma.end_time,
            ma.status as availability_status,
            s.session_id,
            s.session_title,
            s.description as session_description,
            s.type as session_type,
            s.duration_mins,
            s.price,
            s.is_online,
            s.is_offline,
            s.created_at as session_created_at,
            u_student.user_id as student_user_id,
            u_student.name as student_name,
            u_student.email as student_email,
            u_student.username as student_username,
            u_student.user_type as student_user_type,
            u_student.image_url as student_image,
            bsl.link
          FROM One_On_One_Sessions oos
          JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
          JOIN Sessions s ON ma.session_id = s.session_id
          JOIN Students st ON oos.student_id = st.student_id
          JOIN Users u_student ON st.user_id = u_student.user_id
          LEFT JOIN BookedSessionLinks bsl ON oos.one_on_one_session_id = bsl.one_on_one_session_id
          WHERE ma.mentor_id = ?
            AND ma.status != 'Cancelled'
          ORDER BY ma.start_time DESC`;
        params = [mentorId];
      } else if (userType === 'Student') {
        // Get all booked sessions for this student
        query = `
          SELECT 
            oos.one_on_one_session_id,
            oos.student_id,
            oos.availability_id,
            oos.medium,
            oos.place,
            oos.created_at as booking_time,
            ma.mentor_id,
            ma.start_time,
            ma.end_time,
            ma.status as availability_status,
            s.session_id,
            s.session_title,
            s.description as session_description,
            s.type as session_type,
            s.duration_mins,
            s.price,
            s.is_online,
            s.is_offline,
            s.created_at as session_created_at,
            u_mentor.user_id as mentor_user_id,
            u_mentor.name as mentor_name,
            u_mentor.email as mentor_email,
            u_mentor.username as mentor_username,
            u_mentor.user_type as mentor_user_type,
            u_mentor.image_url as mentor_image,
            bsl.link
          FROM One_On_One_Sessions oos
          JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
          JOIN Sessions s ON ma.session_id = s.session_id
          JOIN Mentors m ON ma.mentor_id = m.mentor_id
          JOIN Users u_mentor ON m.user_id = u_mentor.user_id
          LEFT JOIN BookedSessionLinks bsl ON oos.one_on_one_session_id = bsl.one_on_one_session_id
          WHERE oos.student_id = ?
            AND ma.status != 'Cancelled'
          ORDER BY ma.start_time DESC`;
        params = [studentId];
      } else {
        res.status(403).json({ 
          success: false, 
          message: "Only mentors and students can access booked sessions" 
        });
        return;
      }

      const [sessions] = await pool.query<RowDataPacket[]>(query, params);

      if (sessions.length === 0) {
        res.status(200).json({
          success: true,
          message: "No booked sessions found",
          data: [],
          count: 0
        });
        return;
      }

      // Format the response data
      const responseData = sessions.map(session => ({
        one_on_one_session_id: session.one_on_one_session_id,
        session_info: {
          id: session.session_id,
          title: session.session_title,
          description: session.session_description,
          type: session.session_type,
          duration: session.duration_mins,
          price: session.price,
          is_online: session.is_online,
          is_offline: session.is_offline,
          created_at: session.session_created_at
        },
        time_slot: {
          start: session.start_time,
          end: session.end_time,
          status: session.availability_status,
          booked_at: session.booking_time
        },
        meeting_details: {
          medium: session.medium,
          place: session.place,
          online_link: session.link
        },
        ...(userType === 'Mentor' ? {
          student: {
            id: session.student_id,
            user_id: session.student_user_id,
            name: session.student_name,
            email: session.student_email,
            username: session.student_username,
            image_url: session.student_image
          }
        } : {
          mentor: {
            id: session.mentor_id,
            user_id: session.mentor_user_id,
            name: session.mentor_name,
            email: session.mentor_email,
            username: session.mentor_username,
            image_url: session.mentor_image
          }
        })
      }));

      res.status(200).json({
        success: true,
        message: "Booked sessions retrieved successfully",
        data: responseData,
        count: responseData.length
      });
    } catch (error: any) {
      console.error("Get booked sessions error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get booked sessions",
        error: error.message,
      });
    }
  }
}

export default OneOnOneSessionLinkController;
