// import express, { Router, express.RequestHandler } from "express";
// import { MentorAuthController } from "../controllers/mentor/authController";
// import {
//   authenticateToken,
//   requireAnyAuthenticated,
//   requireMentor,
//   requireMentorOrStudent,
// } from "../middleware/auth";
// import {
//   getMentorInterests,
//   addMentorInterests,
//   updateMentorInterests,
// } from "../controllers/mentor/interestController";
// import { MentorAvailabilityController } from "../controllers/mentor/mentorTimeController";
// import { oneOnOneSessionController } from "../controllers/mentor/oneOnOneSessionController";
// import GroupSessionController from "../controllers/mentor/groupSessionCreate";

// interface AuthenticatedRequest extends express.Request {
//   user?: { user_id: string; user_type: string };
// }

// const router = Router();

// // Mentor Auth Routes
// router
//   .get(
//     "/image/:mentor_id",
//     MentorAuthController.getMentorImage as express.RequestHandler
//   )
//   .get("/all", MentorAuthController.getAllMentors as express.RequestHandler)
//   .post("/register", MentorAuthController.register as express.RequestHandler)
//   .post("/login", MentorAuthController.login as express.RequestHandler)
//   .get(
//     "/:mentor_id",
//     authenticateToken as express.RequestHandler,
//     requireAnyAuthenticated as express.RequestHandler,
//     MentorAuthController.getProfile as express.RequestHandler
//   )
//   .put(
//     "/profile/edit",
//     authenticateToken as express.RequestHandler,
//     MentorAuthController.updateProfile as express.RequestHandler
//   );

// // Mentor Interest Routes
// router
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

// // Mentor one to one session availability time Routes
// router
//   .get(
//     "/m/availability",
//     authenticateToken as express.RequestHandler,
//     requireMentor as express.RequestHandler,
//     MentorAvailabilityController.getAvailabilities as express.RequestHandler
//   )
//   .post(
//     "/avalability/add",
//     authenticateToken as express.RequestHandler,
//     requireMentor as express.RequestHandler,
//     MentorAvailabilityController.addAvailability as express.RequestHandler
//   );

// // mentor 1:1 session details
// router
//   .post(
//     "/sessions/new",
//     authenticateToken as express.RequestHandler,
//     requireMentor as express.RequestHandler,
//     oneOnOneSessionController.createSession as express.RequestHandler
//   )
//   .get(
//     "/sessions/mentor",
//     authenticateToken as express.RequestHandler,
//     requireMentor as express.RequestHandler,
//     oneOnOneSessionController.getSessionListForParticularMentor as express.RequestHandler
//   )
//   .get(
//     "/sessions/:sessionId",
//     authenticateToken as express.RequestHandler,
//     requireMentorOrStudent as express.RequestHandler,
//     oneOnOneSessionController.getSessionById as express.RequestHandler
//   );

// // mentor create group session details
// router
//   .post(
//     "/groupsessions/create",
//     authenticateToken as express.RequestHandler,
//     requireMentor as express.RequestHandler,
//     GroupSessionController.createGroupSession as express.RequestHandler
//   )
//   .get(
//     "/groupsessions/mentor/:mID",
//     authenticateToken as express.RequestHandler,
//     requireMentor as express.RequestHandler,
//     GroupSessionController.getGroupSessionsByMentorId as express.RequestHandler
//   )
//   .delete(
//     "/groupsessions/delete/:groupSessionId",
//     authenticateToken as express.RequestHandler,
//     requireMentor as express.RequestHandler,
//     GroupSessionController.deleteGroupSession as express.RequestHandler
//   );

// export default router;

import express, { Router } from "express";
import { MentorAuthController } from "../controllers/mentor/authController";
import {
  authenticateToken,
  requireMentor,
  requireAnyAuthenticated,
} from "../middleware/auth";
import {
  getMentorInterests,
  addMentorInterests,
  updateMentorInterests,
} from "../controllers/mentor/interestController";
import { MentorAvailabilityController } from "../controllers/mentor/mentorTimeController";
// import { mentorSessionController } from "../controllers/mentor/mentorSessionController";

const router = Router();

// Mentor Auth Routes
router.get(
  "/image/:mentor_id",
  MentorAuthController.getMentorImage as express.RequestHandler
);
router.get(
  "/all",
  MentorAuthController.getAllMentors as express.RequestHandler
);
router.post(
  "/register",
  MentorAuthController.register as express.RequestHandler
);
router.post("/login", MentorAuthController.login as express.RequestHandler);
router.get(
  "/:mentor_id",
  authenticateToken as express.RequestHandler,
  requireAnyAuthenticated as express.RequestHandler,
  MentorAuthController.getProfile as express.RequestHandler
);
router.put(
  "/profile/edit",
  authenticateToken as express.RequestHandler,
  MentorAuthController.updateProfile as express.RequestHandler
);

// Interest Routes
router.get(
  "/interests/list",
  authenticateToken as express.RequestHandler,
  getMentorInterests as express.RequestHandler
);
router.post(
  "/interests/add",
  authenticateToken as express.RequestHandler,
  addMentorInterests as express.RequestHandler
);
router.put(
  "/interests/update",
  authenticateToken as express.RequestHandler,
  updateMentorInterests as express.RequestHandler
);

// C.1 Add Availability
router.post(
  "/availability/add",
  authenticateToken as express.RequestHandler,
  requireMentor as express.RequestHandler,
  MentorAvailabilityController.addAvailability as express.RequestHandler
);

// C.2 Get Availability List
router.get(
  "/availability",
  authenticateToken as express.RequestHandler,
  requireMentor as express.RequestHandler,
  MentorAvailabilityController.getAvailabilities as express.RequestHandler
);

// C.3 Get Closest Booked Session
// router.get(
//   "/booked/closest",
//   authenticateToken,
//   requireMentor,
//   mentorSessionController.getClosestBookedSession
// );

export default router;
