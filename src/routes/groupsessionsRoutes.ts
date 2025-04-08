// import express, { Router, express.RequestHandler } from "express";
// import {
//   authenticateToken,
//   requireAnyAuthenticated,
//   requireMentor,
//   requireMentorOrStudent,
// } from "../middleware/auth";

// const router = Router();

// export default router;

import express, { Router } from "express";
import {
  authenticateToken,
  requireMentor,
  requireStudent,
  requireMentorOrStudent,
} from "../middleware/auth";
import GroupSessionController from "../controllers/mentor/groupSessionCreate";
// import { groupSessionParticipantController } from "../controllers/student/groupSessionParticipantController";

const router = Router();

// D.1 Get List of Group Sessions
// router.get(
//   "/",
//   authenticateToken,
//   requireMentorOrStudent,
//   GroupSessionController.getAllGroupSessions
// );

// D.2 Get Specific Group Session
// router.get(
//   "/:gsid",
//   authenticateToken,
//   requireMentorOrStudent,
//   GroupSessionController.getGroupSessionById
// );

// D.3 Student Joins Group Session
// router.post(
//   "/join",
//   authenticateToken,
//   requireStudent,
//   groupSessionParticipantController.joinGroupSession
// );

// D.4 Cancel Registration
// router.post(
//   "/cancelregistration",
//   authenticateToken,
//   requireStudent,
//   groupSessionParticipantController.cancelRegistration
// );

// D.5 Get Participant List
// router.get(
//   "/participantlist/:gsid",
//   authenticateToken,
//   requireMentorOrStudent,
//   GroupSessionController.getParticipantList
// );

// D.6 Create Group Session
router.post(
  "/create",
  authenticateToken as express.RequestHandler,
  requireMentor as express.RequestHandler,
  GroupSessionController.createGroupSession as express.RequestHandler
);

// D.7 Delete Group Session
router.delete(
  "/delete/:groupSessionId",
  authenticateToken as express.RequestHandler,
  requireMentor as express.RequestHandler,
  GroupSessionController.deleteGroupSession as express.RequestHandler
);

// D.8 Get Group Sessions for Mentor
router.get(
  "/mentor/:mID",
  authenticateToken as express.RequestHandler,
  requireMentor as express.RequestHandler,
  GroupSessionController.getGroupSessionsByMentorId as express.RequestHandler
);

export default router;
