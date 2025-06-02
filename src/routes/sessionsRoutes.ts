import express, { Router } from "express";
import {
  authenticateToken,
  requireMentor,
  requireMentorOrStudent,
  requireStudent,
} from "../middleware/auth";
import { oneOnOneSessionController } from "../controllers/mentor/oneOnOneSessionController";
import { StudentSessionController } from "../controllers/student/studentBookOneOnOneSession";
import OneOnOneSessionLinkController from "../controllers/mentor/oneOnOneSessionLinkController";

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

// A.4 Update Session
router.put(
  "/:sessionId",
  authenticateToken as express.RequestHandler,
  requireMentor as express.RequestHandler,
  oneOnOneSessionController.updateSession as express.RequestHandler
);

// A.5 Delete Session
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

// UCOIN Endpoints
router.post(
  "/purchase-ucoin",
  authenticateToken as express.RequestHandler,
  requireStudent as express.RequestHandler,
  StudentSessionController.purchaseUcoin as express.RequestHandler
);
router.get(
  "/ucoin/balance",
  authenticateToken as express.RequestHandler,
  requireMentorOrStudent as express.RequestHandler,
  StudentSessionController.getBalance as express.RequestHandler
);
router.get(
  "/transactions/history",
  authenticateToken as express.RequestHandler,
  requireMentorOrStudent as express.RequestHandler,
  StudentSessionController.getTransactionHistory as express.RequestHandler
);

// Session Booking Endpoint
router.post(
  "/book/:sessionID",
  authenticateToken as express.RequestHandler,
  requireStudent as express.RequestHandler,
  StudentSessionController.bookSession as express.RequestHandler
);

// Session Refund Endpoint
router
  .post(
    "/refund-request/:sessionId",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    StudentSessionController.requestRefund as express.RequestHandler
  )
  .post(
    "/refund-request/approve/:requestId",
    authenticateToken as express.RequestHandler,
    requireMentor as express.RequestHandler,
    StudentSessionController.approveRefund as express.RequestHandler
  );

// Session Link Update Endpoint (Mentor Only, for online sessions)
router
  .put(
    "/booked/link-or-address/:oneOnOneSessionId",
    authenticateToken as express.RequestHandler,
    requireMentor as express.RequestHandler,
    OneOnOneSessionLinkController.updateSessionLinkOrAddress as express.RequestHandler
  )
  .get(
    "/booked/link-or-address/:oneOnOneSessionId",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    OneOnOneSessionLinkController.getSessionLinkOrAddress as express.RequestHandler
  )
  .get(
    "/booked/:bookedId", // bookedId = 1:1 Session ID
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    OneOnOneSessionLinkController.getBookedSessionBySessionID as express.RequestHandler
  )
  .get(
    "/booked/m/all",
    authenticateToken as express.RequestHandler,
    requireMentor as express.RequestHandler,
    OneOnOneSessionLinkController.getBookedOneOnOneSessions as express.RequestHandler
  );

export default router;
