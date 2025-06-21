import { Request, Response, NextFunction } from "express";
import db from "../../config/database";
import { RowDataPacket } from "mysql2";
import crypto from "crypto";

interface BookSessionRequest {
  AvailabilityID: string;
  medium: "online" | "offline";
}

interface UcoinPurchaseRequest {
  tk_amount: number;
  payment_method: "Bkash" | "Nagad" | "Bank Card" | "Other";
  transaction_reference: string;
  phone_number?: string;
  address?: string;
}

interface JwtPayload {
  user_id: string;
  user_type?: string;
}

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export class StudentSessionController {
  static async purchaseUcoin(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.user_id;
    const {
      tk_amount,
      payment_method,
      transaction_reference,
      phone_number,
      address,
    } = req.body as UcoinPurchaseRequest;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!tk_amount || !payment_method || !transaction_reference) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields: tk_amount, payment_method, transaction_reference",
      });
    }

    if (tk_amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "tk_amount must be positive",
      });
    }

    // Calculate ucoin_amount: 1000 Taka = 1000
    const ucoin_amount = tk_amount / 10;

    try {
      await db.query("START TRANSACTION");

      // Verify user has a student profile
      const [profileRows] = await db.query<RowDataPacket[]>(
        `SELECT student_id FROM Students WHERE user_id = ?`,
        [userId]
      );
      if (profileRows.length === 0) {
        await db.query("ROLLBACK");
        return res
          .status(404)
          .json({ success: false, message: "Student profile not found" });
      }

      // Check unique transaction_reference
      const [transactionCheck] = await db.query<RowDataPacket[]>(
        `SELECT purchase_id FROM UCOIN_Purchases WHERE transaction_reference = ?`,
        [transaction_reference]
      );
      if (transactionCheck.length > 0) {
        await db.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Transaction reference already exists",
        });
      }

      // Create purchase record
      const purchaseId = crypto.randomUUID();
      await db.query(
        `INSERT INTO UCOIN_Purchases 
         (purchase_id, user_id, tk_amount, ucoin_amount, payment_method, transaction_reference, phone_number, address, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Completed')`,
        [
          purchaseId,
          userId,
          tk_amount,
          ucoin_amount,
          payment_method,
          transaction_reference,
          phone_number || null,
          address || null,
        ]
      );

      // Update or create user balance
      const [balanceRows] = await db.query<RowDataPacket[]>(
        `SELECT balance_id, ucoin_balance FROM User_Balances WHERE user_id = ?`,
        [userId]
      );

      if (balanceRows.length === 0) {
        const balanceId = crypto.randomUUID();
        await db.query(
          `INSERT INTO User_Balances (balance_id, user_id, ucoin_balance)
           VALUES (?, ?, ?)`,
          [balanceId, userId, ucoin_amount]
        );
      } else {
        await db.query(
          `UPDATE User_Balances 
           SET ucoin_balance = ucoin_balance + ?, last_updated = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
          [ucoin_amount, userId]
        );
      }

      await db.query("COMMIT");

      const [updatedBalance] = await db.query<RowDataPacket[]>(
        `SELECT ucoin_balance FROM User_Balances WHERE user_id = ?`,
        [userId]
      );

      res.status(200).json({
        success: true,
        message: `UCOIN purchased successfully (${tk_amount} Taka = ${ucoin_amount} UCOIN)`,
        data: {
          new_balance: updatedBalance[0].ucoin_balance,
          purchase_id: purchaseId,
        },
      });
    } catch (error: any) {
      await db.query("ROLLBACK");
      console.error("UCOIN purchase error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process UCOIN purchase",
        error: error.message,
      });
    }
  }

  static async getBalance(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
      const [balanceRows] = await db.query<RowDataPacket[]>(
        `SELECT ucoin_balance, last_updated FROM User_Balances WHERE user_id = ?`,
        [userId]
      );

      if (balanceRows.length === 0) {
        return res.status(200).json({
          success: true,
          message: "Balance retrieved successfully",
          data: { ucoin_balance: 0, last_updated: null },
        });
      }

      res.status(200).json({
        success: true,
        message: "Balance retrieved successfully",
        data: {
          ucoin_balance: balanceRows[0].ucoin_balance,
          last_updated: balanceRows[0].last_updated,
        },
      });
    } catch (error: any) {
      console.error("Get balance error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get balance",
        error: error.message,
      });
    }
  }

  /* Book Session with UCOIN Endpoint */
  static async bookSession(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.user_id;
    const sessionId = req.params.sessionID;
    const { AvailabilityID, medium } = req.body as BookSessionRequest;

    if (!userId) {
      console.log("Unauthorized: No user ID in JWT token");
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!sessionId || !AvailabilityID || !medium) {
      console.log(
        "Invalid input: sessionId, AvailabilityID, or medium missing"
      );
      return res.status(400).json({
        success: false,
        message: "Session ID, Availability ID, and medium are required",
      });
    }

    if (medium !== "online" && medium !== "offline") {
      return res.status(400).json({
        success: false,
        message: "Medium must be either 'online' or 'offline'",
      });
    }

    try {
      await db.query("START TRANSACTION");

      // 1. Verify student exists
      const [studentRows] = await db.query<RowDataPacket[]>(
        `SELECT student_id FROM Students WHERE user_id = ?`,
        [userId]
      );
      if (studentRows.length === 0) {
        await db.query("ROLLBACK");
        return res
          .status(404)
          .json({ success: false, message: "Student profile not found" });
      }
      const student = studentRows[0];

      // 2. Check student balance
      const [balanceRows] = await db.query<RowDataPacket[]>(
        `SELECT ucoin_balance FROM User_Balances WHERE user_id = ?`,
        [userId]
      );
      if (balanceRows.length === 0) {
        await db.query("ROLLBACK");
        return res.status(500).json({
          success: false,
          message: "User balance not found. Please contact support.",
        });
      }
      const studentBalance = parseFloat(balanceRows[0].ucoin_balance);
      console.log(
        `Student ${userId} Balance: ${studentBalance} (Type: ${typeof studentBalance})`
      );

      // 3. Validate session and get price
      const [sessionRows] = await db.query<RowDataPacket[]>(
        `SELECT s.session_id, s.price, ma.availability_id, ma.mentor_id, ma.start_time, ma.end_time,
              ma.is_online, ma.is_offline, m.user_id AS mentor_user_id
       FROM Sessions s
       JOIN Mentor_Availability ma ON s.mentor_id = ma.mentor_id
       JOIN Mentors m ON ma.mentor_id = m.mentor_id
       WHERE s.session_id = ? 
         AND ma.availability_id = ? 
         AND ma.is_booked = FALSE
         AND (
           (ma.is_online = TRUE AND ? = 'online') OR
           (ma.is_offline = TRUE AND ? = 'offline')
         )`,
        [sessionId, AvailabilityID, medium, medium]
      );

      if (sessionRows.length === 0) {
        const [sessionCheck] = await db.query<RowDataPacket[]>(
          "SELECT session_id, mentor_id FROM Sessions WHERE session_id = ?",
          [sessionId]
        );
        const [availabilityCheck] = await db.query<RowDataPacket[]>(
          "SELECT availability_id, mentor_id, is_booked, is_online, is_offline FROM Mentor_Availability WHERE availability_id = ?",
          [AvailabilityID]
        );

        let errorMessage =
          "Session or availability not found or already booked";
        if (sessionCheck.length === 0) {
          errorMessage = "Session not found";
        } else if (availabilityCheck.length === 0) {
          errorMessage = "Availability not found";
        } else if (availabilityCheck[0].is_booked) {
          errorMessage = "Availability already booked";
        } else if (
          sessionCheck[0].mentor_id !== availabilityCheck[0].mentor_id
        ) {
          errorMessage = "Session and availability belong to different mentors";
        } else if (
          (medium === "online" && !availabilityCheck[0].is_online) ||
          (medium === "offline" && !availabilityCheck[0].is_offline)
        ) {
          errorMessage = `Availability is not marked as ${medium}`;
        }

        await db.query("ROLLBACK");
        return res.status(404).json({ success: false, message: errorMessage });
      }
      const sessionData = sessionRows[0];
      const sessionPrice = parseFloat(sessionData.price);
      console.log(
        `Session ${sessionId} Price: ${sessionPrice} (Type: ${typeof sessionPrice}), Medium: ${medium}`
      );

      // 4. Check student balance
      if (studentBalance < sessionPrice) {
        await db.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: `Insufficient UCOIN balance. Required: ${sessionPrice.toFixed(
            2
          )}, Available: ${studentBalance.toFixed(2)}`,
        });
      }

      // 5. Check for overlapping bookings
      const [overlappingRows] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count
       FROM Mentor_Availability ma
       JOIN One_On_One_Sessions oos ON ma.availability_id = oos.availability_id
       WHERE ma.mentor_id = ?
         AND (
           (ma.start_time < ? AND ma.end_time > ?) OR
           (ma.start_time < ? AND ma.end_time > ?) OR
           (ma.start_time >= ? AND ma.end_time <= ?)
         )
         AND ma.is_booked = TRUE`,
        [
          sessionData.mentor_id,
          sessionData.end_time,
          sessionData.start_time,
          sessionData.end_time,
          sessionData.start_time,
          sessionData.start_time,
          sessionData.end_time,
        ]
      );
      if (overlappingRows[0].count > 0) {
        await db.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Time slot conflicts with existing booking",
        });
      }

      // 6. Deduct from student balance
      await db.query(
        `UPDATE User_Balances 
       SET ucoin_balance = ucoin_balance - ?, last_updated = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
        [sessionPrice, userId]
      );

      // 7. Add to mentor balance
      const [mentorBalance] = await db.query<RowDataPacket[]>(
        `SELECT balance_id, ucoin_balance FROM User_Balances WHERE user_id = ?`,
        [sessionData.mentor_user_id]
      );
      if (mentorBalance.length === 0) {
        const mentorBalanceId = crypto.randomUUID();
        await db.query(
          `INSERT INTO User_Balances (balance_id, user_id, ucoin_balance)
         VALUES (?, ?, 0.00)`,
          [mentorBalanceId, sessionData.mentor_user_id]
        );
        await db.query(
          `UPDATE User_Balances 
         SET ucoin_balance = ucoin_balance + ?, last_updated = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
          [sessionPrice, sessionData.mentor_user_id]
        );
      } else {
        await db.query(
          `UPDATE User_Balances 
         SET ucoin_balance = ucoin_balance + ?, last_updated = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
          [sessionPrice, sessionData.mentor_user_id]
        );
      }

      // 8. Create session booking
      const oneOnOneSessionId = crypto.randomUUID();
      await db.query(
        `INSERT INTO One_On_One_Sessions 
       (one_on_one_session_id, availability_id, student_id, medium) 
       VALUES (?, ?, ?, ?)`,
        [oneOnOneSessionId, AvailabilityID, student.student_id, medium]
      );

      // 9. Update availability
      await db.query(
        `UPDATE Mentor_Availability 
       SET is_booked = TRUE, session_id = ? 
       WHERE availability_id = ?`,
        [sessionId, AvailabilityID]
      );

      // 10. Record transaction
      const transactionId = crypto.randomUUID();
      await db.query(
        `INSERT INTO Session_Transactions 
       (transaction_id, one_on_one_session_id, student_id, mentor_id, ucoin_amount, status) 
       VALUES (?, ?, ?, ?, ?, 'Completed')`,
        [
          transactionId,
          oneOnOneSessionId,
          student.student_id,
          sessionData.mentor_id,
          sessionPrice,
        ]
      );

      await db.query("COMMIT");

      const [updatedBalance] = await db.query<RowDataPacket[]>(
        `SELECT ucoin_balance FROM User_Balances WHERE user_id = ?`,
        [userId]
      );

      res.status(200).json({
        success: true,
        message: "Session booked successfully",
        data: {
          session_id: oneOnOneSessionId,
          new_balance: parseFloat(updatedBalance[0].ucoin_balance),
        },
      });
    } catch (error: any) {
      await db.query("ROLLBACK");
      console.error("Booking error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to book session",
        error: error.message,
      });
    }
  }

  /* Student Request Refund Endpoint */

  static async requestRefund(req: AuthenticatedRequest, res: Response) {
    const studentUserId = req.user?.user_id;
    const sessionId = req.params.sessionId;
    const { reason } = req.body;

    // Input validation
    if (!studentUserId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    // Validate reason if provided
    if (reason !== undefined && reason !== null) {
      if (typeof reason !== "string" || reason.length > 1000) {
        return res.status(400).json({
          success: false,
          message: "Reason must be a string with maximum 1000 characters",
        });
      }
    }

    try {
      await db.query("START TRANSACTION");

      // 1. Verify session exists and student authorization
      const [sessionRows] = await db.query<RowDataPacket[]>(
        `SELECT 
                oos.one_on_one_session_id,
                oos.student_id,
                ma.mentor_id,
                s.user_id as student_user_id,
                st.transaction_id,
                st.ucoin_amount,
                st.status,
                ma.start_time
            FROM One_On_One_Sessions oos
            JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
            JOIN Students s ON oos.student_id = s.student_id
            JOIN Session_Transactions st ON oos.one_on_one_session_id = st.one_on_one_session_id
            WHERE oos.one_on_one_session_id = ? AND s.user_id = ?`,
        [sessionId, studentUserId]
      );

      if (sessionRows.length === 0) {
        await db.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Session not found or not authorized",
        });
      }

      const session = sessionRows[0];

      // 2. Check if session is in refundable timeframe
      const currentTime = new Date();
      const sessionStartTime = new Date(session.start_time);
      if (currentTime >= sessionStartTime) {
        await db.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Cannot request refund for started or past sessions",
        });
      }

      // 3. Check if already refunded
      if (session.status === "Refunded") {
        await db.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Session already refunded",
        });
      }

      // 4. Check if refund request already exists
      const [existingRequest] = await db.query<RowDataPacket[]>(
        `SELECT request_id FROM Refund_Requests 
             WHERE one_on_one_session_id = ? AND status = 'Pending'`,
        [sessionId]
      );

      if (existingRequest.length > 0) {
        await db.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Refund request already pending",
        });
      }

      // 5. Create refund request
      const requestId = crypto.randomUUID();
      await db.query(
        `INSERT INTO Refund_Requests 
             (request_id, one_on_one_session_id, student_id, mentor_id, ucoin_amount, status, reason)
             VALUES (?, ?, ?, ?, ?, 'Pending', ?)`,
        [
          requestId,
          sessionId,
          session.student_id,
          session.mentor_id,
          session.ucoin_amount,
          reason || null,
        ]
      );

      await db.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Refund request submitted successfully",
        data: { request_id: requestId, reason: reason || null },
      });
    } catch (error: any) {
      await db.query("ROLLBACK");
      console.error("Refund request error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to submit refund request",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  static async approveRefund(req: AuthenticatedRequest, res: Response) {
    const mentorUserId = req.user?.user_id;
    const requestId = req.params.requestId;

    // Input validation
    if (!mentorUserId) {
      console.error("Unauthorized: No mentor user ID provided");
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!requestId) {
      console.error("Invalid input: No refund request ID provided");
      return res.status(400).json({
        success: false,
        message: "Refund request ID is required",
      });
    }

    try {
      await db.query("START TRANSACTION");

      // 1. Verify refund request and mentor authorization
      const [requestRows] = await db.query<RowDataPacket[]>(
        `SELECT 
        rr.request_id,
        rr.one_on_one_session_id,
        rr.student_id,
        rr.mentor_id,
        rr.ucoin_amount,
        rr.status,
        rr.reason,
        m.user_id as mentor_user_id,
        s.user_id as student_user_id,
        ma.start_time,
        st.ucoin_amount as transaction_ucoin_amount
      FROM Refund_Requests rr
      JOIN One_On_One_Sessions oos ON rr.one_on_one_session_id = oos.one_on_one_session_id
      JOIN Mentors m ON rr.mentor_id = m.mentor_id
      JOIN Students s ON rr.student_id = s.student_id
      JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
      JOIN Session_Transactions st ON oos.one_on_one_session_id = st.one_on_one_session_id
      WHERE rr.request_id = ? AND m.user_id = ?`,
        [requestId, mentorUserId]
      );

      if (requestRows.length === 0) {
        await db.query("ROLLBACK");
        console.error(
          `Refund request ${requestId} not found or mentor ${mentorUserId} not authorized`
        );
        return res.status(404).json({
          success: false,
          message: "Refund request not found or not authorized",
        });
      }

      const request = requestRows[0];
      console.log(
        `Processing refund request ${requestId}: Amount=${request.ucoin_amount}, TransactionAmount=${request.transaction_ucoin_amount}`
      );

      // 2. Validate refund amount against transaction
      if (
        parseFloat(request.ucoin_amount) !==
        parseFloat(request.transaction_ucoin_amount)
      ) {
        await db.query("ROLLBACK");
        console.error(
          `Refund amount mismatch for request ${requestId}: Refund=${request.ucoin_amount}, Transaction=${request.transaction_ucoin_amount}`
        );
        return res.status(400).json({
          success: false,
          message: "Refund amount does not match session transaction amount",
        });
      }

      // 3. Check if session has started
      const currentTime = new Date();
      const sessionStartTime = new Date(request.start_time);
      if (currentTime >= sessionStartTime) {
        await db.query("ROLLBACK");
        console.error(
          `Refund request ${requestId} denied: Session started at ${request.start_time}`
        );
        return res.status(400).json({
          success: false,
          message: "Cannot approve refund for started or past sessions",
        });
      }

      // 4. Check request status
      if (request.status !== "Pending") {
        await db.query("ROLLBACK");
        console.error(
          `Refund request ${requestId} already processed: Status=${request.status}`
        );
        return res.status(400).json({
          success: false,
          message: `Refund request is already ${request.status.toLowerCase()}`,
        });
      }

      // 5. Verify mentor has sufficient balance
      const [mentorBalance] = await db.query<RowDataPacket[]>(
        `SELECT balance_id, ucoin_balance FROM User_Balances WHERE user_id = ? FOR UPDATE`,
        [mentorUserId]
      );

      if (mentorBalance.length === 0) {
        await db.query("ROLLBACK");
        console.error(`No balance found for mentor ${mentorUserId}`);
        return res.status(500).json({
          success: false,
          message: "Mentor balance record not found",
        });
      }

      const mentorUcoinBalance = parseFloat(mentorBalance[0].ucoin_balance);
      const refundAmount = parseFloat(request.ucoin_amount);
      console.log(
        `Mentor ${mentorUserId} balance check: Available=${mentorUcoinBalance}, Required=${refundAmount}`
      );

      if (mentorUcoinBalance < refundAmount) {
        await db.query("ROLLBACK");
        console.error(
          `Insufficient balance for refund request ${requestId}: Available=${mentorUcoinBalance}, Required=${refundAmount}`
        );
        return res.status(400).json({
          success: false,
          message: `Insufficient UCOIN balance to process refund. Available: ${mentorUcoinBalance.toFixed(
            2
          )}, Required: ${refundAmount.toFixed(2)}`,
        });
      }

      // 6. Process refund transaction
      // Deduct from mentor balance
      await db.query(
        `UPDATE User_Balances 
       SET ucoin_balance = ucoin_balance - ?, last_updated = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
        [refundAmount, mentorUserId]
      );

      // Add to student balance
      const [studentBalance] = await db.query<RowDataPacket[]>(
        `SELECT balance_id, ucoin_balance FROM User_Balances WHERE user_id = ? FOR UPDATE`,
        [request.student_user_id]
      );

      if (studentBalance.length === 0) {
        const studentBalanceId = crypto.randomUUID();
        await db.query(
          `INSERT INTO User_Balances (balance_id, user_id, ucoin_balance)
         VALUES (?, ?, ?)`,
          [studentBalanceId, request.student_user_id, refundAmount]
        );
        console.log(
          `Created new balance for student ${request.student_user_id}: ${refundAmount}`
        );
      } else {
        await db.query(
          `UPDATE User_Balances 
         SET ucoin_balance = ucoin_balance + ?, last_updated = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
          [refundAmount, request.student_user_id]
        );
        console.log(
          `Updated student ${request.student_user_id} balance: +${refundAmount}`
        );
      }

      // 7. Update refund request status with processed date
      await db.query(
        `UPDATE Refund_Requests 
       SET status = 'Approved', processed_date = CURRENT_TIMESTAMP
       WHERE request_id = ?`,
        [requestId]
      );

      // 8. Update session transaction status
      const [transactionRows] = await db.query<RowDataPacket[]>(
        `SELECT transaction_id FROM Session_Transactions 
       WHERE one_on_one_session_id = ?`,
        [request.one_on_one_session_id]
      );

      if (transactionRows.length > 0) {
        await db.query(
          `UPDATE Session_Transactions 
         SET status = 'Refunded' 
         WHERE transaction_id = ?`,
          [transactionRows[0].transaction_id]
        );
        console.log(
          `Updated transaction ${transactionRows[0].transaction_id} to Refunded`
        );
      }

      // 9. Update mentor availability
      await db.query(
        `UPDATE Mentor_Availability ma
       JOIN One_On_One_Sessions oos ON ma.availability_id = oos.availability_id
       SET ma.is_booked = FALSE, ma.session_id = NULL
       WHERE oos.one_on_one_session_id = ?`,
        [request.one_on_one_session_id]
      );

      // 10. Delete related booked session links
      await db.query(
        `DELETE FROM BookedSessionLinks 
       WHERE one_on_one_session_id = ?`,
        [request.one_on_one_session_id]
      );

      // 11. Delete session (sets one_on_one_session_id to NULL in Refund_Requests)
      await db.query(
        `DELETE FROM One_On_One_Sessions 
       WHERE one_on_one_session_id = ?`,
        [request.one_on_one_session_id]
      );

      await db.query("COMMIT");
      console.log(`Refund request ${requestId} approved successfully`);

      res.status(200).json({
        success: true,
        message: "Refund approved and processed successfully",
        data: {
          request_id: request.request_id,
          reason: request.reason,
          processed_date: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      await db.query("ROLLBACK");
      console.error(`Refund approval error for request ${requestId}:`, error);
      res.status(500).json({
        success: false,
        message: "Failed to process refund",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }

  static async getTransactionHistory(req: AuthenticatedRequest, res: Response) {
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
      // Get current balance first
      const [balanceResult] = await db.query<RowDataPacket[]>(
        `SELECT ucoin_balance FROM User_Balances WHERE user_id = ?`,
        [userId]
      );
      const currentBalance = balanceResult[0]?.ucoin_balance || 0;

      // Get purchases
      const [purchases] = await db.query<RowDataPacket[]>(
        `SELECT 
          purchase_id as id,
          'purchase' as type,
          tk_amount as amount_currency,
          ucoin_amount as amount_ucoin,
          payment_method,
          status,
          purchase_date as date,
          NULL as session_title,
          NULL as student_name,
          NULL as mentor_name,
          NULL as reason,
          NULL as action_required,
          NULL as counterpart_name,
          NULL as one_on_one_session_id,
          NULL as refund_request_id,
          NULL as session_start_time,
          NULL as session_end_time
        FROM UCOIN_Purchases 
        WHERE user_id = ?`,
        [userId]
      );

      // Get session transactions (as student)
      const [studentTransactions] = await db.query<RowDataPacket[]>(
        `SELECT 
          st.transaction_id as id,
          CASE
            WHEN st.status = 'Refunded' THEN 'refunded_session'
            ELSE 'session_payment'
          END as type,
          NULL as amount_currency,
          st.ucoin_amount as amount_ucoin,
          st.status,
          st.transaction_date as date,
          COALESCE(s.session_title, '1:1 Session') as session_title,
          u_student.name as student_name,
          u_mentor.name as mentor_name,
          NULL as reason,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM Refund_Requests rr 
              WHERE rr.one_on_one_session_id = st.one_on_one_session_id 
              AND rr.status = 'Pending'
            ) THEN 'refund_pending'
            ELSE NULL
          END as action_required,
          u_mentor.name as counterpart_name,
          st.one_on_one_session_id,
          ma.start_time as session_start_time,
          ma.end_time as session_end_time,
          (SELECT rr.request_id FROM Refund_Requests rr 
           WHERE rr.one_on_one_session_id = st.one_on_one_session_id
           LIMIT 1) as refund_request_id
        FROM Session_Transactions st
        JOIN Students std ON st.student_id = std.student_id
        JOIN Users u_student ON std.user_id = u_student.user_id
        JOIN Mentors m ON st.mentor_id = m.mentor_id
        JOIN Users u_mentor ON m.user_id = u_mentor.user_id
        JOIN One_On_One_Sessions oos ON st.one_on_one_session_id = oos.one_on_one_session_id
        JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
        LEFT JOIN Sessions s ON ma.session_id = s.session_id
        WHERE std.user_id = ?`,
        [userId]
      );

      // Get session transactions (as mentor - received payments)
      const [mentorTransactions] = await db.query<RowDataPacket[]>(
        `SELECT 
          st.transaction_id as id,
          CASE
            WHEN st.status = 'Refunded' THEN 'refunded_session'
            ELSE 'session_earning'
          END as type,
          NULL as amount_currency,
          st.ucoin_amount as amount_ucoin,
          st.status,
          st.transaction_date as date,
          COALESCE(s.session_title, '1:1 Session') as session_title,
          u_student.name as student_name,
          u_mentor.name as mentor_name,
          NULL as reason,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM Refund_Requests rr 
              WHERE rr.one_on_one_session_id = st.one_on_one_session_id 
              AND rr.status = 'Pending'
            ) THEN 'refund_review'
            ELSE NULL
          END as action_required,
          u_student.name as counterpart_name,
          st.one_on_one_session_id,
          ma.start_time as session_start_time,
          ma.end_time as session_end_time,
          (SELECT rr.request_id FROM Refund_Requests rr 
           WHERE rr.one_on_one_session_id = st.one_on_one_session_id
           LIMIT 1) as refund_request_id
        FROM Session_Transactions st
        JOIN Mentors m ON st.mentor_id = m.mentor_id
        JOIN Users u_mentor ON m.user_id = u_mentor.user_id
        JOIN Students std ON st.student_id = std.student_id
        JOIN Users u_student ON std.user_id = u_student.user_id
        JOIN One_On_One_Sessions oos ON st.one_on_one_session_id = oos.one_on_one_session_id
        JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
        LEFT JOIN Sessions s ON ma.session_id = s.session_id
        WHERE m.user_id = ?`,
        [userId]
      );

      // Get refund requests (both initiated by student and received by mentor)
      const [refundRequests] = await db.query<RowDataPacket[]>(
        `SELECT 
          rr.request_id as id,
          CASE 
            WHEN rr.status = 'Pending' AND std.user_id = ? THEN 'refund_requested'
            WHEN rr.status = 'Pending' AND m.user_id = ? THEN 'refund_request_received'
            WHEN rr.status = 'Approved' THEN 'refund_approved'
            WHEN rr.status = 'Rejected' THEN 'refund_rejected'
          END as type,
          NULL as amount_currency,
          rr.ucoin_amount as amount_ucoin,
          rr.status,
          COALESCE(rr.processed_date, rr.request_date) as date,
          COALESCE(s.session_title, '1:1 Session') as session_title,
          u_student.name as student_name,
          u_mentor.name as mentor_name,
          rr.reason,
          CASE
            WHEN rr.status = 'Pending' AND m.user_id = ? THEN 'approval_required'
            ELSE NULL
          END as action_required,
          CASE
            WHEN std.user_id = ? THEN u_mentor.name
            ELSE u_student.name
          END as counterpart_name,
          rr.one_on_one_session_id,
          ma.start_time as session_start_time,
          ma.end_time as session_end_time,
          rr.request_id as refund_request_id
        FROM Refund_Requests rr
        LEFT JOIN One_On_One_Sessions oos ON rr.one_on_one_session_id = oos.one_on_one_session_id
        LEFT JOIN Mentor_Availability ma ON oos.availability_id = ma.availability_id
        LEFT JOIN Sessions s ON ma.session_id = s.session_id
        JOIN Mentors m ON rr.mentor_id = m.mentor_id
        JOIN Students std ON rr.student_id = std.student_id
        JOIN Users u_mentor ON m.user_id = u_mentor.user_id
        JOIN Users u_student ON std.user_id = u_student.user_id
        WHERE std.user_id = ? OR m.user_id = ?`,
        [userId, userId, userId, userId, userId, userId]
      );

      // Combine all transactions
      let allTransactions = [
        ...purchases,
        ...studentTransactions,
        ...mentorTransactions,
        ...refundRequests,
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Calculate running balance
      let runningBalance = currentBalance;
      const transactionsWithBalance = allTransactions
        .map((transaction) => {
          // Determine if this is an incoming or outgoing transaction
          let balanceChange = 0;

          switch (transaction.type) {
            case "purchase":
              if (transaction.status === "Completed") {
                balanceChange = +transaction.amount_ucoin;
              }
              break;
            case "session_payment":
              if (transaction.status === "Completed") {
                balanceChange = -transaction.amount_ucoin;
              } else if (transaction.status === "Refunded") {
                balanceChange = +transaction.amount_ucoin;
              }
              break;
            case "session_earning":
              if (transaction.status === "Completed") {
                balanceChange = +transaction.amount_ucoin;
              } else if (transaction.status === "Refunded") {
                balanceChange = -transaction.amount_ucoin;
              }
              break;
            case "refund_approved":
              balanceChange = +transaction.amount_ucoin;
              break;
            case "refund_requested":
            case "refund_request_received":
            case "refund_rejected":
              // These don't affect balance until approved
              balanceChange = 0;
              break;
          }

          // Calculate balance before this transaction
          const balanceBefore = runningBalance - balanceChange;

          // Add balance information to transaction
          const transactionWithBalance = {
            ...transaction,
            balance_before: balanceBefore,
            balance_after: runningBalance,
          };

          // Update running balance for next iteration (moving backwards through time)
          runningBalance = balanceBefore;

          return transactionWithBalance;
        })
        .reverse(); // Reverse to show oldest first with correct balances

      // Calculate total purchased UCOIN
      const totalPurchased = purchases
        .filter((p) => p.status === "Completed")
        .reduce((sum, purchase) => sum + +purchase.amount_ucoin, 0);

      res.status(200).json({
        success: true,
        message: "Transaction history retrieved successfully",
        data: {
          transactions: transactionsWithBalance,
          current_balance: currentBalance,
          total_purchased: totalPurchased,
        },
      });
    } catch (error: any) {
      console.error("Transaction history error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get transaction history",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
    }
  }
}
