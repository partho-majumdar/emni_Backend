import express, { Router } from "express";
import { MessageController } from "../controllers/common/messageController";
import { authenticateToken, requireMentorOrStudent } from "../middleware/auth";

const router = Router();

// Messaging Routes
router
  .post(
    "/conversations/:mentorId",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    MessageController.startConversation as express.RequestHandler
  )
  .get(
    "/conversations",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    MessageController.getConversations as express.RequestHandler
  )
  .get(
    "/conversations/mentor/:mentorId",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    MessageController.getMessagesByMentor as express.RequestHandler
  )
  .get(
    "/conversations/student/:studentId",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    MessageController.getMessagesByStudent as express.RequestHandler
  )
  .post(
    "/messages/:conversationId",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    MessageController.sendMessage as express.RequestHandler
  )
  .put(
    "/messages/:messageId",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    MessageController.editMessage as express.RequestHandler
  )
  .delete(
    "/messages/:messageId",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    MessageController.deleteMessage as express.RequestHandler
  )
  .put(
    "/conversations/:conversationId/read",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    MessageController.markMessagesAsRead as express.RequestHandler
  );

export default router;
