import { Request, Response } from "express";
import pool from "../../config/database";

interface SessionLinkRequest {
  link: string;
}

interface AuthenticatedRequest extends Request {
  user?: { user_id: string };
}

class OneOnOneSessionLinkController {
  static async getSessionLink(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const connection = await pool.getConnection();
    try {
      const oneOnOneSessionId = req.params.oneOnOneSessionId;
      const userId = req.user?.user_id;

      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      if (!oneOnOneSessionId) {
        res
          .status(400)
          .json({ success: false, message: "Session ID is required" });
        return;
      }

      const [linkRows]: any[] = await connection.query(
        `SELECT link FROM BookedSessionLinks WHERE one_on_one_session_id = ?`,
        [oneOnOneSessionId]
      );

      if (linkRows.length === 0 || linkRows[0].link === "") {
        res.status(200).json({
          success: false,
          data: {
            one_oneSessionId: oneOnOneSessionId,
            link: "",
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          one_oneSessionId: oneOnOneSessionId,
          link: linkRows[0].link,
        },
      });
    } catch (error: any) {
      console.error("Error retrieving session link:", error);
      res.status(500).json({ success: false, message: "Server error" });
    } finally {
      connection.release();
    }
  }

  static async updateSessionLink(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const oneOnOneSessionId = req.params.oneOnOneSessionId;
      const { link } = req.body as SessionLinkRequest;
      const userId = req.user?.user_id;

      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      if (!oneOnOneSessionId || link === undefined) {
        res.status(400).json({
          success: false,
          message: "Session ID and link are required",
        });
        return;
      }

      const [existingLinkRows]: any[] = await connection.query(
        `SELECT * FROM BookedSessionLinks WHERE one_on_one_session_id = ?`,
        [oneOnOneSessionId]
      );

      if (link === "") {
        if (existingLinkRows?.length > 0) {
          await connection.query(
            `DELETE FROM BookedSessionLinks WHERE one_on_one_session_id = ?`,
            [oneOnOneSessionId]
          );
        }
        await connection.commit();
        res.status(200).json({
          success: true,
          message: "Session link removed successfully",
        });
        return;
      }

      if (existingLinkRows?.length > 0) {
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
        message: "Session link updated successfully",
      });
    } catch (error: any) {
      await connection.rollback();
      console.error("Error updating session link:", error);
      res.status(500).json({ success: false, message: "Server error" });
    } finally {
      connection.release();
    }
  }
}

export default OneOnOneSessionLinkController;
