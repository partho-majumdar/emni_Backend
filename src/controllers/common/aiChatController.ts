import { Request, Response } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

interface AIChatMessage {
  message_id: string;
  conversation_id: string;
  user_id: string;
  message_text: string;
  is_from_ai: boolean;
  sent_at: string;
}

export class AIChatController {
  private static genAI = new GoogleGenerativeAI(
    "AIzaSyA6K54E-IkkviKB_YFJ3oKW47jVsrLb1Ck"
  );

  // Start or continue AI conversation using studentId
  static async startOrContinueAIConversation(
    req: AuthenticatedRequest,
    res: Response
  ) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { studentId } = req.params;

      if (!studentId) {
        return res.status(400).json({ message: "Student ID is required" });
      }

      await connection.beginTransaction();

      // Verify authenticated user is the student or has permission
      const GET_STUDENT = `
        SELECT s.student_id, s.user_id, u.name, u.username 
        FROM Students s
        JOIN Users u ON s.user_id = u.user_id
        WHERE s.student_id = ? AND u.user_type = 'Student'
      `;
      const [studentRows] = await connection.execute(GET_STUDENT, [studentId]);
      const student = (
        studentRows as {
          student_id: string;
          user_id: string;
          name: string;
          username: string;
        }[]
      )[0];

      if (!student) {
        await connection.rollback();
        return res.status(404).json({ message: "Student not found" });
      }

      if (student.user_id !== user.user_id) {
        await connection.rollback();
        return res.status(403).json({
          message: "Not authorized to start conversation for this student",
        });
      }

      // Check if conversation exists for the student
      const GET_CONVERSATION = `
        SELECT c.conversation_id, c.created_at,
               COUNT(m.message_id) as message_count
        FROM AI_Conversations c
        LEFT JOIN AI_Chat_Messages m ON c.conversation_id = m.conversation_id
        WHERE c.user_id = ?
        GROUP BY c.conversation_id
        ORDER BY c.created_at DESC
        LIMIT 1
      `;
      const [conversationRows] = await connection.execute(GET_CONVERSATION, [
        student.user_id,
      ]);
      let conversation = (conversationRows as any[])[0];

      // If no conversation exists, create a new one
      if (!conversation) {
        const newConversationId = uuidv4();
        const CREATE_CONVERSATION = `
          INSERT INTO AI_Conversations (conversation_id, user_id)
          VALUES (?, ?)
        `;
        await connection.execute(CREATE_CONVERSATION, [
          newConversationId,
          student.user_id,
        ]);

        conversation = {
          conversation_id: newConversationId,
          created_at: new Date().toISOString(),
          message_count: 0,
        };
      }

      // Get messages for this conversation if they exist
      const GET_MESSAGES = `
        SELECT 
          message_id,
          conversation_id,
          user_id,
          message_text,
          is_from_ai,
          sent_at
        FROM AI_Chat_Messages
        WHERE conversation_id = ?
        ORDER BY sent_at ASC
      `;
      const [messageRows] = await connection.execute(GET_MESSAGES, [
        conversation.conversation_id,
      ]);

      const messages = (messageRows as any[]).map((msg) => ({
        message_id: msg.message_id,
        conversation_id: msg.conversation_id,
        user_id: msg.user_id,
        message_text: msg.message_text,
        is_from_ai: msg.is_from_ai,
        sent_at: new Date(msg.sent_at).toISOString(),
      }));

      await connection.commit();

      res.status(200).json({
        success: true,
        data: {
          conversation_id: conversation.conversation_id,
          student: {
            student_id: student.student_id,
            user_id: student.user_id,
            name: student.name,
            username: student.username,
          },
          messages,
        },
      });
    } catch (error) {
      console.error("Start/continue AI conversation error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }

  static async sendAIMessage(req: AuthenticatedRequest, res: Response) {
    const connection = await pool.getConnection();
    try {
      const user = req.user;
      if (!user || !user.user_id) {
        return res.status(401).json({ message: "Unauthorized: No user data" });
      }

      const { message_text } = req.body;
      const { studentId } = req.params;

      if (!message_text || message_text.trim().length === 0) {
        return res.status(400).json({ message: "Message text is required" });
      }

      if (!studentId) {
        return res.status(400).json({ message: "Student ID is required" });
      }

      await connection.beginTransaction();

      // Verify student and user authorization
      const GET_STUDENT = `
          SELECT s.student_id, s.user_id 
          FROM Students s
          WHERE s.student_id = ? AND s.user_id = ?
      `;
      const [studentRows] = await connection.execute(GET_STUDENT, [
        studentId,
        user.user_id,
      ]);
      const student = (
        studentRows as { student_id: string; user_id: string }[]
      )[0];

      if (!student) {
        await connection.rollback();
        return res.status(403).json({
          message: "Not authorized to send message for this student",
        });
      }

      // Get or create conversation
      const GET_CONVERSATION = `
          SELECT conversation_id 
          FROM AI_Conversations 
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 1
      `;
      const [conversationRows] = await connection.execute(GET_CONVERSATION, [
        student.user_id,
      ]);
      let conversationId = (conversationRows as any[])[0]?.conversation_id;

      if (!conversationId) {
        conversationId = uuidv4();
        const CREATE_CONVERSATION = `
              INSERT INTO AI_Conversations (conversation_id, user_id)
              VALUES (?, ?)
          `;
        await connection.execute(CREATE_CONVERSATION, [
          conversationId,
          student.user_id,
        ]);
      }

      // Insert user's message
      const userMessageId = uuidv4();
      const INSERT_USER_MESSAGE = `
          INSERT INTO AI_Chat_Messages (
              message_id, 
              user_id, 
              conversation_id, 
              message_text, 
              is_from_ai
          ) VALUES (?, ?, ?, ?, ?)
      `;
      await connection.execute(INSERT_USER_MESSAGE, [
        userMessageId,
        student.user_id,
        conversationId,
        message_text.trim(),
        false,
      ]);

      // Get conversation history for context
      const GET_HISTORY = `
          SELECT message_text, is_from_ai 
          FROM AI_Chat_Messages 
          WHERE conversation_id = ? 
          ORDER BY sent_at ASC
      `;
      const [historyRows] = await connection.execute(GET_HISTORY, [
        conversationId,
      ]);
      const history = (
        historyRows as { message_text: string; is_from_ai: boolean }[]
      ).map((row) => ({
        role: row.is_from_ai ? "model" : "user",
        parts: [{ text: row.message_text }],
      }));

      // Call Gemini API with proper formatting
      const model = AIChatController.genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });
      const chatSession = model.startChat({
        history,
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.7,
        },
      });

      const prompt = `Please provide a detailed response to the user's question using proper Markdown formatting:

    - Use **bold** for emphasis
    - Use *italics* for subtle emphasis
    - Use proper headings (## for main sections, ### for subsections)
    - Use code blocks with language specification for code examples: \`\`\`language
    - Use inline code with backticks for short code snippets
    - Use bullet points for lists
    - Use numbered lists for steps
    - Use > for blockquotes
    - Keep explanations clear and practical
    - Provide actionable steps when applicable
    - Maintain a professional but conversational tone

    User question: ${message_text.trim()}`;

      const result = await chatSession.sendMessage(prompt);
      const aiResponse = result.response.text();

      // Insert AI's response
      const aiMessageId = uuidv4();
      const INSERT_AI_MESSAGE = `
          INSERT INTO AI_Chat_Messages (
              message_id, 
              user_id, 
              conversation_id, 
              message_text, 
              is_from_ai
          ) VALUES (?, ?, ?, ?, ?)
      `;
      await connection.execute(INSERT_AI_MESSAGE, [
        aiMessageId,
        student.user_id,
        conversationId,
        aiResponse,
        true,
      ]);

      await connection.commit();

      res.status(201).json({
        success: true,
        data: {
          user_message: {
            message_id: userMessageId,
            conversation_id: conversationId,
            user_id: student.user_id,
            message_text: message_text.trim(),
            is_from_ai: false,
            sent_at: new Date().toISOString(),
          },
          ai_response: {
            message_id: aiMessageId,
            conversation_id: conversationId,
            user_id: student.user_id,
            message_text: aiResponse,
            is_from_ai: true,
            sent_at: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      console.error("Send AI message error:", error);
      await connection.rollback();
      res
        .status(500)
        .json({ message: "Server error", error: (error as any).message });
    } finally {
      connection.release();
    }
  }
}
