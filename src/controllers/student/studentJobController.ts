import { Request, Response } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";
import { RowDataPacket, ResultSetHeader } from "mysql2";

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

interface JobPost {
  job_id: string;
  user_id: string;
  job_type: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  application_deadline: string;
  ucoin_reward: number;
  max_participants: number;
  status: string;
  created_at: string;
}

interface JobApplication {
  application_id: string;
  job_id: string;
  applicant_id: string;
  description: string;
  email: string;
  phone_number: string;
  status: string;
  applied_at: string;
}

export class JobController {
  // Create a new job post
  static async createJobPost(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const {
      title,
      description,
      start_date,
      end_date,
      application_deadline,
      ucoin_reward,
      max_participants,
      job_type,
    } = req.body;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    // Validate required fields
    if (
      !title ||
      !description ||
      !start_date ||
      !end_date ||
      !application_deadline ||
      !ucoin_reward ||
      !max_participants ||
      !job_type
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Validate job type
    if (!["Student", "Mentor"].includes(job_type)) {
      return res.status(400).json({ message: "Invalid job type" });
    }

    // Validate dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const deadlineDate = new Date(application_deadline);

    if (
      isNaN(startDate.getTime()) ||
      isNaN(endDate.getTime()) ||
      isNaN(deadlineDate.getTime())
    ) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    if (startDate >= endDate) {
      return res
        .status(400)
        .json({ message: "End date must be after start date" });
    }

    if (deadlineDate >= startDate) {
      return res
        .status(400)
        .json({ message: "Application deadline must be before start date" });
    }

    // Validate ucoin and participants
    if (ucoin_reward <= 0) {
      return res.status(400).json({ message: "UCoin reward must be positive" });
    }

    if (max_participants <= 0) {
      return res
        .status(400)
        .json({ message: "Max participants must be positive" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check user balance
      const [balanceRows] = await connection.execute<RowDataPacket[]>(
        "SELECT ucoin_balance FROM User_Balances WHERE user_id = ?",
        [user_id]
      );

      if (
        balanceRows.length === 0 ||
        balanceRows[0].ucoin_balance < ucoin_reward * max_participants
      ) {
        await connection.rollback();
        return res.status(400).json({ message: "Insufficient UCoin balance" });
      }

      // Deduct the total possible ucoin reward from user balance
      const totalUcoin = ucoin_reward * max_participants;
      await connection.execute(
        "UPDATE User_Balances SET ucoin_balance = ucoin_balance - ? WHERE user_id = ?",
        [totalUcoin, user_id]
      );

      // Create job post
      const job_id = uuidv4();
      await connection.execute(
        `INSERT INTO Job_Posts (
          job_id, user_id, job_type, title, description, 
          start_date, end_date, application_deadline, 
          ucoin_reward, max_participants, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          job_id,
          user_id,
          job_type,
          title,
          description,
          startDate.toISOString().slice(0, 19).replace("T", " "),
          endDate.toISOString().slice(0, 19).replace("T", " "),
          deadlineDate.toISOString().slice(0, 19).replace("T", " "),
          ucoin_reward,
          max_participants,
          "Open",
        ]
      );

      await connection.commit();

      res.status(201).json({
        success: true,
        message: "Job post created successfully",
        data: { job_id },
      });
    } catch (error) {
      await connection.rollback();
      console.error("Create job post error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }

  static async updateJobPost(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { job_id } = req.params;
    const {
      title,
      description,
      start_date,
      end_date,
      application_deadline,
      ucoin_reward,
      max_participants,
      status,
    } = req.body;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    if (!job_id) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if job exists and belongs to user
      const [jobRows] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM Job_Posts WHERE job_id = ? AND user_id = ?",
        [job_id, user_id]
      );

      if (jobRows.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ message: "Job not found or not owned by user" });
      }

      const job = jobRows[0] as JobPost;

      // Check if job is already closed/completed/cancelled
      if (["Closed", "Completed", "Cancelled"].includes(job.status)) {
        await connection.rollback();
        return res.status(400).json({
          message:
            "Cannot modify a job that is already closed, completed, or cancelled",
        });
      }

      // Check if there are any accepted applications
      const [applicationRows] = await connection.execute<RowDataPacket[]>(
        "SELECT COUNT(*) as count FROM Job_Applications WHERE job_id = ? AND status = 'Accepted'",
        [job_id]
      );

      const acceptedApplications = applicationRows[0].count;
      if (acceptedApplications > 0) {
        await connection.rollback();
        return res.status(400).json({
          message: "Cannot modify a job with accepted applications",
        });
      }

      // Check if any fields are provided for update
      if (
        !title &&
        !description &&
        !start_date &&
        !end_date &&
        !application_deadline &&
        !ucoin_reward &&
        !max_participants &&
        !status
      ) {
        await connection.commit();
        console.log(`No fields provided for job update, job_id: ${job_id}`);
        return res.status(200).json({
          success: true,
          message: "No fields provided for update, job data unchanged",
          data: job,
        });
      }

      // Prepare update fields
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      // Validate and add each field to update
      if (title) {
        updateFields.push("title = ?");
        updateValues.push(title);
      }

      if (description) {
        updateFields.push("description = ?");
        updateValues.push(description);
      }

      if (start_date) {
        const startDate = new Date(start_date);
        if (isNaN(startDate.getTime())) {
          await connection.rollback();
          return res.status(400).json({ message: "Invalid start date format" });
        }
        updateFields.push("start_date = ?");
        updateValues.push(
          startDate.toISOString().slice(0, 19).replace("T", " ")
        );
      }

      if (end_date) {
        const endDate = new Date(end_date);
        if (isNaN(endDate.getTime())) {
          await connection.rollback();
          return res.status(400).json({ message: "Invalid end date format" });
        }
        updateFields.push("end_date = ?");
        updateValues.push(endDate.toISOString().slice(0, 19).replace("T", " "));
      }

      if (application_deadline) {
        const deadlineDate = new Date(application_deadline);
        if (isNaN(deadlineDate.getTime())) {
          await connection.rollback();
          return res
            .status(400)
            .json({ message: "Invalid application deadline format" });
        }
        updateFields.push("application_deadline = ?");
        updateValues.push(
          deadlineDate.toISOString().slice(0, 19).replace("T", " ")
        );
      }

      if (ucoin_reward) {
        if (ucoin_reward <= 0) {
          await connection.rollback();
          return res
            .status(400)
            .json({ message: "UCoin reward must be positive" });
        }
        updateFields.push("ucoin_reward = ?");
        updateValues.push(ucoin_reward);
      }

      if (max_participants) {
        if (max_participants <= 0) {
          await connection.rollback();
          return res
            .status(400)
            .json({ message: "Max participants must be positive" });
        }
        updateFields.push("max_participants = ?");
        updateValues.push(max_participants);
      }

      if (
        status &&
        ["Open", "Closed", "Completed", "Cancelled"].includes(status)
      ) {
        updateFields.push("status = ?");
        updateValues.push(status);
      }

      // Handle ucoin_balance adjustment
      if (ucoin_reward && Number(ucoin_reward) !== Number(job.ucoin_reward)) {
        const rewardDifference =
          Number(ucoin_reward) - Number(job.ucoin_reward);

        // Fetch current balance
        const [balanceRows] = await connection.execute<RowDataPacket[]>(
          "SELECT ucoin_balance FROM User_Balances WHERE user_id = ?",
          [user_id]
        );

        if (balanceRows.length === 0) {
          await connection.rollback();
          return res.status(404).json({ message: "User balance not found" });
        }

        const currentBalance = Number(balanceRows[0].ucoin_balance);

        // If reward increased, check if user has sufficient balance
        if (rewardDifference > 0) {
          if (currentBalance < rewardDifference) {
            await connection.rollback();
            return res
              .status(400)
              .json({ message: "Insufficient uCoin balance" });
          }
          // Deduct the difference
          await connection.execute(
            "UPDATE User_Balances SET ucoin_balance = ucoin_balance - ?, last_updated = CURRENT_TIMESTAMP WHERE user_id = ?",
            [rewardDifference, user_id]
          );
        } else if (rewardDifference < 0) {
          // Credit the difference (negative difference means refund)
          await connection.execute(
            "UPDATE User_Balances SET ucoin_balance = ucoin_balance + ?, last_updated = CURRENT_TIMESTAMP WHERE user_id = ?",
            [-rewardDifference, user_id]
          );
        }
      }

      // If no valid fields to update after validation, return original data
      if (updateFields.length === 0) {
        await connection.commit();
        console.log(`No valid fields to update, job_id: ${job_id}`);
        return res.status(200).json({
          success: true,
          message: "No valid fields provided for update, job data unchanged",
          data: job,
        });
      }

      // Update job post
      updateValues.push(job_id);
      const [updateResult] = await connection.execute<ResultSetHeader>(
        `UPDATE Job_Posts SET ${updateFields.join(", ")} WHERE job_id = ?`,
        updateValues
      );

      if (updateResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Job not found" });
      }

      // Fetch updated job post
      const [updatedJobRows] = await connection.execute<RowDataPacket[]>(
        `SELECT 
        jp.*, 
        u.name AS poster_name,
        u.username AS poster_username,
        u.email AS poster_email,
        u.user_type AS poster_user_type,
        s.student_id AS poster_student_id,
        m.mentor_id AS poster_mentor_id,
        (SELECT COUNT(*) FROM Job_Participants WHERE job_id = jp.job_id) AS participant_count,
        (SELECT COUNT(*) FROM Job_Applications WHERE job_id = jp.job_id) AS application_count
      FROM Job_Posts jp
      JOIN Users u ON jp.user_id = u.user_id
      LEFT JOIN Students s ON u.user_id = s.user_id AND u.user_type = 'Student'
      LEFT JOIN Mentors m ON u.user_id = m.user_id AND u.user_type = 'Mentor'
      WHERE jp.job_id = ?`,
        [job_id]
      );

      await connection.commit();

      res.status(200).json({
        success: true,
        message: "Job post updated successfully",
        data: updatedJobRows[0],
      });
    } catch (error) {
      await connection.rollback();
      console.error("Update job post error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }

  // Delete a job post
  static async deleteJobPost(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { job_id } = req.params;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    if (!job_id) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if job exists and belongs to user
      const [jobRows] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM Job_Posts WHERE job_id = ? AND user_id = ?",
        [job_id, user_id]
      );

      if (jobRows.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ message: "Job not found or not owned by user" });
      }

      const job = jobRows[0] as JobPost;

      // Check if there are any applications
      const [applicationRows] = await connection.execute<RowDataPacket[]>(
        "SELECT COUNT(*) as count FROM Job_Applications WHERE job_id = ?",
        [job_id]
      );

      if (applicationRows[0].count > 0) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Cannot delete a job with applications" });
      }

      // Check if there are any participants
      const [participantRows] = await connection.execute<RowDataPacket[]>(
        "SELECT COUNT(*) as count FROM Job_Participants WHERE job_id = ?",
        [job_id]
      );

      if (participantRows[0].count > 0) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Cannot delete a job with participants" });
      }

      // Delete job post
      const [deleteResult] = await connection.execute<ResultSetHeader>(
        "DELETE FROM Job_Posts WHERE job_id = ?",
        [job_id]
      );

      if (deleteResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Job not found" });
      }

      // Refund the ucoin if job was open
      if (job.status === "Open") {
        const totalUcoin = job.ucoin_reward * job.max_participants;
        await connection.execute(
          "UPDATE User_Balances SET ucoin_balance = ucoin_balance + ? WHERE user_id = ?",
          [totalUcoin, user_id]
        );
      }

      await connection.commit();

      res.status(200).json({
        success: true,
        message: "Job post deleted successfully",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Delete job post error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }

  // Apply for a job
  static async applyForJob(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { job_id } = req.params;
    const { description, email, phone_number } = req.body;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    if (!job_id) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    if (!description || !email || !phone_number) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if job exists and is open
      const [jobRows] = await connection.execute<RowDataPacket[]>(
        `SELECT * FROM Job_Posts 
         WHERE job_id = ? AND status = 'Open' 
         AND application_deadline > NOW()`,
        [job_id]
      );

      if (jobRows.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ message: "Job not found, not open, or deadline passed" });
      }

      const job = jobRows[0] as JobPost;

      // Check if user is applying to their own job
      if (job.user_id === user_id) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Cannot apply to your own job" });
      }

      // Check if user has already applied
      const [existingApplicationRows] = await connection.execute<
        RowDataPacket[]
      >(
        "SELECT * FROM Job_Applications WHERE job_id = ? AND applicant_id = ?",
        [job_id, user_id]
      );

      if (existingApplicationRows.length > 0) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "You have already applied to this job" });
      }

      // Check if job is full
      const [participantRows] = await connection.execute<RowDataPacket[]>(
        "SELECT COUNT(*) as count FROM Job_Participants WHERE job_id = ?",
        [job_id]
      );

      if (participantRows[0].count >= job.max_participants) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Job has reached maximum participants" });
      }

      // Create application
      const application_id = uuidv4();
      await connection.execute(
        `INSERT INTO Job_Applications (
          application_id, job_id, applicant_id, description, 
          email, phone_number, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          application_id,
          job_id,
          user_id,
          description,
          email,
          phone_number,
          "Pending",
        ]
      );

      await connection.commit();

      res.status(201).json({
        success: true,
        message: "Application submitted successfully",
        data: { application_id },
      });
    } catch (error) {
      await connection.rollback();
      console.error("Apply for job error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }

  // Approve/Reject an application (only for job owner)
  static async updateApplicationStatus(
    req: AuthenticatedRequest,
    res: Response
  ) {
    const user_id = req.user?.user_id;
    const { job_id, application_id } = req.params;
    const { status } = req.body;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    if (!job_id || !application_id || !status) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!["Accepted", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if job exists and belongs to user
      const [jobRows] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM Job_Posts WHERE job_id = ? AND user_id = ?",
        [job_id, user_id]
      );

      if (jobRows.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ message: "Job not found or not owned by user" });
      }

      const job = jobRows[0] as JobPost;

      // Check if job is still open
      if (job.status !== "Open") {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Job is not open for applications" });
      }

      // Check if application exists
      const [applicationRows] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM Job_Applications WHERE application_id = ? AND job_id = ?",
        [application_id, job_id]
      );

      if (applicationRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Application not found" });
      }

      const application = applicationRows[0] as JobApplication;

      // Check if application is already processed
      if (application.status !== "Pending") {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Application already processed" });
      }

      // Check if job is full (only for accepting)
      if (status === "Accepted") {
        const [participantRows] = await connection.execute<RowDataPacket[]>(
          "SELECT COUNT(*) as count FROM Job_Participants WHERE job_id = ?",
          [job_id]
        );

        if (participantRows[0].count >= job.max_participants) {
          await connection.rollback();
          return res
            .status(400)
            .json({ message: "Job has reached maximum participants" });
        }
      }

      // Update application status
      await connection.execute(
        "UPDATE Job_Applications SET status = ? WHERE application_id = ?",
        [status, application_id]
      );

      // If accepted, add to participants
      if (status === "Accepted") {
        await connection.execute(
          "INSERT INTO Job_Participants (job_id, user_id) VALUES (?, ?)",
          [job_id, application.applicant_id]
        );

        // Check if job is now full
        const [participantRows] = await connection.execute<RowDataPacket[]>(
          "SELECT COUNT(*) as count FROM Job_Participants WHERE job_id = ?",
          [job_id]
        );

        if (participantRows[0].count >= job.max_participants) {
          await connection.execute(
            "UPDATE Job_Posts SET status = 'Closed' WHERE job_id = ?",
            [job_id]
          );
        }
      }

      await connection.commit();

      res.status(200).json({
        success: true,
        message: `Application ${status.toLowerCase()} successfully`,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Update application status error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }

  // Complete a job and distribute ucoins (only for job owner)
  static async completeJob(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { job_id } = req.params;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    if (!job_id) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if job exists and belongs to user
      const [jobRows] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM Job_Posts WHERE job_id = ? AND user_id = ?",
        [job_id, user_id]
      );

      if (jobRows.length === 0) {
        await connection.rollback();
        return res
          .status(404)
          .json({ message: "Job not found or not owned by user" });
      }

      const job = jobRows[0] as JobPost;

      // Check if job is already completed/cancelled
      if (["Completed", "Cancelled"].includes(job.status)) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Job is already completed or cancelled" });
      }

      // Get participants
      const [participantRows] = await connection.execute<RowDataPacket[]>(
        "SELECT user_id FROM Job_Participants WHERE job_id = ?",
        [job_id]
      );

      if (participantRows.length === 0) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "No participants to complete job with" });
      }

      // Update job status
      await connection.execute(
        "UPDATE Job_Posts SET status = 'Completed' WHERE job_id = ?",
        [job_id]
      );

      // Distribute ucoins to participants
      for (const participant of participantRows) {
        // Add transaction record
        const transaction_id = uuidv4();
        await connection.execute(
          `INSERT INTO Job_Transactions (
            transaction_id, job_id, participant_id, 
            ucoin_amount, status
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            transaction_id,
            job_id,
            participant.user_id,
            job.ucoin_reward,
            "Completed",
          ]
        );

        // Update participant balance
        await connection.execute(
          "UPDATE User_Balances SET ucoin_balance = ucoin_balance + ? WHERE user_id = ?",
          [job.ucoin_reward, participant.user_id]
        );
      }

      await connection.commit();

      res.status(200).json({
        success: true,
        message: "Job completed and ucoins distributed to participants",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Complete job error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }

  // Get all jobs (filterable by status, type, etc.)
  static async getAllJobs(req: AuthenticatedRequest, res: Response) {
    const { status, job_type, search } = req.query;
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    try {
      let query = `
        SELECT 
          jp.*, 
          u.name AS poster_name,
          u.username AS poster_username,
          u.email AS poster_email,
          u.user_type AS poster_user_type,
          s.student_id AS poster_student_id,
          m.mentor_id AS poster_mentor_id,
          (SELECT COUNT(*) FROM Job_Participants WHERE job_id = jp.job_id) AS participant_count,
          (SELECT COUNT(*) FROM Job_Applications WHERE job_id = jp.job_id) AS application_count
        FROM Job_Posts jp
        JOIN Users u ON jp.user_id = u.user_id
        LEFT JOIN Students s ON u.user_id = s.user_id AND u.user_type = 'Student'
        LEFT JOIN Mentors m ON u.user_id = m.user_id AND u.user_type = 'Mentor'
        WHERE 1=1
      `;
      const params: any[] = [];

      // Add filters
      if (status) {
        query += " AND jp.status = ?";
        params.push(status);
      }

      if (job_type) {
        query += " AND jp.job_type = ?";
        params.push(job_type);
      }

      if (search) {
        query += " AND (jp.title LIKE ? OR jp.description LIKE ?)";
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern);
      }

      // Exclude user's own jobs
      query += " AND jp.user_id != ?";
      params.push(user_id);

      // Only show open jobs or jobs where deadline hasn't passed
      query += " AND (jp.status = 'Open' AND jp.application_deadline > NOW())";

      query += " ORDER BY jp.created_at DESC";

      const [jobRows] = await pool.execute<RowDataPacket[]>(query, params);

      res.status(200).json({
        success: true,
        data: jobRows,
      });
    } catch (error) {
      console.error("Get all jobs error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  // Get user's posted jobs
  static async getMyPostedJobs(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { status, search } = req.query;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    try {
      let query = `
        SELECT 
          jp.*,
          u.name AS poster_name,
          u.username AS poster_username,
          u.email AS poster_email,
          u.user_type AS poster_user_type,
          s.student_id AS poster_student_id,
          m.mentor_id AS poster_mentor_id,
          (SELECT COUNT(*) FROM Job_Participants WHERE job_id = jp.job_id) AS participant_count,
          (SELECT COUNT(*) FROM Job_Applications WHERE job_id = jp.job_id) AS application_count
        FROM Job_Posts jp
        JOIN Users u ON jp.user_id = u.user_id
        LEFT JOIN Students s ON u.user_id = s.user_id AND u.user_type = 'Student'
        LEFT JOIN Mentors m ON u.user_id = m.user_id AND u.user_type = 'Mentor'
        WHERE jp.user_id = ?
      `;
      const params: any[] = [user_id];

      if (status) {
        query += " AND jp.status = ?";
        params.push(status);
      }

      if (search) {
        query += " AND (jp.title LIKE ? OR jp.description LIKE ?)";
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern);
      }

      query += " ORDER BY jp.created_at DESC";

      const [jobRows] = await pool.execute<RowDataPacket[]>(query, params);

      res.status(200).json({
        success: true,
        data: jobRows,
      });
    } catch (error) {
      console.error("Get my posted jobs error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  // Get user's job applications
  static async getMyJobApplications(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { status } = req.query;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    try {
      let query = `
        SELECT 
          ja.*,
          s.student_id,
          m.mentor_id,
          u_applicant.name AS applicant_name,
          u_applicant.username AS applicant_username,
          u_applicant.email AS applicant_email,
          u_applicant.user_type AS applicant_user_type,
          jp.title AS job_title,
          jp.description AS job_description,
          jp.start_date,
          jp.end_date,
          jp.status AS job_status,
          u_poster.name AS poster_name,
          u_poster.username AS poster_username,
          u_poster.email AS poster_email,
          u_poster.user_type AS poster_user_type,
          s_poster.student_id AS poster_student_id,
          m_poster.mentor_id AS poster_mentor_id
        FROM Job_Applications ja
        JOIN Users u_applicant ON ja.applicant_id = u_applicant.user_id
        LEFT JOIN Students s ON ja.applicant_id = s.user_id AND u_applicant.user_type = 'Student'
        LEFT JOIN Mentors m ON ja.applicant_id = m.user_id AND u_applicant.user_type = 'Mentor'
        JOIN Job_Posts jp ON ja.job_id = jp.job_id
        JOIN Users u_poster ON jp.user_id = u_poster.user_id
        LEFT JOIN Students s_poster ON jp.user_id = s_poster.user_id AND u_poster.user_type = 'Student'
        LEFT JOIN Mentors m_poster ON jp.user_id = m_poster.user_id AND u_poster.user_type = 'Mentor'
        WHERE ja.applicant_id = ?
      `;
      const params: any[] = [user_id];

      if (status) {
        query += " AND ja.status = ?";
        params.push(status);
      }

      query += " ORDER BY ja.applied_at DESC";

      const [applicationRows] = await pool.execute<RowDataPacket[]>(
        query,
        params
      );

      res.status(200).json({
        success: true,
        data: applicationRows,
      });
    } catch (error) {
      console.error("Get my job applications error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  // Get applications for a job (only for job owner)
  static async getJobApplications(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { job_id } = req.params;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    if (!job_id) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    try {
      // Check if job exists and belongs to user
      const [jobRows] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM Job_Posts WHERE job_id = ? AND user_id = ?",
        [job_id, user_id]
      );

      if (jobRows.length === 0) {
        return res
          .status(404)
          .json({ message: "Job not found or not owned by user" });
      }

      // Get applications
      const [applicationRows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
          ja.*, 
          u.name AS applicant_name,
          u.username AS applicant_username,
          u.email AS applicant_email,
          u.user_type AS applicant_user_type,
          s.student_id,
          m.mentor_id
         FROM Job_Applications ja
         JOIN Users u ON ja.applicant_id = u.user_id
         LEFT JOIN Students s ON ja.applicant_id = s.user_id AND u.user_type = 'Student'
         LEFT JOIN Mentors m ON ja.applicant_id = m.user_id AND u.user_type = 'Mentor'
         WHERE ja.job_id = ?
         ORDER BY ja.applied_at DESC`,
        [job_id]
      );

      res.status(200).json({
        success: true,
        data: applicationRows,
      });
    } catch (error) {
      console.error("Get job applications error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  // Get job details
  static async getJobDetails(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const { job_id } = req.params;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    if (!job_id) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    try {
      // Get job details
      const [jobRows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
          jp.*, 
          u.name AS poster_name,
          u.username AS poster_username,
          u.email AS poster_email,
          u.user_type AS poster_user_type,
          s.student_id AS poster_student_id,
          m.mentor_id AS poster_mentor_id,
          (SELECT COUNT(*) FROM Job_Participants WHERE job_id = jp.job_id) AS participant_count,
          (SELECT COUNT(*) FROM Job_Applications WHERE job_id = jp.job_id) AS application_count
         FROM Job_Posts jp
         JOIN Users u ON jp.user_id = u.user_id
         LEFT JOIN Students s ON u.user_id = s.user_id AND u.user_type = 'Student'
         LEFT JOIN Mentors m ON u.user_id = m.user_id AND u.user_type = 'Mentor'
         WHERE jp.job_id = ?`,
        [job_id]
      );

      if (jobRows.length === 0) {
        return res.status(404).json({ message: "Job not found" });
      }

      const job = jobRows[0];

      // Check if user is the job poster
      const isOwner = job.user_id === user_id;

      // Get participants (only if user is owner or participant)
      let participants: any[] = [];
      if (isOwner) {
        const [participantRows] = await pool.execute<RowDataPacket[]>(
          `SELECT 
            jp.user_id, 
            u.name, 
            u.username,
            u.email,
            u.user_type,
            s.student_id,
            m.mentor_id
           FROM Job_Participants jp
           JOIN Users u ON jp.user_id = u.user_id
           LEFT JOIN Students s ON jp.user_id = s.user_id AND u.user_type = 'Student'
           LEFT JOIN Mentors m ON jp.user_id = m.user_id AND u.user_type = 'Mentor'
           WHERE jp.job_id = ?`,
          [job_id]
        );
        participants = participantRows;
      } else {
        // Check if current user is a participant
        const [isParticipantRows] = await pool.execute<RowDataPacket[]>(
          "SELECT 1 FROM Job_Participants WHERE job_id = ? AND user_id = ?",
          [job_id, user_id]
        );
        if (isParticipantRows.length > 0) {
          const [participantRows] = await pool.execute<RowDataPacket[]>(
            `SELECT 
              jp.user_id, 
              u.name, 
              u.username,
              u.user_type,
              s.student_id,
              m.mentor_id
             FROM Job_Participants jp
             JOIN Users u ON jp.user_id = u.user_id
             LEFT JOIN Students s ON jp.user_id = s.user_id AND u.user_type = 'Student'
             LEFT JOIN Mentors m ON jp.user_id = m.user_id AND u.user_type = 'Mentor'
             WHERE jp.job_id = ?`,
            [job_id]
          );
          participants = participantRows;
        }
      }

      // Get applications (only if user is owner or applicant)
      let applications: any[] = [];
      if (isOwner) {
        const [applicationRows] = await pool.execute<RowDataPacket[]>(
          `SELECT 
            ja.*, 
            u.name AS applicant_name,
            u.username AS applicant_username,
            u.email AS applicant_email,
            u.user_type AS applicant_user_type,
            s.student_id,
            m.mentor_id
           FROM Job_Applications ja
           JOIN Users u ON ja.applicant_id = u.user_id
           LEFT JOIN Students s ON ja.applicant_id = s.user_id AND u.user_type = 'Student'
           LEFT JOIN Mentors m ON ja.applicant_id = m.user_id AND u.user_type = 'Mentor'
           WHERE ja.job_id = ?
           ORDER BY ja.applied_at DESC`,
          [job_id]
        );
        applications = applicationRows;
      } else {
        // Check if current user has applied
        const [applicationRows] = await pool.execute<RowDataPacket[]>(
          `SELECT 
            ja.*,
            u.name AS applicant_name,
            u.username AS applicant_username,
            u.email AS applicant_email,
            u.user_type AS applicant_user_type,
            s.student_id,
            m.mentor_id
           FROM Job_Applications ja
           JOIN Users u ON ja.applicant_id = u.user_id
           LEFT JOIN Students s ON ja.applicant_id = s.user_id AND u.user_type = 'Student'
           LEFT JOIN Mentors m ON ja.applicant_id = m.user_id AND u.user_type = 'Mentor'
           WHERE ja.job_id = ? AND ja.applicant_id = ?`,
          [job_id, user_id]
        );
        if (applicationRows.length > 0) {
          applications = applicationRows;
        }
      }

      res.status(200).json({
        success: true,
        data: {
          ...job,
          participants,
          applications,
          isOwner,
        },
      });
    } catch (error) {
      console.error("Get job details error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  static async getActiveContracts(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Get all jobs posted by the user (Open or Closed status) with at least one hired applicant
      const [postedJobsRows] = await connection.execute<RowDataPacket[]>(
        `SELECT 
            jp.job_id, jp.title, jp.description, jp.start_date, jp.end_date, 
            jp.application_deadline, jp.ucoin_reward, jp.max_participants, 
            jp.status, jp.created_at, jp.job_type,
            u.name AS poster_name, u.username AS poster_username, 
            u.email AS poster_email, u.user_type AS poster_user_type,
            s.student_id AS poster_student_id, m.mentor_id AS poster_mentor_id,
            (SELECT COUNT(*) FROM Job_Participants WHERE job_id = jp.job_id) AS participant_count,
            (SELECT COUNT(*) FROM Job_Applications WHERE job_id = jp.job_id AND status = 'Accepted') AS hired_count
         FROM Job_Posts jp
         JOIN Users u ON jp.user_id = u.user_id
         LEFT JOIN Students s ON u.user_id = s.user_id AND u.user_type = 'Student'
         LEFT JOIN Mentors m ON u.user_id = m.user_id AND u.user_type = 'Mentor'
         WHERE jp.user_id = ? AND jp.status IN ('Open', 'Closed')
         AND (SELECT COUNT(*) FROM Job_Applications WHERE job_id = jp.job_id AND status = 'Accepted') >= 1
         ORDER BY jp.created_at DESC`,
        [user_id]
      );

      // Fetch hired applicants for each posted job
      const postedJobsWithApplicants = [];
      for (const job of postedJobsRows) {
        const [hiredApplicants] = await connection.execute<RowDataPacket[]>(
          `SELECT 
              ja.application_id, ja.description, ja.email AS provided_email, 
              ja.phone_number, ja.applied_at, ja.status,
              u.name AS applicant_name, u.username AS applicant_username, 
              u.email AS system_email, u.user_type AS applicant_user_type,
              u.gender, u.dob, u.graduation_year,
              s.student_id, m.mentor_id, ub.ucoin_balance
           FROM Job_Applications ja
           JOIN Users u ON ja.applicant_id = u.user_id
           LEFT JOIN Students s ON ja.applicant_id = s.user_id AND u.user_type = 'Student'
           LEFT JOIN Mentors m ON ja.applicant_id = m.user_id AND u.user_type = 'Mentor'
           LEFT JOIN User_Balances ub ON ja.applicant_id = ub.user_id
           WHERE ja.job_id = ? AND ja.status = 'Accepted'
           ORDER BY ja.applied_at DESC`,
          [job.job_id]
        );

        postedJobsWithApplicants.push({
          job_details: {
            job_id: job.job_id,
            title: job.title,
            description: job.description,
            start_date: job.start_date,
            end_date: job.end_date,
            application_deadline: job.application_deadline,
            ucoin_reward: job.ucoin_reward,
            max_participants: job.max_participants,
            status: job.status,
            job_type: job.job_type,
            created_at: job.created_at,
            participant_count: job.participant_count,
            hired_count: job.hired_count,
            poster_info: {
              name: job.poster_name,
              username: job.poster_username,
              email: job.poster_email,
              user_type: job.poster_user_type,
              student_id: job.poster_student_id,
              mentor_id: job.poster_mentor_id,
            },
          },
          hired_applicants: hiredApplicants.map((applicant) => ({
            application_id: applicant.application_id,
            applicant_info: {
              name: applicant.applicant_name,
              username: applicant.applicant_username,
              system_email: applicant.system_email,
              provided_email: applicant.provided_email,
              phone_number: applicant.phone_number,
              user_type: applicant.applicant_user_type,
              gender: applicant.gender,
              dob: applicant.dob,
              graduation_year: applicant.graduation_year,
              student_id: applicant.student_id,
              mentor_id: applicant.mentor_id,
              ucoin_balance: applicant.ucoin_balance,
            },
            application_details: {
              description: applicant.description,
              applied_at: applicant.applied_at,
              status: applicant.status,
            },
          })),
        });
      }

      // 2. Get all jobs where the user was accepted
      const [acceptedJobsRows] = await connection.execute<RowDataPacket[]>(
        `SELECT 
            jp.job_id, jp.title, jp.description, jp.start_date, jp.end_date, 
            jp.application_deadline, jp.ucoin_reward, jp.max_participants, 
            jp.status, jp.created_at, jp.job_type,
            u.name AS poster_name, u.username AS poster_username, 
            u.email AS poster_email, u.user_type AS poster_user_type,
            s.student_id AS poster_student_id, m.mentor_id AS poster_mentor_id,
            ja.description AS application_description, ja.email AS provided_email,
            ja.phone_number AS provided_phone_number, ja.applied_at, ja.status AS application_status,
            (SELECT COUNT(*) FROM Job_Participants WHERE job_id = jp.job_id) AS participant_count
         FROM Job_Posts jp
         JOIN Users u ON jp.user_id = u.user_id
         LEFT JOIN Students s ON u.user_id = s.user_id AND u.user_type = 'Student'
         LEFT JOIN Mentors m ON u.user_id = m.user_id AND u.user_type = 'Mentor'
         JOIN Job_Applications ja ON jp.job_id = ja.job_id AND ja.applicant_id = ?
         WHERE ja.status = 'Accepted' AND jp.status IN ('Open', 'Closed')
         ORDER BY ja.applied_at DESC`,
        [user_id]
      );

      await connection.commit();

      res.status(200).json({
        success: true,
        data: {
          posted_jobs: postedJobsWithApplicants,
          accepted_jobs: acceptedJobsRows.map((job) => ({
            job_details: {
              job_id: job.job_id,
              title: job.title,
              description: job.description,
              start_date: job.start_date,
              end_date: job.end_date,
              application_deadline: job.application_deadline,
              ucoin_reward: job.ucoin_reward,
              max_participants: job.max_participants,
              status: job.status,
              job_type: job.job_type,
              created_at: job.created_at,
              current_participants: job.participant_count,
            },
            poster_info: {
              name: job.poster_name,
              username: job.poster_username,
              email: job.poster_email,
              user_type: job.poster_user_type,
              student_id: job.poster_student_id,
              mentor_id: job.poster_mentor_id,
            },
            your_application: {
              description: job.application_description,
              provided_email: job.provided_email,
              provided_phone_number: job.phone_number,
              applied_at: job.applied_at,
              status: job.application_status,
            },
          })),
        },
      });
    } catch (error) {
      await connection.rollback();
      console.error("Get active contracts error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }
}
