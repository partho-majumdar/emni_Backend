import express, { Router, RequestHandler } from "express";
import { MentorAuthController } from "../controllers/mentor/authController";
import {
  authenticateToken,
  requireAnyAuthenticated,
  requireMentor,
} from "../middleware/auth";
import {
  getMentorInterests,
  addMentorInterests,
  updateMentorInterests,
} from "../controllers/mentor/interestController";

import { MentorAvailabilityController } from "../controllers/mentor/mentorTimeController";

import oneOnOneSessionController from "../controllers/mentor/oneOnOneSessionController";

interface AuthenticatedRequest extends express.Request {
  user?: { user_id: string; user_type: string };
}

const router = Router();

// Mentor Auth Routes
router
  .get(
    "/image/:mentor_id",
    MentorAuthController.getMentorImage as RequestHandler
  )
  .get("/all", MentorAuthController.getAllMentors as RequestHandler)
  .post("/register", MentorAuthController.register as RequestHandler)
  .post("/login", MentorAuthController.login as RequestHandler)
  .get(
    "/:mentor_id",
    authenticateToken as RequestHandler,
    requireAnyAuthenticated as RequestHandler,
    MentorAuthController.getProfile as RequestHandler
  )
  .put(
    "/profile/edit",
    authenticateToken as RequestHandler,
    MentorAuthController.updateProfile as RequestHandler
  );

// Mentor Interest Routes
router
  .get(
    "/interests/list",
    authenticateToken as RequestHandler,
    getMentorInterests as RequestHandler
  )
  .post(
    "/interests/add",
    authenticateToken as RequestHandler,
    addMentorInterests as RequestHandler
  )
  .put(
    "/interests/update",
    authenticateToken as RequestHandler,
    updateMentorInterests as RequestHandler
  );

// Mentor one to one session Routes
router
  .get(
    "/m/availability",
    authenticateToken as RequestHandler,
    MentorAvailabilityController.getAvailabilities as RequestHandler
  )
  .post(
    "/availability/add",
    authenticateToken as RequestHandler,
    MentorAvailabilityController.addAvailability as RequestHandler
  );

router
  .post(
    "/sessions/add",
    authenticateToken as RequestHandler,
    oneOnOneSessionController.createSession as RequestHandler
  )
  .get(
    "/m/sessions",
    authenticateToken as RequestHandler,
    oneOnOneSessionController.getSession as RequestHandler
  );

export default router;
