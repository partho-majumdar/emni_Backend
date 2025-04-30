import express, { Router } from "express";
import {
  authenticateToken,
  requireMentor,
  requireMentorOrStudent,
  requireStudent,
} from "../middleware/auth";
import { oneOnOneSessionController } from "../controllers/mentor/oneOnOneSessionController";

const router = Router();

// A.1 Get Session by ID
router.get(
  "/:sessionId",
  authenticateToken as express.RequestHandler,
  requireMentorOrStudent as express.RequestHandler,
  oneOnOneSessionController.getSessionById as express.RequestHandler
);

// A.2 Get Sessions List for Mentor
router.get(
  "/mentor/list",
  authenticateToken as express.RequestHandler,
  requireMentor as express.RequestHandler,
  oneOnOneSessionController.getSessionListForParticularMentor as express.RequestHandler
);

// A.3 Create New Session
router.post(
  "/new",
  authenticateToken as express.RequestHandler,
  requireMentor as express.RequestHandler,
  oneOnOneSessionController.createSession as express.RequestHandler
);

// A.4 Update Session (implied)
router.put(
  "/:sessionId",
  authenticateToken as express.RequestHandler,
  requireMentor as express.RequestHandler,
  oneOnOneSessionController.updateSession as express.RequestHandler
);

// A.5 Delete Session (implied)
router.delete(
  "/:sessionId",
  authenticateToken as express.RequestHandler,
  requireMentor as express.RequestHandler,
  oneOnOneSessionController.deleteSession as express.RequestHandler
);

// A.6 Get Sessions for Student (interest-based)
router.get(
  "/student/interest",
  authenticateToken as express.RequestHandler,
  requireStudent as express.RequestHandler,
  oneOnOneSessionController.getInterestBasedSessionsForStudent as express.RequestHandler
);

// A.7 Get Sessions for Student (others)
router.get(
  "/student/others",
  authenticateToken as express.RequestHandler,
  requireStudent as express.RequestHandler,
  oneOnOneSessionController.getNonInterestBasedSessionsForStudent as express.RequestHandler
);

export default router;
