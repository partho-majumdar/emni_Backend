import { Request, Response } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

interface Message {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_type: string;
  message_text: string;
  is_deleted: boolean;
  sent_at: string;
  is_read: boolean;
  read_at: string | null;
}

interface Conversation {
  conversation_id: string;
  student: {
    student_id: string;
    user_id: string;
    name: string;
    username: string;
  };
  mentor: {
    mentor_id: string;
    user_id: string;
    name: string;
    username: string;
  };
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export class MessageController {
  static async startConversation(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { mentorId } = req.params;

      if (!mentorId) {
        return res.status(400).json({ message: "Mentor ID is required" });
      }

      await connection.beginTransaction();

      // Verify user is a student
      const GET_USER_TYPE = `SELECT user_type FROM Users WHERE user_id = ?`;
      const [userRows] = await connection.execute(GET_USER_TYPE, [
        user.user_id,
      ]);
      const userType = (userRows as { user_type: string }[])[0]?.user_type;

      if (userType !== "Student") {
        return res
          .status(403)
          .json({ message: "Only students can start conversations" });
      }

      // Get student_id and mentor_id
      const GET_STUDENT = `SELECT student_id FROM Students WHERE user_id = ?`;
      const [studentRows] = await connection.execute(GET_STUDENT, [
        user.user_id,
      ]);
      const student_id = (studentRows as { student_id: string }[])[0]
        ?.student_id;

      const GET_MENTOR = `SELECT mentor_id FROM Mentors WHERE user_id = ?`;
      const [mentorRows] = await connection.execute(GET_MENTOR, [mentorId]);
      const mentor_id = (mentorRows as { mentor_id: string }[])[0]?.mentor_id;

      if (!student_id || !mentor_id) {
        await connection.rollback();
        return res.status(404).json({ message: "Student or mentor not found" });
      }

      // Check if conversation exists
      const CHECK_CONVERSATION = `
        SELECT conversation_id 
        FROM Conversations 
        WHERE student_id = ? AND mentor_id = ?
      `;
      const [conversationRows] = await connection.execute(CHECK_CONVERSATION, [
        student_id,
        mentor_id,
      ]);
      let conversation = (conversationRows as { conversation_id: string }[])[0];

      if (!conversation) {
        const conversation_id = uuidv4();
        const CREATE_CONVERSATION = `
          INSERT INTO Conversations (conversation_id, student_id, mentor_id)
          VALUES (?, ?, ?)
        `;
        await connection.execute(CREATE_CONVERSATION, [
          conversation_id,
          student_id,
          mentor_id,
        ]);
        conversation = { conversation_id };
      }

      // Get details, including mentor username
      const GET_DETAILS = `
        SELECT 
          u1.name AS student_name, u1.user_id AS student_user_id,
          u2.name AS mentor_name, u2.user_id AS mentor_user_id, u2.username AS mentor_username
        FROM Users u1
        JOIN Students s ON u1.user_id = s.user_id
        JOIN Users u2 ON u2.user_id = ?
        WHERE s.student_id = ?
      `;
      const [detailsRows] = await connection.execute(GET_DETAILS, [
        mentorId,
        student_id,
      ]);
      const details = (
        detailsRows as {
          student_name: string;
          student_user_id: string;
          mentor_name: string;
          mentor_user_id: string;
          mentor_username: string;
        }[]
      )[0];

      if (!details) {
        await connection.rollback();
        return res.status(404).json({ message: "User details not found" });
      }

      await connection.commit();
      res.status(200).json({
        success: true,
        data: {
          conversation_id: conversation.conversation_id,
          student: {
            student_id,
            user_id: details.student_user_id,
            name: details.student_name,
          },
          mentor: {
            mentor_id,
            user_id: details.mentor_user_id,
            name: details.mentor_name,
            username: details.mentor_username,
          },
          messages: [],
        },
      });
    } catch (error) {
      console.error("Start conversation error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  static async sendMessage(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { conversationId } = req.params;
      const { message_text } = req.body;

      if (
        !conversationId ||
        !message_text ||
        message_text.trim().length === 0
      ) {
        return res
          .status(400)
          .json({ message: "Conversation ID and message text are required" });
      }

      await connection.beginTransaction();

      // Verify conversation and user
      const VERIFY_CONVERSATION = `
        SELECT c.conversation_id, s.user_id AS student_user_id, m.user_id AS mentor_user_id
        FROM Conversations c
        JOIN Students s ON c.student_id = s.student_id
        JOIN Mentors m ON c.mentor_id = m.mentor_id
        WHERE c.conversation_id = ?
      `;
      const [conversationRows] = await connection.execute(VERIFY_CONVERSATION, [
        conversationId,
      ]);
      const conversation = (
        conversationRows as {
          conversation_id: string;
          student_user_id: string;
          mentor_user_id: string;
        }[]
      )[0];

      if (!conversation) {
        await connection.rollback();
        return res.status(404).json({ message: "Conversation not found" });
      }

      if (
        conversation.student_user_id !== user.user_id &&
        conversation.mentor_user_id !== user.user_id
      ) {
        await connection.rollback();
        return res
          .status(403)
          .json({ message: "Not authorized to send message" });
      }

      const message_id = uuidv4();
      const INSERT_MESSAGE = `
        INSERT INTO Messages (message_id, conversation_id, sender_id, message_text)
        VALUES (?, ?, ?, ?)
      `;
      await connection.execute(INSERT_MESSAGE, [
        message_id,
        conversationId,
        user.user_id,
        message_text,
      ]);

      // Update last_message_at
      const UPDATE_CONVERSATION = `
        UPDATE Conversations 
        SET last_message_at = CURRENT_TIMESTAMP
        WHERE conversation_id = ?
      `;
      await connection.execute(UPDATE_CONVERSATION, [conversationId]);

      // Insert read status
      const other_user_id =
        user.user_id === conversation.student_user_id
          ? conversation.mentor_user_id
          : conversation.student_user_id;

      const INSERT_READ_STATUS = `
        INSERT INTO Message_Read_Status (status_id, message_id, user_id, is_read)
        VALUES (?, ?, ?, ?)
      `;
      await connection.execute(INSERT_READ_STATUS, [
        uuidv4(),
        message_id,
        user.user_id,
        true,
      ]);
      await connection.execute(INSERT_READ_STATUS, [
        uuidv4(),
        message_id,
        other_user_id,
        false,
      ]);

      // Get sender details
      const GET_SENDER = `SELECT name, user_type FROM Users WHERE user_id = ?`;
      const [senderRows] = await connection.execute(GET_SENDER, [user.user_id]);
      const sender = (senderRows as { name: string; user_type: string }[])[0];

      if (!sender) {
        await connection.rollback();
        return res.status(404).json({ message: "Sender details not found" });
      }

      await connection.commit();
      res.status(201).json({
        success: true,
        data: {
          message_id,
          conversation_id: conversationId,
          sender_id: user.user_id,
          sender_name: sender.name,
          sender_type: sender.user_type,
          message_text,
          is_deleted: false,
          sent_at: new Date().toISOString(),
          is_read: true,
          read_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Send message error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  static async editMessage(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { messageId } = req.params;
      const { message_text } = req.body;

      if (!message_text || message_text.trim().length === 0) {
        return res.status(400).json({ message: "Message text is required" });
      }

      await connection.beginTransaction();

      // Verify message exists and belongs to user
      const VERIFY_MESSAGE = `
        SELECT message_id, sender_id, is_deleted, message_text 
        FROM Messages 
        WHERE message_id = ?
      `;
      const [messageRows] = await connection.execute(VERIFY_MESSAGE, [
        messageId,
      ]);
      const message = (
        messageRows as {
          message_id: string;
          sender_id: string;
          is_deleted: boolean;
          message_text: string;
        }[]
      )[0];

      if (!message) {
        await connection.rollback();
        return res.status(404).json({ message: "Message not found" });
      }

      if (message.sender_id !== user.user_id) {
        await connection.rollback();
        return res
          .status(403)
          .json({ message: "Not authorized to edit this message" });
      }

      if (message.is_deleted) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Cannot edit a deleted message" });
      }

      // Check if text is actually changing
      if (message.message_text === message_text.trim()) {
        await connection.commit();
        return res.status(200).json({
          success: true,
          message: "No changes detected - message remains unchanged",
        });
      }

      // Replace the old message with new one
      const UPDATE_MESSAGE = `
        UPDATE Messages 
        SET message_text = ?, 
            sent_at = CURRENT_TIMESTAMP
        WHERE message_id = ?
      `;
      await connection.execute(UPDATE_MESSAGE, [
        message_text.trim(),
        messageId,
      ]);

      // Get updated message with sender info
      const GET_UPDATED_MESSAGE = `
        SELECT 
          m.message_id,
          m.conversation_id,
          m.sender_id,
          m.message_text,
          m.is_deleted,
          m.sent_at,
          u.name AS sender_name,
          u.user_type AS sender_type
        FROM Messages m
        JOIN Users u ON m.sender_id = u.user_id
        WHERE m.message_id = ?
      `;
      const [updatedRows] = await connection.execute(GET_UPDATED_MESSAGE, [
        messageId,
      ]);
      const updatedMessage = (updatedRows as any[])[0];

      // Update conversation's last_message_at
      const UPDATE_CONVERSATION = `
        UPDATE Conversations 
        SET last_message_at = CURRENT_TIMESTAMP 
        WHERE conversation_id = ?
      `;
      await connection.execute(UPDATE_CONVERSATION, [
        updatedMessage.conversation_id,
      ]);

      await connection.commit();

      res.status(200).json({
        success: true,
        data: {
          ...updatedMessage,
          is_edited: true,
          sent_at: new Date(updatedMessage.sent_at).toISOString(),
        },
      });
    } catch (error) {
      console.error("Edit message error:", error);
      await connection.rollback();
      res.status(500).json({
        message: "Server error",
        error: (error as any).message,
      });
    } finally {
      connection.release();
    }
  }

  static async deleteMessage(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { messageId } = req.params;

      await connection.beginTransaction();

      // Verify message
      const VERIFY_MESSAGE = `
        SELECT message_id, sender_id, is_deleted
        FROM Messages
        WHERE message_id = ?
      `;
      const [messageRows] = await connection.execute(VERIFY_MESSAGE, [
        messageId,
      ]);
      const message = (
        messageRows as {
          message_id: string;
          sender_id: string;
          is_deleted: boolean;
        }[]
      )[0];

      if (!message) {
        await connection.rollback();
        return res.status(404).json({ message: "Message not found" });
      }

      if (message.sender_id !== user.user_id) {
        await connection.rollback();
        return res
          .status(403)
          .json({ message: "Not authorized to delete this message" });
      }

      if (message.is_deleted) {
        await connection.rollback();
        return res.status(400).json({ message: "Message is already deleted" });
      }

      const DELETE_MESSAGE = `
        UPDATE Messages 
        SET is_deleted = TRUE
        WHERE message_id = ?
      `;
      await connection.execute(DELETE_MESSAGE, [messageId]);

      await connection.commit();
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Delete message error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  static async getConversations(req: AuthenticatedRequest, res: Response) {
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      // Get all conversations for the user, including mentor and student usernames
      const GET_CONVERSATIONS = `
      SELECT 
        c.conversation_id,
        c.student_id,
        s.user_id AS student_user_id,
        us.name AS student_name,
        us.username AS student_username,
        c.mentor_id,
        m.user_id AS mentor_user_id,
        um.name AS mentor_name,
        um.username AS mentor_username,
        c.last_message_at
      FROM Conversations c
      JOIN Students s ON c.student_id = s.student_id
      JOIN Mentors m ON c.mentor_id = m.mentor_id
      JOIN Users us ON s.user_id = us.user_id
      JOIN Users um ON m.user_id = um.user_id
      WHERE s.user_id = ? OR m.user_id = ?
      ORDER BY c.last_message_at DESC
    `;
      const [conversationRows] = await pool.execute(GET_CONVERSATIONS, [
        user.user_id,
        user.user_id,
      ]);

      // For each conversation, get the last message and unread count
      const conversations = await Promise.all(
        (conversationRows as any[]).map(async (conv) => {
          // Get last message
          const GET_LAST_MESSAGE = `
          SELECT 
            m.message_text,
            m.sender_id
          FROM Messages m
          WHERE m.conversation_id = ?
          ORDER BY m.sent_at DESC
          LIMIT 1
        `;
          const [messageRows] = await pool.execute(GET_LAST_MESSAGE, [
            conv.conversation_id,
          ]);
          const lastMessage = (messageRows as any[])[0] || null;

          // Get unread count
          const GET_UNREAD_COUNT = `
          SELECT COUNT(*) AS unread_count
          FROM Messages m
          JOIN Message_Read_Status mrs ON m.message_id = mrs.message_id
          WHERE m.conversation_id = ?
          AND mrs.user_id = ?
          AND mrs.is_read = FALSE
          AND m.sender_id != ?
        `;
          const [unreadRows] = await pool.execute(GET_UNREAD_COUNT, [
            conv.conversation_id,
            user.user_id,
            user.user_id,
          ]);
          const unreadCount = (unreadRows as any[])[0]?.unread_count || 0;

          return {
            conversation_id: conv.conversation_id,
            student: {
              student_id: conv.student_id,
              user_id: conv.student_user_id,
              name: conv.student_name,
              username: conv.student_username,
            },
            mentor: {
              mentor_id: conv.mentor_id,
              user_id: conv.mentor_user_id,
              name: conv.mentor_name,
              username: conv.mentor_username,
            },
            last_message_text: lastMessage?.message_text || null,
            last_message_at: conv.last_message_at
              ? new Date(conv.last_message_at).toISOString()
              : null,
            unread_count: Number(unreadCount),
          };
        })
      );

      res.status(200).json({
        success: true,
        data: conversations,
      });
    } catch (error) {
      console.error("Get conversations error:", error);
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    }
  }

  static async getMessagesByMentor(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        console.error("Authentication error: No user data provided");
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { mentorId } = req.params;

      if (!mentorId) {
        console.error("Validation error: Mentor ID is required");
        return res.status(400).json({ message: "Mentor ID is required" });
      }

      await connection.beginTransaction();

      const GET_USER = `SELECT user_id, user_type FROM Users WHERE user_id = ?`;
      const [userRows] = await connection.execute(GET_USER, [user.user_id]);
      const userData = (
        userRows as { user_id: string; user_type: string }[]
      )[0];

      if (!userData) {
        console.error(`User not found for user_id: ${user.user_id}`);
        await connection.rollback();
        return res
          .status(404)
          .json({ message: "Authenticated user not found" });
      }

      if (userData.user_type !== "Student") {
        console.error(
          `Access denied: User type ${userData.user_type} is not a Student`
        );
        await connection.rollback();
        return res
          .status(403)
          .json({ message: "Only students can access this endpoint" });
      }

      const GET_STUDENT = `SELECT student_id FROM Students WHERE user_id = ?`;
      const [studentRows] = await connection.execute(GET_STUDENT, [
        user.user_id,
      ]);
      const student_id = (studentRows as { student_id: string }[])[0]
        ?.student_id;

      if (!student_id) {
        console.error(`Student not found for user_id: ${user.user_id}`);
        await connection.rollback();
        return res.status(404).json({ message: "Student profile not found" });
      }

      const GET_MENTOR = `
        SELECT m.mentor_id, m.user_id 
        FROM Mentors m
        WHERE m.mentor_id = ? OR m.user_id = ?
        LIMIT 1
      `;
      const [mentorRows] = await connection.execute(GET_MENTOR, [
        mentorId,
        mentorId,
      ]);
      const mentor = (
        mentorRows as { mentor_id: string; user_id: string }[]
      )[0];

      if (!mentor) {
        console.error(`Mentor not found for ID: ${mentorId}`);
        await connection.rollback();
        return res.status(404).json({ message: "Mentor not found" });
      }

      // Check if conversation exists between student and mentor
      const GET_CONVERSATION = `
        SELECT 
          c.conversation_id,
          s.user_id AS student_user_id,
          us.name AS student_name,
          m.user_id AS mentor_user_id,
          um.name AS mentor_name,
          um.username AS mentor_username,
          c.last_message_at
        FROM Conversations c
        JOIN Students s ON c.student_id = s.student_id
        JOIN Mentors m ON c.mentor_id = m.mentor_id
        JOIN Users us ON s.user_id = us.user_id
        JOIN Users um ON m.user_id = um.user_id
        WHERE c.student_id = ? AND c.mentor_id = ?
      `;
      const [conversationRows] = await connection.execute(GET_CONVERSATION, [
        student_id,
        mentor.mentor_id,
      ]);
      let conversation = (conversationRows as any[])[0];

      // If no conversation exists, create one
      if (!conversation) {
        console.log(
          `Creating new conversation between student ${student_id} and mentor ${mentor.mentor_id}`
        );
        const conversation_id = uuidv4();
        const CREATE_CONVERSATION = `
          INSERT INTO Conversations (conversation_id, student_id, mentor_id)
          VALUES (?, ?, ?)
        `;
        await connection.execute(CREATE_CONVERSATION, [
          conversation_id,
          student_id,
          mentor.mentor_id,
        ]);

        // Get the newly created conversation details
        const [newConversationRows] = await connection.execute(
          GET_CONVERSATION,
          [student_id, mentor.mentor_id]
        );
        conversation = (newConversationRows as any[])[0];

        if (!conversation) {
          console.error("Failed to create new conversation");
          await connection.rollback();
          return res
            .status(500)
            .json({ message: "Failed to create conversation" });
        }
      }

      // Get all messages for this conversation
      const GET_MESSAGES = `
        SELECT 
          m.message_id,
          m.conversation_id,
          m.sender_id,
          m.message_text,
          m.is_deleted,
          m.sent_at,
          u.name AS sender_name,
          u.user_type AS sender_type,
          mrs.is_read,
          mrs.read_at
        FROM Messages m
        JOIN Users u ON m.sender_id = u.user_id
        LEFT JOIN Message_Read_Status mrs ON m.message_id = mrs.message_id AND mrs.user_id = ?
        WHERE m.conversation_id = ? AND m.is_deleted = FALSE
        ORDER BY m.sent_at ASC
      `;
      const [messageRows] = await connection.execute(GET_MESSAGES, [
        user.user_id,
        conversation.conversation_id,
      ]);

      // Calculate unread message count
      const GET_UNREAD_COUNT = `
        SELECT COUNT(*) AS unread_count
        FROM Messages m
        JOIN Message_Read_Status mrs ON m.message_id = mrs.message_id
        WHERE m.conversation_id = ?
        AND mrs.user_id = ?
        AND mrs.is_read = FALSE
        AND m.sender_id != ?
      `;
      const [unreadRows] = await connection.execute(GET_UNREAD_COUNT, [
        conversation.conversation_id,
        user.user_id,
        user.user_id,
      ]);
      const unreadCount = (unreadRows as any[])[0]?.unread_count || 0;

      const messages = (messageRows as any[]).map((msg) => ({
        message_id: msg.message_id,
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        sender_name: msg.sender_name,
        sender_type: msg.sender_type,
        message_text: msg.message_text,
        is_deleted: msg.is_deleted,
        sent_at: new Date(msg.sent_at).toISOString(),
        is_read: msg.is_read,
        read_at: msg.read_at ? new Date(msg.read_at).toISOString() : null,
      }));

      await connection.commit();

      res.status(200).json({
        success: true,
        data: {
          conversation_id: conversation.conversation_id,
          student: {
            student_id,
            user_id: conversation.student_user_id,
            name: conversation.student_name,
          },
          mentor: {
            mentor_id: mentor.mentor_id,
            user_id: conversation.mentor_user_id,
            name: conversation.mentor_name,
            username: conversation.mentor_username,
          },
          last_message_at: conversation.last_message_at
            ? new Date(conversation.last_message_at).toISOString()
            : null,
          unread_count: Number(unreadCount),
          messages,
        },
      });
    } catch (error) {
      console.error("Get messages by mentor error:", error);
      await connection.rollback();
      res.status(500).json({
        message: "Server error",
        error: (error as any).message,
      });
    } finally {
      connection.release();
    }
  }

  static async getMessagesByStudent(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        console.error("Authentication error: No user data provided");
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { studentId } = req.params;

      if (!studentId) {
        console.error("Validation error: Student ID is required");
        return res.status(400).json({ message: "Student ID is required" });
      }

      await connection.beginTransaction();

      // Verify user is a mentor
      const GET_USER = `SELECT user_id, user_type FROM Users WHERE user_id = ?`;
      const [userRows] = await connection.execute(GET_USER, [user.user_id]);
      const userData = (
        userRows as { user_id: string; user_type: string }[]
      )[0];

      if (!userData) {
        console.error(`User not found for user_id: ${user.user_id}`);
        await connection.rollback();
        return res
          .status(404)
          .json({ message: "Authenticated user not found" });
      }

      if (userData.user_type !== "Mentor") {
        console.error(
          `Access denied: User type ${userData.user_type} is not a Mentor`
        );
        await connection.rollback();
        return res
          .status(403)
          .json({ message: "Only mentors can access this endpoint" });
      }

      // Get mentor_id
      const GET_MENTOR = `SELECT mentor_id FROM Mentors WHERE user_id = ?`;
      const [mentorRows] = await connection.execute(GET_MENTOR, [user.user_id]);
      const mentor_id = (mentorRows as { mentor_id: string }[])[0]?.mentor_id;

      if (!mentor_id) {
        console.error(`Mentor not found for user_id: ${user.user_id}`);
        await connection.rollback();
        return res.status(404).json({ message: "Mentor profile not found" });
      }

      // Check both student_id and user_id to find the student
      const GET_STUDENT = `
        SELECT s.student_id, s.user_id 
        FROM Students s
        WHERE s.student_id = ? OR s.user_id = ?
        LIMIT 1
      `;
      const [studentRows] = await connection.execute(GET_STUDENT, [
        studentId,
        studentId,
      ]);
      const student = (
        studentRows as { student_id: string; user_id: string }[]
      )[0];

      if (!student) {
        console.error(`Student not found for ID: ${studentId}`);
        await connection.rollback();
        return res.status(404).json({ message: "Student not found" });
      }

      // Check if conversation exists between student and mentor
      const GET_CONVERSATION = `
        SELECT 
          c.conversation_id,
          s.user_id AS student_user_id,
          us.name AS student_name,
          m.user_id AS mentor_user_id,
          um.name AS mentor_name,
          um.username AS mentor_username,
          c.last_message_at
        FROM Conversations c
        JOIN Students s ON c.student_id = s.student_id
        JOIN Mentors m ON c.mentor_id = m.mentor_id
        JOIN Users us ON s.user_id = us.user_id
        JOIN Users um ON m.user_id = um.user_id
        WHERE c.student_id = ? AND c.mentor_id = ?
      `;
      const [conversationRows] = await connection.execute(GET_CONVERSATION, [
        student.student_id,
        mentor_id,
      ]);
      let conversation = (conversationRows as any[])[0];

      // If no conversation exists, create one
      if (!conversation) {
        console.log(
          `Creating new conversation between student ${student.student_id} and mentor ${mentor_id}`
        );
        const conversation_id = uuidv4();
        const CREATE_CONVERSATION = `
          INSERT INTO Conversations (conversation_id, student_id, mentor_id)
          VALUES (?, ?, ?)
        `;
        await connection.execute(CREATE_CONVERSATION, [
          conversation_id,
          student.student_id,
          mentor_id,
        ]);

        // Get the newly created conversation details
        const [newConversationRows] = await connection.execute(
          GET_CONVERSATION,
          [student.student_id, mentor_id]
        );
        conversation = (newConversationRows as any[])[0];

        if (!conversation) {
          console.error("Failed to create new conversation");
          await connection.rollback();
          return res
            .status(500)
            .json({ message: "Failed to create conversation" });
        }
      }

      // Get all messages for this conversation
      const GET_MESSAGES = `
        SELECT 
          m.message_id,
          m.conversation_id,
          m.sender_id,
          m.message_text,
          m.is_deleted,
          m.sent_at,
          u.name AS sender_name,
          u.user_type AS sender_type,
          mrs.is_read,
          mrs.read_at
        FROM Messages m
        JOIN Users u ON m.sender_id = u.user_id
        LEFT JOIN Message_Read_Status mrs ON m.message_id = mrs.message_id AND mrs.user_id = ?
        WHERE m.conversation_id = ? AND m.is_deleted = FALSE
        ORDER BY m.sent_at ASC
      `;
      const [messageRows] = await connection.execute(GET_MESSAGES, [
        user.user_id,
        conversation.conversation_id,
      ]);

      // Calculate unread message count
      const GET_UNREAD_COUNT = `
        SELECT COUNT(*) AS unread_count
        FROM Messages m
        JOIN Message_Read_Status mrs ON m.message_id = mrs.message_id
        WHERE m.conversation_id = ?
        AND mrs.user_id = ?
        AND mrs.is_read = FALSE
        AND m.sender_id != ?
      `;
      const [unreadRows] = await connection.execute(GET_UNREAD_COUNT, [
        conversation.conversation_id,
        user.user_id,
        user.user_id,
      ]);
      const unreadCount = (unreadRows as any[])[0]?.unread_count || 0;

      const messages = (messageRows as any[]).map((msg) => ({
        message_id: msg.message_id,
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        sender_name: msg.sender_name,
        sender_type: msg.sender_type,
        message_text: msg.message_text,
        is_deleted: msg.is_deleted,
        sent_at: new Date(msg.sent_at).toISOString(),
        is_read: msg.is_read,
        read_at: msg.read_at ? new Date(msg.read_at).toISOString() : null,
      }));

      await connection.commit();

      res.status(200).json({
        success: true,
        data: {
          conversation_id: conversation.conversation_id,
          student: {
            student_id: student.student_id,
            user_id: conversation.student_user_id,
            name: conversation.student_name,
          },
          mentor: {
            mentor_id,
            user_id: conversation.mentor_user_id,
            name: conversation.mentor_name,
            username: conversation.mentor_username,
          },
          last_message_at: conversation.last_message_at
            ? new Date(conversation.last_message_at).toISOString()
            : null,
          unread_count: Number(unreadCount),
          messages,
        },
      });
    } catch (error) {
      console.error("Get messages by student error:", error);
      await connection.rollback();
      res.status(500).json({
        message: "Server error",
        error: (error as any).message,
      });
    } finally {
      connection.release();
    }
  }

  static async markMessagesAsRead(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { conversationId } = req.params;

      if (!conversationId) {
        return res.status(400).json({ message: "Conversation ID is required" });
      }

      await connection.beginTransaction();

      // Verify user is part of conversation
      const VERIFY_CONVERSATION = `
        SELECT c.conversation_id
        FROM Conversations c
        JOIN Students s ON c.student_id = s.student_id
        JOIN Mentors m ON c.mentor_id = m.mentor_id
        WHERE c.conversation_id = ? AND (s.user_id = ? OR m.user_id = ?)
      `;
      const [conversationRows] = await connection.execute(VERIFY_CONVERSATION, [
        conversationId,
        user.user_id,
        user.user_id,
      ]);
      const conversation = (
        conversationRows as { conversation_id: string }[]
      )[0];

      if (!conversation) {
        await connection.rollback();
        return res
          .status(403)
          .json({ message: "Not authorized or conversation not found" });
      }

      // Update read status
      const UPDATE_READ_STATUS = `
        UPDATE Message_Read_Status mrs
        JOIN Messages m ON mrs.message_id = m.message_id
        SET mrs.is_read = TRUE, mrs.read_at = CURRENT_TIMESTAMP
        WHERE mrs.user_id = ? 
          AND m.conversation_id = ? 
          AND mrs.is_read = FALSE
          AND m.sender_id != ?
      `;
      await connection.execute(UPDATE_READ_STATUS, [
        user.user_id,
        conversationId,
        user.user_id,
      ]);

      await connection.commit();
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Mark messages as read error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }
}
