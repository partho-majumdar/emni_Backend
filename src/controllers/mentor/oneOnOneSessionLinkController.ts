// import { Request, Response } from "express";
// import pool from "../../config/database";

// interface SessionLinkRequest {
//   link: string;
// }

// interface AuthenticatedRequest extends Request {
//   user?: { user_id: string };
// }

// class OneOnOneSessionLinkController {
//   static async getSessionLink(
//     req: AuthenticatedRequest,
//     res: Response
//   ): Promise<void> {
//     const connection = await pool.getConnection();
//     try {
//       const oneOnOneSessionId = req.params.oneOnOneSessionId;
//       const userId = req.user?.user_id;

//       if (!userId) {
//         res.status(401).json({ success: false, message: "Unauthorized" });
//         return;
//       }

//       if (!oneOnOneSessionId) {
//         res
//           .status(400)
//           .json({ success: false, message: "Session ID is required" });
//         return;
//       }

//       const [linkRows]: any[] = await connection.query(
//         `SELECT link FROM BookedSessionLinks WHERE one_on_one_session_id = ?`,
//         [oneOnOneSessionId]
//       );

//       if (linkRows.length === 0 || linkRows[0].link === "") {
//         res.status(200).json({
//           success: false,
//           data: {
//             one_oneSessionId: oneOnOneSessionId,
//             link: "",
//           },
//         });
//         return;
//       }

//       res.status(200).json({
//         success: true,
//         data: {
//           one_oneSessionId: oneOnOneSessionId,
//           link: linkRows[0].link,
//         },
//       });
//     } catch (error: any) {
//       console.error("Error retrieving session link:", error);
//       res.status(500).json({ success: false, message: "Server error" });
//     } finally {
//       connection.release();
//     }
//   }

//   static async updateSessionLink(
//     req: AuthenticatedRequest,
//     res: Response
//   ): Promise<void> {
//     const connection = await pool.getConnection();
//     try {
//       await connection.beginTransaction();

//       const oneOnOneSessionId = req.params.oneOnOneSessionId;
//       const { link } = req.body as SessionLinkRequest;
//       const userId = req.user?.user_id;

//       if (!userId) {
//         res.status(401).json({ success: false, message: "Unauthorized" });
//         return;
//       }

//       if (!oneOnOneSessionId || link === undefined) {
//         res.status(400).json({
//           success: false,
//           message: "Session ID and link are required",
//         });
//         return;
//       }

//       const [existingLinkRows]: any[] = await connection.query(
//         `SELECT * FROM BookedSessionLinks WHERE one_on_one_session_id = ?`,
//         [oneOnOneSessionId]
//       );

//       if (link === "") {
//         if (existingLinkRows?.length > 0) {
//           await connection.query(
//             `DELETE FROM BookedSessionLinks WHERE one_on_one_session_id = ?`,
//             [oneOnOneSessionId]
//           );
//         }
//         await connection.commit();
//         res.status(200).json({
//           success: true,
//           message: "Session link removed successfully",
//         });
//         return;
//       }

//       if (existingLinkRows?.length > 0) {
//         await connection.query(
//           `UPDATE BookedSessionLinks
//            SET link = ?
//            WHERE one_on_one_session_id = ?`,
//           [link, oneOnOneSessionId]
//         );
//       } else {
//         await connection.query(
//           `INSERT INTO BookedSessionLinks
//            (one_on_one_session_id, link)
//            VALUES (?, ?)`,
//           [oneOnOneSessionId, link]
//         );
//       }

//       await connection.commit();
//       res.status(200).json({
//         success: true,
//         message: "Session link updated successfully",
//       });
//     } catch (error: any) {
//       await connection.rollback();
//       console.error("Error updating session link:", error);
//       res.status(500).json({ success: false, message: "Server error" });
//     } finally {
//       connection.release();
//     }
//   }
// }

// export default OneOnOneSessionLinkController;

// ------------------------------ before UCOIN

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

      // Get session details with authorization check
      const [session] = await pool.query<RowDataPacket[]>(
        `SELECT 
          oos.one_on_one_session_id,
          oos.student_id,
          oos.availability_id,
          oos.medium,
          ma.mentor_id,
          ma.start_time,
          ma.end_time,
          s.price,
          s.session_title,
          u_student.name as student_name,
          u_mentor.name as mentor_name,
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
          message: "Session not found or you don’t have permission",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Session details retrieved successfully",
        data: {
          one_on_one_session_id: session[0].one_on_one_session_id,
          student_id: session[0].student_id,
          student_name: session[0].student_name,
          mentor_id: session[0].mentor_id,
          mentor_name: session[0].mentor_name,
          availability_id: session[0].availability_id,
          session_title: session[0].session_title,
          medium: session[0].medium,
          link: session[0].link, // Will be meeting link for online, address for offline
          start_time: session[0].start_time,
          end_time: session[0].end_time,
          price: session[0].price,
        },
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
}

export default OneOnOneSessionLinkController;
