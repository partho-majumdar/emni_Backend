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

export class MentorJobController {
  // Create a new job post (Mentor only)
  static async createJobPost(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const user_type = req.user?.user_type;
    const {
      title,
      description,
      start_date,
      end_date,
      application_deadline,
      ucoin_reward,
      max_participants,
    } = req.body;

    if (!user_id || user_type !== "Mentor") {
      return res
        .status(401)
        .json({ message: "Unauthorized: Must be a Mentor" });
    }

    // Validate required fields
    if (
      !title ||
      !description ||
      !start_date ||
      !end_date ||
      !application_deadline ||
      !ucoin_reward ||
      !max_participants
    ) {
      return res.status(400).json({ message: "Missing required fields" });
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

      // Create job post with job_type = 'Mentor'
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
          "Mentor",
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
    const user_type = req.user?.user_type;
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

    if (!user_id || user_type !== "Mentor") {
      return res
        .status(401)
        .json({ message: "Unauthorized: Must be a Mentor" });
    }

    if (!job_id) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if job exists, belongs to user, and is a Mentor job
      const [jobRows] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM Job_Posts WHERE job_id = ? AND user_id = ? AND job_type = 'Mentor'",
        [job_id, user_id]
      );

      if (jobRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          message: "Job not found, not owned by user, or not a Mentor job",
        });
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
            m.mentor_id AS poster_mentor_id,
            (SELECT COUNT(*) FROM Job_Participants WHERE job_id = jp.job_id) AS participant_count,
            (SELECT COUNT(*) FROM Job_Applications WHERE job_id = jp.job_id) AS application_count
        FROM Job_Posts jp
        JOIN Users u ON jp.user_id = u.user_id
        LEFT JOIN Mentors m ON u.user_id = m.user_id
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

  // Delete a job post (Mentor only)
  static async deleteJobPost(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const user_type = req.user?.user_type;
    const { job_id } = req.params;

    if (!user_id || user_type !== "Mentor") {
      return res
        .status(401)
        .json({ message: "Unauthorized: Must be a Mentor" });
    }

    if (!job_id) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if job exists, belongs to user, and is a Mentor job
      const [jobRows] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM Job_Posts WHERE job_id = ? AND user_id = ? AND job_type = 'Mentor'",
        [job_id, user_id]
      );

      if (jobRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          message: "Job not found, not owned by user, or not a Mentor job",
        });
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

  // Approve/Reject an application (Mentor only)
  static async updateApplicationStatus(
    req: AuthenticatedRequest,
    res: Response
  ) {
    const user_id = req.user?.user_id;
    const user_type = req.user?.user_type;
    const { job_id, application_id } = req.params;
    const { status } = req.body;

    if (!user_id || user_type !== "Mentor") {
      return res
        .status(401)
        .json({ message: "Unauthorized: Must be a Mentor" });
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

      // Check if job exists, belongs to user, and is a Mentor job
      const [jobRows] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM Job_Posts WHERE job_id = ? AND user_id = ? AND job_type = 'Mentor'",
        [job_id, user_id]
      );

      if (jobRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          message: "Job not found, not owned by user, or not a Mentor job",
        });
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

      // Check if applicant is a student
      const [applicantRows] = await connection.execute<RowDataPacket[]>(
        "SELECT user_type FROM Users WHERE user_id = ?",
        [application.applicant_id]
      );

      if (
        applicantRows.length === 0 ||
        applicantRows[0].user_type !== "Student"
      ) {
        await connection.rollback();
        return res.status(400).json({ message: "Applicant must be a student" });
      }

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

  // Complete a job and distribute ucoins (Mentor only)
  static async completeJob(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const user_type = req.user?.user_type;
    const { job_id } = req.params;

    if (!user_id || user_type !== "Mentor") {
      return res
        .status(401)
        .json({ message: "Unauthorized: Must be a Mentor" });
    }

    if (!job_id) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if job exists, belongs to user, and is a Mentor job
      const [jobRows] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM Job_Posts WHERE job_id = ? AND user_id = ? AND job_type = 'Mentor'",
        [job_id, user_id]
      );

      if (jobRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          message: "Job not found, not owned by user, or not a Mentor job",
        });
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

  // Get all jobs posted by the mentor
  static async getMyPostedJobs(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const user_type = req.user?.user_type;
    const { status, search } = req.query;

    if (!user_id || user_type !== "Mentor") {
      return res
        .status(401)
        .json({ message: "Unauthorized: Must be a Mentor" });
    }

    try {
      let query = `
        SELECT 
          jp.*,
          u.name AS poster_name,
          u.username AS poster_username,
          u.email AS poster_email,
          u.user_type AS poster_user_type,
          m.mentor_id AS poster_mentor_id,
          (SELECT COUNT(*) FROM Job_Participants WHERE job_id = jp.job_id) AS participant_count,
          (SELECT COUNT(*) FROM Job_Applications WHERE job_id = jp.job_id) AS application_count
        FROM Job_Posts jp
        JOIN Users u ON jp.user_id = u.user_id
        LEFT JOIN Mentors m ON u.user_id = m.user_id
        WHERE jp.user_id = ? AND jp.job_type = 'Mentor'
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

  // Get applications for a job (Mentor only)
  static async getJobApplications(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const user_type = req.user?.user_type;
    const { job_id } = req.params;

    if (!user_id || user_type !== "Mentor") {
      return res
        .status(401)
        .json({ message: "Unauthorized: Must be a Mentor" });
    }

    if (!job_id) {
      return res.status(400).json({ message: "Job ID is required" });
    }

    try {
      // Check if job exists, belongs to user, and is a Mentor job
      const [jobRows] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM Job_Posts WHERE job_id = ? AND user_id = ? AND job_type = 'Mentor'",
        [job_id, user_id]
      );

      if (jobRows.length === 0) {
        return res.status(404).json({
          message: "Job not found, not owned by user, or not a Mentor job",
        });
      }

      // Get applications
      const [applicationRows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
          ja.*, 
          u.name AS applicant_name,
          u.username AS applicant_username,
          u.email AS applicant_email,
          u.user_type AS applicant_user_type,
          s.student_id
         FROM Job_Applications ja
         JOIN Users u ON ja.applicant_id = u.user_id
         LEFT JOIN Students s ON ja.applicant_id = s.user_id
         WHERE ja.job_id = ? AND u.user_type = 'Student'
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

  // Get job details (Mentor only for their own jobs)
  static async getJobDetails(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const user_type = req.user?.user_type;
    const { job_id } = req.params;

    if (!user_id || user_type !== "Mentor") {
      return res
        .status(401)
        .json({ message: "Unauthorized: Must be a Mentor" });
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
          m.mentor_id AS poster_mentor_id,
          (SELECT COUNT(*) FROM Job_Participants WHERE job_id = jp.job_id) AS participant_count,
          (SELECT COUNT(*) FROM Job_Applications WHERE job_id = jp.job_id) AS application_count
         FROM Job_Posts jp
         JOIN Users u ON jp.user_id = u.user_id
         LEFT JOIN Mentors m ON u.user_id = m.user_id
         WHERE jp.job_id = ? AND jp.user_id = ? AND jp.job_type = 'Mentor'`,
        [job_id, user_id]
      );

      if (jobRows.length === 0) {
        return res.status(404).json({
          message: "Job not found, not owned by user, or not a Mentor job",
        });
      }

      const job = jobRows[0];

      // Get participants
      const [participantRows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
          jp.user_id, 
          u.name, 
          u.username,
          u.email,
          u.user_type,
          s.student_id
         FROM Job_Participants jp
         JOIN Users u ON jp.user_id = u.user_id
         LEFT JOIN Students s ON jp.user_id = s.user_id
         WHERE jp.job_id = ? AND u.user_type = 'Student'`,
        [job_id]
      );

      // Get applications
      const [applicationRows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
          ja.*, 
          u.name AS applicant_name,
          u.username AS applicant_username,
          u.email AS applicant_email,
          u.user_type AS applicant_user_type,
          s.student_id
         FROM Job_Applications ja
         JOIN Users u ON ja.applicant_id = u.user_id
         LEFT JOIN Students s ON ja.applicant_id = s.user_id
         WHERE ja.job_id = ? AND u.user_type = 'Student'
         ORDER BY ja.applied_at DESC`,
        [job_id]
      );

      res.status(200).json({
        success: true,
        data: {
          ...job,
          participants: participantRows,
          applications: applicationRows,
          isOwner: true,
        },
      });
    } catch (error) {
      console.error("Get job details error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  // Get active contracts (Mentor only)
  static async getActiveContracts(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;
    const user_type = req.user?.user_type;

    if (!user_id || user_type !== "Mentor") {
      return res
        .status(401)
        .json({ message: "Unauthorized: Must be a Mentor" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Get all jobs posted by the mentor (Open or Closed status) with at least one hired applicant
      const [postedJobsRows] = await connection.execute<RowDataPacket[]>(
        `SELECT 
            jp.job_id, jp.title, jp.description, jp.start_date, jp.end_date, 
            jp.application_deadline, jp.ucoin_reward, jp.max_participants, 
            jp.status, jp.created_at, jp.job_type,
            u.name AS poster_name, u.username AS poster_username, 
            u.email AS poster_email, u.user_type AS poster_user_type,
            m.mentor_id AS poster_mentor_id,
            (SELECT COUNT(*) FROM Job_Participants WHERE job_id = jp.job_id) AS participant_count,
            (SELECT COUNT(*) FROM Job_Applications WHERE job_id = jp.job_id AND status = 'Accepted') AS hired_count
         FROM Job_Posts jp
         JOIN Users u ON jp.user_id = u.user_id
         LEFT JOIN Mentors m ON u.user_id = m.user_id
         WHERE jp.user_id = ? AND jp.job_type = 'Mentor' AND jp.status IN ('Open', 'Closed')
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
              s.student_id, ub.ucoin_balance
           FROM Job_Applications ja
           JOIN Users u ON ja.applicant_id = u.user_id
           LEFT JOIN Students s ON ja.applicant_id = s.user_id
           LEFT JOIN User_Balances ub ON ja.applicant_id = ub.user_id
           WHERE ja.job_id = ? AND ja.status = 'Accepted' AND u.user_type = 'Student'
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

      await connection.commit();

      res.status(200).json({
        success: true,
        data: {
          posted_jobs: postedJobsWithApplicants,
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
