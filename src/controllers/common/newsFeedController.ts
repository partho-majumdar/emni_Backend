import { Request, Response } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

interface Post {
  post_id: string;
  user_id: string;
  content: string;
  created_at: Date;
  username: string;
  user_type: string;
  reaction_count: number;
  has_reacted: number;
}

interface Poll {
  poll_id: string;
  user_id: string;
  question: string;
  end_time: Date | null;
  created_at: Date;
  username: string;
  user_type: string;
}

interface PollOption {
  option_id: string;
  poll_id: string;
  option_text: string;
}

interface Comment {
  comment_id: string;
  user_id: string;
  post_id: string | null;
  poll_id: string | null;
  parent_comment_id: string | null;
  content: string;
  created_at: Date;
  username: string;
  user_type: string;
  reaction_count: number;
  has_reacted: number;
  replies_count: number;
}

export class DiscussionController {
  // Create a Post (text-only)
  static async createPost(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { content, hashtags } = req.body;
      const post_id = uuidv4();

      if (!content) {
        return res
          .status(400)
          .json({ message: "Content is required for a post" });
      }

      await connection.beginTransaction();

      // Insert post
      const CREATE_POST = `
        INSERT INTO Posts (post_id, user_id, content)
        VALUES (?, ?, ?)
      `;
      await connection.execute(CREATE_POST, [post_id, user.user_id, content]);

      // Handle hashtags
      if (hashtags && Array.isArray(hashtags) && hashtags.length > 0) {
        const uniqueHashtags = [
          ...new Set(hashtags.map((h: string) => h.toLowerCase().trim())),
        ].filter((h) => h !== "");
        for (const hashtag of uniqueHashtags) {
          let hashtag_id: string;
          const FIND_HASHTAG = `
            SELECT hashtag_id FROM Hashtags WHERE hashtag_name = ?
          `;
          const [hashtagRows] = await connection.execute(FIND_HASHTAG, [
            hashtag,
          ]);
          const existingHashtag = (hashtagRows as { hashtag_id: string }[])[0];

          if (existingHashtag) {
            hashtag_id = existingHashtag.hashtag_id;
          } else {
            hashtag_id = uuidv4();
            const CREATE_HASHTAG = `
              INSERT INTO Hashtags (hashtag_id, hashtag_name)
              VALUES (?, ?)
            `;
            await connection.execute(CREATE_HASHTAG, [hashtag_id, hashtag]);
          }

          const CREATE_CONTENT_HASHTAG = `
            INSERT INTO Content_Hashtags (content_type, content_id, hashtag_id)
            VALUES (?, ?, ?)
          `;
          await connection.execute(CREATE_CONTENT_HASHTAG, [
            "Post",
            post_id,
            hashtag_id,
          ]);
        }
      }

      await connection.commit();
      res.status(201).json({ success: true, post_id });
    } catch (error) {
      console.error("Create post error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  // Update a Post (preserves existing values if not provided or blank)
  static async updatePost(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      const { post_id } = req.params;
      const { content, hashtags } = req.body;

      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!post_id) {
        return res.status(400).json({ message: "Post ID is required" });
      }

      // Verify post ownership
      const FIND_POST = `
        SELECT user_id, content FROM Posts WHERE post_id = ?
      `;
      const [postRows] = await connection.execute(FIND_POST, [post_id]);
      const post = (postRows as { user_id: string; content: string }[])[0];

      if (!post || post.user_id !== user.user_id) {
        return res
          .status(403)
          .json({ message: "Not authorized to update this post" });
      }

      // If no valid update data provided
      if (
        (content === undefined || content === "") &&
        (hashtags === undefined ||
          (Array.isArray(hashtags) && hashtags.length === 0))
      ) {
        return res
          .status(400)
          .json({ message: "No valid update data provided" });
      }

      await connection.beginTransaction();

      // Update post only if content is provided and non-empty
      if (content !== undefined && content !== "") {
        const UPDATE_POST = `
          UPDATE Posts
          SET content = ?
          WHERE post_id = ?
        `;
        await connection.execute(UPDATE_POST, [content, post_id]);
      }

      // Handle hashtags if provided and not an empty array
      if (
        hashtags !== undefined &&
        (!Array.isArray(hashtags) || hashtags.length > 0)
      ) {
        const DELETE_HASHTAGS = `
          DELETE FROM Content_Hashtags
          WHERE content_type = 'Post' AND content_id = ?
        `;
        await connection.execute(DELETE_HASHTAGS, [post_id]);

        if (Array.isArray(hashtags) && hashtags.length > 0) {
          const uniqueHashtags = [
            ...new Set(hashtags.map((h: string) => h.toLowerCase().trim())),
          ].filter((h) => h !== "");
          for (const hashtag of uniqueHashtags) {
            let hashtag_id: string;
            const FIND_HASHTAG = `
              SELECT hashtag_id FROM Hashtags WHERE hashtag_name = ?
            `;
            const [hashtagRows] = await connection.execute(FIND_HASHTAG, [
              hashtag,
            ]);
            const existingHashtag = (
              hashtagRows as { hashtag_id: string }[]
            )[0];

            if (existingHashtag) {
              hashtag_id = existingHashtag.hashtag_id;
            } else {
              hashtag_id = uuidv4();
              const CREATE_HASHTAG = `
                INSERT INTO Hashtags (hashtag_id, hashtag_name)
                VALUES (?, ?)
              `;
              await connection.execute(CREATE_HASHTAG, [hashtag_id, hashtag]);
            }

            const CREATE_CONTENT_HASHTAG = `
              INSERT INTO Content_Hashtags (content_type, content_id, hashtag_id)
              VALUES (?, ?, ?)
            `;
            await connection.execute(CREATE_CONTENT_HASHTAG, [
              "Post",
              post_id,
              hashtag_id,
            ]);
          }
        }
      }

      await connection.commit();
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Update post error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  // Delete a Post
  static async deletePost(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      const { post_id } = req.params;

      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!post_id) {
        return res.status(400).json({ message: "Post ID is required" });
      }

      // Verify post ownership
      const FIND_POST = `
        SELECT user_id FROM Posts WHERE post_id = ?
      `;
      const [postRows] = await connection.execute(FIND_POST, [post_id]);
      const post = (postRows as { user_id: string }[])[0];

      if (!post || post.user_id !== user.user_id) {
        return res
          .status(403)
          .json({ message: "Not authorized to delete this post" });
      }

      await connection.beginTransaction();

      const DELETE_POST = `
        DELETE FROM Posts WHERE post_id = ?
      `;
      await connection.execute(DELETE_POST, [post_id]);

      await connection.commit();
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Delete post error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  // Get All Posts
  static async getAllPosts(req: AuthenticatedRequest, res: Response) {
    try {
      console.log("Authenticated user:", req.user); // Debug log
      const user_id = req.user?.user_id;
      if (!user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const FIND_POSTS = `
      SELECT 
        p.post_id, 
        p.user_id, 
        p.content, 
        p.created_at, 
        u.username, 
        u.user_type,
        (SELECT COUNT(*) FROM Reactions r WHERE r.post_id = p.post_id) as reaction_count,
        (SELECT COUNT(*) FROM Reactions r WHERE r.post_id = p.post_id AND r.user_id = ?) as has_reacted
      FROM Posts p
      JOIN Users u ON p.user_id = u.user_id
      ORDER BY p.created_at DESC
    `;
      const [postRows] = await pool.execute(FIND_POSTS, [user_id]);
      const posts = postRows as Post[];

      const formattedPosts = await Promise.all(
        posts.map(async (post) => {
          const FIND_HASHTAGS = `
          SELECT h.hashtag_name
          FROM Content_Hashtags ch
          JOIN Hashtags h ON ch.hashtag_id = h.hashtag_id
          WHERE ch.content_type = 'Post' AND ch.content_id = ?
        `;
          const [hashtagRows] = await pool.execute(FIND_HASHTAGS, [
            post.post_id,
          ]);
          const hashtags = (hashtagRows as { hashtag_name: string }[]).map(
            (h) => h.hashtag_name
          );

          return {
            ...post,
            hashtags,
            reaction_count: Number(post.reaction_count),
            has_reacted: Boolean(post.has_reacted), // Convert to boolean (0 = false, >=1 = true)
            created_at: post.created_at.toISOString(), // Convert to string
          };
        })
      );

      console.log("Formatted posts:", formattedPosts);
      res.status(200).json({ success: true, data: formattedPosts });
    } catch (error) {
      console.error("Get all posts error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }
  // Get Posts by User ID

  static async getUserPosts(req: AuthenticatedRequest, res: Response) {
    try {
      const { studentOrMentorId } = req.params;
      const authenticatedUserId = req.user?.user_id;

      if (!authenticatedUserId) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!studentOrMentorId) {
        return res
          .status(400)
          .json({ message: "Student or Mentor ID is required" });
      }

      // Find user_id from Students or Mentors table
      const FIND_STUDENT = `
        SELECT user_id FROM Students WHERE student_id = ?
      `;
      const FIND_MENTOR = `
        SELECT user_id FROM Mentors WHERE mentor_id = ?
      `;

      const [studentRows] = await pool.execute(FIND_STUDENT, [
        studentOrMentorId,
      ]);
      const [mentorRows] = await pool.execute(FIND_MENTOR, [studentOrMentorId]);

      let user_id: string | null = null;
      if ((studentRows as any[]).length > 0) {
        user_id = (studentRows as any[])[0].user_id;
      } else if ((mentorRows as any[]).length > 0) {
        user_id = (mentorRows as any[])[0].user_id;
      } else {
        return res.status(404).json({ message: "Student or Mentor not found" });
      }

      // Query to fetch posts by user_id
      const FIND_POSTS = `
        SELECT 
          p.post_id, 
          p.user_id, 
          p.content, 
          p.created_at, 
          u.username, 
          u.user_type,
          (SELECT COUNT(*) FROM Reactions r WHERE r.post_id = p.post_id) as reaction_count,
          (SELECT COUNT(*) FROM Reactions r WHERE r.post_id = p.post_id AND r.user_id = ?) as has_reacted
        FROM Posts p
        JOIN Users u ON p.user_id = u.user_id
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC
      `;
      const [postRows] = await pool.execute(FIND_POSTS, [
        authenticatedUserId,
        user_id,
      ]);
      const posts = postRows as Post[];

      // Format posts with hashtags
      const formattedPosts = await Promise.all(
        posts.map(async (post) => {
          const FIND_HASHTAGS = `
            SELECT h.hashtag_name
            FROM Content_Hashtags ch
            JOIN Hashtags h ON ch.hashtag_id = h.hashtag_id
            WHERE ch.content_type = 'Post' AND ch.content_id = ?
          `;
          const [hashtagRows] = await pool.execute(FIND_HASHTAGS, [
            post.post_id,
          ]);
          const hashtags = (hashtagRows as { hashtag_name: string }[]).map(
            (h) => h.hashtag_name
          );

          return {
            ...post,
            hashtags,
            reaction_count: Number(post.reaction_count),
            has_reacted: Boolean(post.has_reacted),
            created_at: post.created_at.toISOString(),
          };
        })
      );

      res.status(200).json({ success: true, data: formattedPosts });
    } catch (error) {
      console.error("Get user posts error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }

  // Create a Poll
  static async createPoll(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { question, options, end_time, hashtags } = req.body;
      const poll_id = uuidv4();

      if (
        !question ||
        !options ||
        !Array.isArray(options) ||
        options.length < 2
      ) {
        return res
          .status(400)
          .json({ message: "Question and at least two options are required" });
      }

      await connection.beginTransaction();

      // Insert poll
      const CREATE_POLL = `
        INSERT INTO Polls (poll_id, user_id, question, end_time)
        VALUES (?, ?, ?, ?)
      `;
      await connection.execute(CREATE_POLL, [
        poll_id,
        user.user_id,
        question,
        end_time ? new Date(end_time) : null,
      ]);

      // Insert poll options
      const CREATE_OPTION = `
        INSERT INTO Poll_Options (option_id, poll_id, option_text)
        VALUES (?, ?, ?)
      `;
      for (const option of options) {
        const filteredOptions = options.filter(
          (opt: string) => opt.trim() !== ""
        );
        if (filteredOptions.length < 2) {
          await connection.rollback();
          return res
            .status(400)
            .json({ message: "At least two non-empty options are required" });
        }
        await connection.execute(CREATE_OPTION, [uuidv4(), poll_id, option]);
      }

      // Handle hashtags
      if (hashtags && Array.isArray(hashtags) && hashtags.length > 0) {
        const uniqueHashtags = [
          ...new Set(hashtags.map((h: string) => h.toLowerCase().trim())),
        ].filter((h) => h !== "");
        for (const hashtag of uniqueHashtags) {
          let hashtag_id: string;
          const FIND_HASHTAG = `
            SELECT hashtag_id FROM Hashtags WHERE hashtag_name = ?
          `;
          const [hashtagRows] = await connection.execute(FIND_HASHTAG, [
            hashtag,
          ]);
          const existingHashtag = (hashtagRows as { hashtag_id: string }[])[0];

          if (existingHashtag) {
            hashtag_id = existingHashtag.hashtag_id;
          } else {
            hashtag_id = uuidv4();
            const CREATE_HASHTAG = `
              INSERT INTO Hashtags (hashtag_id, hashtag_name)
              VALUES (?, ?)
            `;
            await connection.execute(CREATE_HASHTAG, [hashtag_id, hashtag]);
          }

          const CREATE_CONTENT_HASHTAG = `
            INSERT INTO Content_Hashtags (content_type, content_id, hashtag_id)
            VALUES (?, ?, ?)
          `;
          await connection.execute(CREATE_CONTENT_HASHTAG, [
            "Poll",
            poll_id,
            hashtag_id,
          ]);
        }
      }

      await connection.commit();
      res.status(201).json({ success: true, poll_id });
    } catch (error) {
      console.error("Create poll error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  // Update a Poll (preserves existing values if not provided or blank)
  static async updatePoll(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      const { poll_id } = req.params;
      const { question, options, end_time, hashtags } = req.body;

      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!poll_id) {
        return res.status(400).json({ message: "Poll ID is required" });
      }

      // Verify poll ownership
      const FIND_POLL = `
        SELECT user_id, question, end_time FROM Polls WHERE poll_id = ?
      `;
      const [pollRows] = await connection.execute(FIND_POLL, [poll_id]);
      const poll = (
        pollRows as {
          user_id: string;
          question: string;
          end_time: Date | null;
        }[]
      )[0];

      if (!poll || poll.user_id !== user.user_id) {
        return res
          .status(403)
          .json({ message: "Not authorized to update this poll" });
      }

      // If no valid update data provided
      if (
        (question === undefined || question === "") &&
        (options === undefined ||
          (Array.isArray(options) && options.length === 0)) &&
        (end_time === undefined || end_time === "" || end_time === null) &&
        (hashtags === undefined ||
          (Array.isArray(hashtags) && hashtags.length === 0))
      ) {
        return res
          .status(400)
          .json({ message: "No valid update data provided" });
      }

      await connection.beginTransaction();

      // Update poll if question or end_time is provided and non-empty
      if (
        (question !== undefined && question !== "") ||
        (end_time !== undefined && end_time !== "" && end_time !== null)
      ) {
        const UPDATE_POLL = `
          UPDATE Polls
          SET 
            question = COALESCE(?, question),
            end_time = COALESCE(?, end_time)
          WHERE poll_id = ?
        `;
        await connection.execute(UPDATE_POLL, [
          question !== undefined && question !== "" ? question : null,
          end_time !== undefined && end_time !== "" && end_time !== null
            ? new Date(end_time)
            : null,
          poll_id,
        ]);
      }

      // Update options if provided and not an empty array
      if (
        options !== undefined &&
        (!Array.isArray(options) || options.length > 0)
      ) {
        if (Array.isArray(options)) {
          const filteredOptions = options.filter(
            (opt: string) => opt.trim() !== ""
          );
          if (filteredOptions.length < 2) {
            await connection.rollback();
            return res
              .status(400)
              .json({ message: "At least two non-empty options are required" });
          }

          // Delete existing options
          const DELETE_OPTIONS = `
            DELETE FROM Poll_Options WHERE poll_id = ?
          `;
          await connection.execute(DELETE_OPTIONS, [poll_id]);

          // Insert new options
          const CREATE_OPTION = `
            INSERT INTO Poll_Options (option_id, poll_id, option_text)
            VALUES (?, ?, ?)
          `;
          for (const option of filteredOptions) {
            await connection.execute(CREATE_OPTION, [
              uuidv4(),
              poll_id,
              option,
            ]);
          }
        }
      }

      // Handle hashtags if provided and not an empty array
      if (
        hashtags !== undefined &&
        (!Array.isArray(hashtags) || hashtags.length > 0)
      ) {
        const DELETE_HASHTAGS = `
          DELETE FROM Content_Hashtags
          WHERE content_type = 'Poll' AND content_id = ?
        `;
        await connection.execute(DELETE_HASHTAGS, [poll_id]);

        if (Array.isArray(hashtags) && hashtags.length > 0) {
          const uniqueHashtags = [
            ...new Set(hashtags.map((h: string) => h.toLowerCase().trim())),
          ].filter((h) => h !== "");
          for (const hashtag of uniqueHashtags) {
            let hashtag_id: string;
            const FIND_HASHTAG = `
              SELECT hashtag_id FROM Hashtags WHERE hashtag_name = ?
            `;
            const [hashtagRows] = await connection.execute(FIND_HASHTAG, [
              hashtag,
            ]);
            const existingHashtag = (
              hashtagRows as { hashtag_id: string }[]
            )[0];

            if (existingHashtag) {
              hashtag_id = existingHashtag.hashtag_id;
            } else {
              hashtag_id = uuidv4();
              const CREATE_HASHTAG = `
                INSERT INTO Hashtags (hashtag_id, hashtag_name)
                VALUES (?, ?)
              `;
              await connection.execute(CREATE_HASHTAG, [hashtag_id, hashtag]);
            }

            const CREATE_CONTENT_HASHTAG = `
              INSERT INTO Content_Hashtags (content_type, content_id, hashtag_id)
              VALUES (?, ?, ?)
            `;
            await connection.execute(CREATE_CONTENT_HASHTAG, [
              "Poll",
              poll_id,
              hashtag_id,
            ]);
          }
        }
      }

      await connection.commit();
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Update poll error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  // Delete a Poll
  static async deletePoll(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      const { poll_id } = req.params;

      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!poll_id) {
        return res.status(400).json({ message: "Poll ID is required" });
      }

      // Verify poll ownership
      const FIND_POLL = `
        SELECT user_id FROM Polls WHERE poll_id = ?
      `;
      const [pollRows] = await connection.execute(FIND_POLL, [poll_id]);
      const poll = (pollRows as { user_id: string }[])[0];

      if (!poll || poll.user_id !== user.user_id) {
        return res
          .status(403)
          .json({ message: "Not authorized to delete this poll" });
      }

      await connection.beginTransaction();

      const DELETE_POLL = `
        DELETE FROM Polls WHERE poll_id = ?
      `;
      await connection.execute(DELETE_POLL, [poll_id]);

      await connection.commit();
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Delete poll error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  // Get All Polls
  static async getAllPolls(req: AuthenticatedRequest, res: Response) {
    try {
      const user_id = req.user?.user_id;
      if (!user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const FIND_POLLS = `
      SELECT p.poll_id, p.user_id, p.question, p.end_time, p.created_at, u.username, u.user_type
      FROM Polls p
      JOIN Users u ON p.user_id = u.user_id
      ORDER BY p.created_at DESC
    `;
      const [pollRows] = await pool.execute(FIND_POLLS);
      const polls = pollRows as Poll[];

      const formattedPolls = await Promise.all(
        polls.map(async (poll) => {
          // Get poll options
          const FIND_OPTIONS = `
          SELECT option_id, poll_id, option_text
          FROM Poll_Options
          WHERE poll_id = ?
        `;
          const [optionRows] = await pool.execute(FIND_OPTIONS, [poll.poll_id]);

          // Get hashtags
          const FIND_HASHTAGS = `
          SELECT h.hashtag_name
          FROM Content_Hashtags ch
          JOIN Hashtags h ON ch.hashtag_id = h.hashtag_id
          WHERE ch.content_type = 'Poll' AND ch.content_id = ?
        `;
          const [hashtagRows] = await pool.execute(FIND_HASHTAGS, [
            poll.poll_id,
          ]);
          const hashtags = (hashtagRows as { hashtag_name: string }[]).map(
            (h) => h.hashtag_name
          );

          // Check if the authenticated user has voted in this poll
          const HAS_VOTED = `
          SELECT COUNT(*) as has_voted
          FROM Poll_Votes
          WHERE poll_id = ? AND user_id = ?
        `;
          const [voteRows] = await pool.execute(HAS_VOTED, [
            poll.poll_id,
            user_id,
          ]);
          const hasVoted = Boolean(
            (voteRows as { has_voted: number }[])[0].has_voted
          );

          // Get vote counts for each option
          const optionsWithVotes = await Promise.all(
            (optionRows as PollOption[]).map(async (option) => {
              const GET_VOTE_COUNT = `
              SELECT COUNT(*) as vote_count
              FROM Poll_Votes
              WHERE option_id = ?
            `;
              const [countRows] = await pool.execute(GET_VOTE_COUNT, [
                option.option_id,
              ]);
              return {
                ...option,
                vote_count: (countRows as { vote_count: number }[])[0]
                  .vote_count,
              };
            })
          );

          return {
            ...poll,
            options: optionsWithVotes,
            hashtags,
            has_voted: hasVoted,
            total_votes: optionsWithVotes.reduce(
              (sum, option) => sum + (option as any).vote_count,
              0
            ),
            created_at: poll.created_at.toISOString(), // Convert to string for consistency
            end_time: poll.end_time ? poll.end_time.toISOString() : null, // Convert to string if not null
          };
        })
      );

      res.status(200).json({ success: true, data: formattedPolls });
    } catch (error) {
      console.error("Get all polls error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }

  static async getUserPolls(req: AuthenticatedRequest, res: Response) {
    try {
      const { studentOrMentorId } = req.params;
      const authenticatedUserId = req.user?.user_id;

      if (!authenticatedUserId) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!studentOrMentorId) {
        return res
          .status(400)
          .json({ message: "Student or Mentor ID is required" });
      }

      // Find user_id from Students or Mentors table
      const FIND_STUDENT = `
            SELECT user_id FROM Students WHERE student_id = ?
        `;
      const FIND_MENTOR = `
            SELECT user_id FROM Mentors WHERE mentor_id = ?
        `;

      const [studentRows] = await pool.execute(FIND_STUDENT, [
        studentOrMentorId,
      ]);
      const [mentorRows] = await pool.execute(FIND_MENTOR, [studentOrMentorId]);

      let user_id: string | null = null;
      if ((studentRows as any[]).length > 0) {
        user_id = (studentRows as any[])[0].user_id;
      } else if ((mentorRows as any[]).length > 0) {
        user_id = (mentorRows as any[])[0].user_id;
      } else {
        return res.status(404).json({ message: "Student or Mentor not found" });
      }

      // Query to fetch polls by user_id
      const FIND_POLLS = `
            SELECT 
                p.poll_id, 
                p.user_id, 
                p.question, 
                p.end_time, 
                p.created_at, 
                u.username, 
                u.user_type
            FROM Polls p
            JOIN Users u ON p.user_id = u.user_id
            WHERE p.user_id = ?
            ORDER BY p.created_at DESC
        `;
      const [pollRows] = await pool.execute(FIND_POLLS, [user_id]);
      const polls = pollRows as Poll[];

      // Format polls with options and hashtags
      const formattedPolls = await Promise.all(
        polls.map(async (poll) => {
          // Get poll options
          const FIND_OPTIONS = `
                    SELECT option_id, poll_id, option_text
                    FROM Poll_Options
                    WHERE poll_id = ?
                `;
          const [optionRows] = await pool.execute(FIND_OPTIONS, [poll.poll_id]);

          // Get hashtags
          const FIND_HASHTAGS = `
                    SELECT h.hashtag_name
                    FROM Content_Hashtags ch
                    JOIN Hashtags h ON ch.hashtag_id = h.hashtag_id
                    WHERE ch.content_type = 'Poll' AND ch.content_id = ?
                `;
          const [hashtagRows] = await pool.execute(FIND_HASHTAGS, [
            poll.poll_id,
          ]);
          const hashtags = (hashtagRows as { hashtag_name: string }[]).map(
            (h) => h.hashtag_name
          );

          // Check if the authenticated user has voted in this poll
          const HAS_VOTED = `
                    SELECT COUNT(*) as has_voted
                    FROM Poll_Votes
                    WHERE poll_id = ? AND user_id = ?
                `;
          const [voteRows] = await pool.execute(HAS_VOTED, [
            poll.poll_id,
            authenticatedUserId,
          ]);
          const hasVoted = Boolean(
            (voteRows as { has_voted: number }[])[0].has_voted
          );

          // Get vote counts for each option (if poll is public)
          const optionsWithVotes = await Promise.all(
            (optionRows as PollOption[]).map(async (option) => {
              const GET_VOTE_COUNT = `
                            SELECT COUNT(*) as vote_count
                            FROM Poll_Votes
                            WHERE option_id = ?
                        `;
              const [countRows] = await pool.execute(GET_VOTE_COUNT, [
                option.option_id,
              ]);
              return {
                ...option,
                vote_count: (countRows as { vote_count: number }[])[0]
                  .vote_count,
              };
            })
          );

          return {
            ...poll,
            options: optionsWithVotes,
            hashtags,
            has_voted: hasVoted,
            total_votes: optionsWithVotes.reduce(
              (sum, option) => sum + (option as any).vote_count,
              0
            ),
          };
        })
      );

      res.status(200).json({ success: true, data: formattedPolls });
    } catch (error) {
      console.error("Get user polls error:", error);
      res.status(500).json({
        message: "Server error",
        error: (error as any).message,
      });
    }
  }

  // Vote on a Poll
  static async votePoll(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      const { poll_id, option_id } = req.body;

      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!poll_id || !option_id) {
        return res
          .status(400)
          .json({ message: "Poll ID and option ID are required" });
      }

      // Check if poll exists and is active
      const FIND_POLL = `
        SELECT end_time FROM Polls WHERE poll_id = ?
      `;
      const [pollRows] = await connection.execute(FIND_POLL, [poll_id]);
      const poll = (pollRows as { end_time: Date | null }[])[0];

      if (!poll) {
        return res.status(404).json({ message: "Poll not found" });
      }

      if (poll.end_time && new Date(poll.end_time) < new Date()) {
        return res.status(400).json({ message: "Poll has ended" });
      }

      // Check if option belongs to the poll
      const FIND_OPTION = `
        SELECT option_id FROM Poll_Options WHERE option_id = ? AND poll_id = ?
      `;
      const [optionRows] = await connection.execute(FIND_OPTION, [
        option_id,
        poll_id,
      ]);
      if ((optionRows as any[]).length === 0) {
        return res
          .status(400)
          .json({ message: "Invalid option for this poll" });
      }

      await connection.beginTransaction();

      // Insert vote
      const CREATE_VOTE = `
        INSERT INTO Poll_Votes (vote_id, poll_id, option_id, user_id)
        VALUES (?, ?, ?, ?)
      `;
      try {
        await connection.execute(CREATE_VOTE, [
          uuidv4(),
          poll_id,
          option_id,
          user.user_id,
        ]);
      } catch (error) {
        if ((error as any).code === "ER_DUP_ENTRY") {
          return res
            .status(400)
            .json({ message: "You have already voted in this poll" });
        }
        throw error;
      }

      await connection.commit();
      res.status(201).json({ success: true });
    } catch (error) {
      console.error("Vote poll error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  static async updateVote(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      const { poll_id, option_id } = req.body;

      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!poll_id || !option_id) {
        return res
          .status(400)
          .json({ message: "Poll ID and option ID are required" });
      }

      // Check if poll exists and is active
      const FIND_POLL = `
      SELECT end_time FROM Polls WHERE poll_id = ?
    `;
      const [pollRows] = await connection.execute(FIND_POLL, [poll_id]);
      const poll = (pollRows as { end_time: Date | null }[])[0];

      if (!poll) {
        return res.status(404).json({ message: "Poll not found" });
      }

      if (poll.end_time && new Date(poll.end_time) < new Date()) {
        return res.status(400).json({ message: "Poll has ended" });
      }

      // Check if option belongs to the poll
      const FIND_OPTION = `
      SELECT option_id FROM Poll_Options WHERE option_id = ? AND poll_id = ?
    `;
      const [optionRows] = await connection.execute(FIND_OPTION, [
        option_id,
        poll_id,
      ]);
      if ((optionRows as any[]).length === 0) {
        return res
          .status(400)
          .json({ message: "Invalid option for this poll" });
      }

      await connection.beginTransaction();

      // Check if user has already voted
      const FIND_VOTE = `
      SELECT vote_id, option_id FROM Poll_Votes WHERE poll_id = ? AND user_id = ?
    `;
      const [voteRows] = await connection.execute(FIND_VOTE, [
        poll_id,
        user.user_id,
      ]);
      const existingVote = (
        voteRows as { vote_id: string; option_id: string }[]
      )[0];

      if (!existingVote) {
        // No existing vote, insert new vote
        const CREATE_VOTE = `
        INSERT INTO Poll_Votes (vote_id, poll_id, option_id, user_id)
        VALUES (?, ?, ?, ?)
      `;
        await connection.execute(CREATE_VOTE, [
          uuidv4(),
          poll_id,
          option_id,
          user.user_id,
        ]);
      } else if (existingVote.option_id === option_id) {
        // User voted for the same option, no action needed, return success
        await connection.commit();
        return res.status(200).json({ success: true });
      } else {
        // User voted for a different option, remove existing vote
        const DELETE_VOTE = `
        DELETE FROM Poll_Votes WHERE vote_id = ?
      `;
        await connection.execute(DELETE_VOTE, [existingVote.vote_id]);

        // Insert new vote
        const CREATE_VOTE = `
        INSERT INTO Poll_Votes (vote_id, poll_id, option_id, user_id)
        VALUES (?, ?, ?, ?)
      `;
        await connection.execute(CREATE_VOTE, [
          uuidv4(),
          poll_id,
          option_id,
          user.user_id,
        ]);
      }

      await connection.commit();
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Update vote error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  // Add Reaction (Love)
  static async addReaction(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      const { post_id, comment_id } = req.body;

      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!post_id && !comment_id) {
        return res
          .status(400)
          .json({ message: "Post ID or Comment ID is required" });
      }

      if (post_id && comment_id) {
        return res
          .status(400)
          .json({ message: "Provide either Post ID or Comment ID, not both" });
      }

      // Verify post or comment exists
      if (post_id) {
        const FIND_POST = `
          SELECT post_id FROM Posts WHERE post_id = ?
        `;
        const [postRows] = await connection.execute(FIND_POST, [post_id]);
        if ((postRows as any[]).length === 0) {
          return res.status(404).json({ message: "Post not found" });
        }
      } else if (comment_id) {
        const FIND_COMMENT = `
          SELECT comment_id FROM Comments WHERE comment_id = ?
        `;
        const [commentRows] = await connection.execute(FIND_COMMENT, [
          comment_id,
        ]);
        if ((commentRows as any[]).length === 0) {
          return res.status(404).json({ message: "Comment not found" });
        }
      }

      await connection.beginTransaction();

      const CREATE_REACTION = `
        INSERT INTO Reactions (reaction_id, user_id, post_id, comment_id, reaction_type)
        VALUES (?, ?, ?, ?, ?)
      `;
      try {
        await connection.execute(CREATE_REACTION, [
          uuidv4(),
          user.user_id,
          post_id || null,
          comment_id || null,
          "Love",
        ]);
      } catch (error) {
        if ((error as any).code === "ER_DUP_ENTRY") {
          return res
            .status(400)
            .json({ message: "You have already reacted to this content" });
        }
        throw error;
      }

      await connection.commit();
      res.status(201).json({ success: true });
    } catch (error) {
      console.error("Add reaction error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  // Remove Reaction
  static async removeReaction(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      const { post_id, comment_id } = req.body;

      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!post_id && !comment_id) {
        return res
          .status(400)
          .json({ message: "Post ID or Comment ID is required" });
      }

      if (post_id && comment_id) {
        return res
          .status(400)
          .json({ message: "Provide either Post ID or Comment ID, not both" });
      }

      // Verify post or comment exists
      if (post_id) {
        const FIND_POST = `
          SELECT post_id FROM Posts WHERE post_id = ?
        `;
        const [postRows] = await connection.execute(FIND_POST, [post_id]);
        if ((postRows as any[]).length === 0) {
          return res.status(404).json({ message: "Post not found" });
        }
      } else if (comment_id) {
        const FIND_COMMENT = `
          SELECT comment_id FROM Comments WHERE comment_id = ?
        `;
        const [commentRows] = await connection.execute(FIND_COMMENT, [
          comment_id,
        ]);
        if ((commentRows as any[]).length === 0) {
          return res.status(404).json({ message: "Comment not found" });
        }
      }

      await connection.beginTransaction();

      // Delete reaction
      const DELETE_REACTION = `
        DELETE FROM Reactions
        WHERE user_id = ? AND ${post_id ? "post_id = ?" : "comment_id = ?"}
      `;
      const [result] = await connection.execute(DELETE_REACTION, [
        user.user_id,
        post_id || comment_id,
      ]);

      if ((result as any).affectedRows === 0) {
        return res.status(404).json({ message: "No reaction found to remove" });
      }

      await connection.commit();
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Remove reaction error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  static async createComment(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { post_id } = req.params;
      const { content, parent_comment_id } = req.body;

      if (!post_id) {
        return res.status(400).json({ message: "Post ID is required" });
      }

      if (!content || content.trim() === "") {
        return res.status(400).json({ message: "Comment content is required" });
      }

      // Verify post exists
      const FIND_POST = `SELECT post_id FROM Posts WHERE post_id = ?`;
      const [postRows] = await connection.execute(FIND_POST, [post_id]);
      if ((postRows as any[]).length === 0) {
        return res.status(404).json({ message: "Post not found" });
      }

      // If this is a reply, verify parent comment exists and belongs to the same post
      if (parent_comment_id) {
        const FIND_PARENT_COMMENT = `
          SELECT comment_id FROM Comments 
          WHERE comment_id = ? AND post_id = ?
        `;
        const [parentCommentRows] = await connection.execute(
          FIND_PARENT_COMMENT,
          [parent_comment_id, post_id]
        );
        if ((parentCommentRows as any[]).length === 0) {
          return res.status(400).json({ message: "Invalid parent comment" });
        }
      }

      await connection.beginTransaction();

      const comment_id = uuidv4();
      const CREATE_COMMENT = `
        INSERT INTO Comments (comment_id, user_id, post_id, parent_comment_id, content)
        VALUES (?, ?, ?, ?, ?)
      `;
      await connection.execute(CREATE_COMMENT, [
        comment_id,
        user.user_id,
        post_id,
        parent_comment_id || null,
        content.trim(),
      ]);

      await connection.commit();
      res.status(201).json({ success: true, comment_id });
    } catch (error) {
      console.error("Create comment error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  static async createReplyComment(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      const { comment_id } = req.params;
      const { content } = req.body;

      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!comment_id) {
        return res
          .status(400)
          .json({ message: "Parent comment ID is required" });
      }

      if (!content || content.trim() === "") {
        return res.status(400).json({ message: "Comment content is required" });
      }

      // Verify parent comment exists
      const FIND_PARENT_COMMENT = `
      SELECT comment_id, post_id FROM Comments WHERE comment_id = ?
    `;
      const [parentCommentRows] = await connection.execute(
        FIND_PARENT_COMMENT,
        [comment_id]
      );
      if ((parentCommentRows as any[]).length === 0) {
        return res.status(404).json({ message: "Parent comment not found" });
      }

      await connection.beginTransaction();

      const reply_comment_id = uuidv4();
      const CREATE_REPLY = `
      INSERT INTO Comments (comment_id, user_id, parent_comment_id, content)
      VALUES (?, ?, ?, ?)
    `;
      await connection.execute(CREATE_REPLY, [
        reply_comment_id,
        user.user_id,
        comment_id,
        content.trim(),
      ]);

      await connection.commit();
      res.status(201).json({ success: true, comment_id: reply_comment_id });
    } catch (error) {
      console.error("Create reply comment error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  static async updateComment(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      const { comment_id } = req.params;
      const { content } = req.body;

      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!comment_id) {
        return res.status(400).json({ message: "Comment ID is required" });
      }

      if (!content || content.trim() === "") {
        return res.status(400).json({ message: "Comment content is required" });
      }

      // First get the current comment content
      const FIND_COMMENT = `
        SELECT user_id, content FROM Comments WHERE comment_id = ?
      `;
      const [commentRows] = await connection.execute(FIND_COMMENT, [
        comment_id,
      ]);
      const comment = (
        commentRows as { user_id: string; content: string }[]
      )[0];

      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      if (comment.user_id !== user.user_id) {
        return res
          .status(403)
          .json({ message: "Not authorized to update this comment" });
      }

      // Check if content is actually different
      const trimmedContent = content.trim();
      if (comment.content === trimmedContent) {
        return res.status(200).json({
          success: true,
          message: "No changes detected - comment remains unchanged",
        });
      }

      await connection.beginTransaction();

      const UPDATE_COMMENT = `
        UPDATE Comments
        SET content = ?, created_at = CURRENT_TIMESTAMP
        WHERE comment_id = ?
      `;
      await connection.execute(UPDATE_COMMENT, [trimmedContent, comment_id]);

      await connection.commit();
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Update comment error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  static async deleteComment(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      const { comment_id } = req.params;

      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!comment_id) {
        return res.status(400).json({ message: "Comment ID is required" });
      }

      const FIND_COMMENT = `
        SELECT user_id FROM Comments WHERE comment_id = ?
      `;
      const [commentRows] = await connection.execute(FIND_COMMENT, [
        comment_id,
      ]);
      const comment = (commentRows as { user_id: string }[])[0];

      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      if (comment.user_id !== user.user_id && user.user_type !== "Admin") {
        return res
          .status(403)
          .json({ message: "Not authorized to delete this comment" });
      }

      await connection.beginTransaction();

      // First delete all reactions to this comment
      const DELETE_REACTIONS = `
        DELETE FROM Reactions WHERE comment_id = ?
      `;
      await connection.execute(DELETE_REACTIONS, [comment_id]);

      // Then delete all replies to this comment
      const DELETE_REPLIES = `
        DELETE FROM Comments WHERE parent_comment_id = ?
      `;
      await connection.execute(DELETE_REPLIES, [comment_id]);

      // Finally delete the comment itself
      const DELETE_COMMENT = `
        DELETE FROM Comments WHERE comment_id = ?
      `;
      await connection.execute(DELETE_COMMENT, [comment_id]);

      await connection.commit();
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Delete comment error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  static async getPostComments(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user_id = req.user?.user_id;
      const { post_id } = req.params;

      if (!user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!post_id) {
        return res.status(400).json({ message: "Post ID is required" });
      }

      // Verify post exists and get total comment count (all comments including replies)
      const FIND_POST = `
        SELECT
          p.post_id,
          (SELECT COUNT(*) FROM Comments c WHERE c.post_id = p.post_id) as total_comments
        FROM Posts p
        WHERE p.post_id = ?
      `;
      const [postRows] = await connection.execute(FIND_POST, [post_id]);
      if ((postRows as any[]).length === 0) {
        return res.status(404).json({ message: "Post not found" });
      }

      const post = (
        postRows as { post_id: string; total_comments: number }[]
      )[0];

      // Get only top-level comments (parent_comment_id IS NULL)
      const FIND_COMMENTS = `
        SELECT
          c.comment_id,
          c.user_id,
          c.post_id,
          c.parent_comment_id,
          c.content,
          c.created_at,
          u.username,
          u.user_type,
          (SELECT COUNT(*) FROM Reactions r WHERE r.comment_id = c.comment_id) as reaction_count,
          (SELECT COUNT(*) FROM Reactions r WHERE r.comment_id = c.comment_id AND r.user_id = ?) as has_reacted,
          (SELECT COUNT(*) FROM Comments rc WHERE rc.parent_comment_id = c.comment_id) as replies_count
        FROM Comments c
        JOIN Users u ON c.user_id = u.user_id
        WHERE c.post_id = ? AND c.parent_comment_id IS NULL
        ORDER BY c.created_at DESC
      `;
      const [commentRows] = await connection.execute(FIND_COMMENTS, [
        user_id,
        post_id,
      ]);

      const formattedComments = (commentRows as Comment[]).map((comment) => ({
        ...comment,
        reaction_count: Number(comment.reaction_count),
        has_reacted: Boolean(comment.has_reacted),
        replies_count: Number(comment.replies_count),
        created_at: comment.created_at.toISOString(),
        replies: [],
      }));

      res.status(200).json({
        success: true,
        data: {
          comments: formattedComments,
          total_comments: Number(post.total_comments),
        },
      });
    } catch (error) {
      console.error("Get post comments error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  static async getCommentReplies(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user_id = req.user?.user_id;
      const { comment_id } = req.params;

      if (!user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      if (!comment_id) {
        return res.status(400).json({ message: "Comment ID is required" });
      }

      // First verify the parent comment exists
      const VERIFY_PARENT = `
        SELECT comment_id FROM Comments WHERE comment_id = ?
      `;
      const [parentRows] = await connection.execute(VERIFY_PARENT, [
        comment_id,
      ]);
      if ((parentRows as any[]).length === 0) {
        return res.status(404).json({ message: "Parent comment not found" });
      }

      // Get all direct replies to this comment
      const FIND_REPLIES = `
        SELECT
          c.comment_id,
          c.user_id,
          c.post_id,
          c.parent_comment_id,
          c.content,
          c.created_at,
          u.username,
          u.user_type,
          (SELECT COUNT(*) FROM Reactions r WHERE r.comment_id = c.comment_id) as reaction_count,
          (SELECT COUNT(*) FROM Reactions r WHERE r.comment_id = c.comment_id AND r.user_id = ?) as has_reacted,
          (SELECT COUNT(*) FROM Comments rc WHERE rc.parent_comment_id = c.comment_id) as replies_count
        FROM Comments c
        JOIN Users u ON c.user_id = u.user_id
        WHERE c.parent_comment_id = ?
        ORDER BY c.created_at ASC
      `;
      const [replyRows] = await connection.execute(FIND_REPLIES, [
        user_id,
        comment_id,
      ]);

      const formattedReplies = (replyRows as Comment[]).map((reply) => ({
        ...reply,
        reaction_count: Number(reply.reaction_count),
        has_reacted: Boolean(reply.has_reacted),
        replies_count: Number(reply.replies_count),
        created_at: reply.created_at.toISOString(),
        replies: [],
      }));

      res.status(200).json({
        success: true,
        data: formattedReplies,
      });
    } catch (error) {
      console.error("Get comment replies error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }
}
