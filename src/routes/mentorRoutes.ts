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
import { oneOnOneSessionController } from "../controllers/mentor/oneOnOneSessionController";
import GroupSessionController from "../controllers/mentor/groupSessionCreate";

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

// Mentor one to one session availability time Routes
router
  .get(
    "/m/availability",
    authenticateToken as RequestHandler,
    requireMentor as RequestHandler,
    MentorAvailabilityController.getAvailabilities as RequestHandler
  )
  .post(
    "/avalability/add",
    authenticateToken as RequestHandler,
    requireMentor as RequestHandler,
    MentorAvailabilityController.addAvailability as RequestHandler
  );

// mentor session details
router.post(
  "/sessions/new",
  authenticateToken as RequestHandler,
  requireMentor as RequestHandler,
  oneOnOneSessionController.createSession as RequestHandler
);
// .get(
//   "/m/sessions",
//   authenticateToken as RequestHandler,
//   oneOnOneSessionController.getSession as RequestHandler
// );

router
  .post(
    "/groupsessions/create",
    authenticateToken as RequestHandler,
    requireMentor as RequestHandler,
    GroupSessionController.createGroupSession as RequestHandler
  )
  .get(
    "/groupsessions/mentor/:mID",
    authenticateToken as RequestHandler,
    requireMentor as RequestHandler,
    GroupSessionController.getGroupSessionsByMentorId as RequestHandler
  )
  .delete(
    "/groupsessions/delete/:groupSessionId",
    authenticateToken as RequestHandler,
    requireMentor as RequestHandler,
    GroupSessionController.deleteGroupSession as RequestHandler
  );

export default router;
