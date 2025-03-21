// import express, { Router } from "express";
// import { MentorAuthController } from "../controllers/mentor/authController";
// import { authenticateToken } from "../middleware/auth";
// import {
//   getMentorInterests,
//   addMentorInterests,
//   updateMentorInterests,
// } from "../controllers/mentor/interestController";

// import { SessionController } from "../controllers/mentor/mentorTimeController";

// const router = Router();

// router
//   .get(
//     "/image/:mentor_id",
//     MentorAuthController.getMentorImage as express.RequestHandler
//   )
//   .get("/all", MentorAuthController.getAllMentors as express.RequestHandler)
//   .post("/register", MentorAuthController.register as express.RequestHandler)
//   .post("/login", MentorAuthController.login as express.RequestHandler)
//   .get("/:mentor_id", MentorAuthController.getProfile as express.RequestHandler)
//   .put(
//     "/profile/edit",
//     authenticateToken as express.RequestHandler,
//     MentorAuthController.updateProfile as express.RequestHandler
//   )
//   .get(
//     "/interests/list",
//     authenticateToken as express.RequestHandler,
//     getMentorInterests as express.RequestHandler
//   )
//   .post(
//     "/interests/add",
//     authenticateToken as express.RequestHandler,
//     addMentorInterests as express.RequestHandler
//   )
//   .put(
//     "/interests/update",
//     authenticateToken as express.RequestHandler,
//     updateMentorInterests as express.RequestHandler
//   );

// router.post(
//   "/addSessions",
//   authenticateToken as express.RequestHandler,
//   SessionController.createSession as express.RequestHandler
// );
// router.post(
//   "/sessions/availability",
//   authenticateToken as express.RequestHandler,
//   SessionController.setAvailability as express.RequestHandler
// );
// router.get(
//   "/sessions",
//   authenticateToken as express.RequestHandler,
//   SessionController.getMentorAvailability as express.RequestHandler
// );

// export default router;

import express, { Router, RequestHandler } from "express";
import { MentorAuthController } from "../controllers/mentor/authController";
import { authenticateToken } from "../middleware/auth";
import {
  getMentorInterests,
  addMentorInterests,
  updateMentorInterests,
} from "../controllers/mentor/interestController";

import { MentorSessionController } from "../controllers/mentor/mentorTimeController";

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
  .get("/:mentor_id", MentorAuthController.getProfile as RequestHandler)
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

router
  .post(
    "/addSessions",
    authenticateToken as RequestHandler,
    MentorSessionController.createSessionWithAvailability as RequestHandler
  )
  .get(
    "/sessions/availability",
    authenticateToken as RequestHandler,
    MentorSessionController.getSessionDetails as RequestHandler
  );

export default router;
