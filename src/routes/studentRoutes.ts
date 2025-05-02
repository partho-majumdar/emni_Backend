import express, { Router } from "express";
import { StudentAuthController } from "../controllers/student/authController";
import {
  authenticateToken,
  requireStudent,
  requireAnyAuthenticated,
  requireMentorOrStudent,
} from "../middleware/auth";

import { StudentInterestController } from "../controllers/student/interestController";
import MentorAvailabilityController from "../controllers/student/studentSeeMentorFreeTime";
import { StudentSessionController } from "../controllers/student/studentBookOneOnOneSession";
import { getSuggestedMentorsInterestBased } from "../controllers/student/mentorSuggestionController";
import { getAllBookedSessions } from "../controllers/student/studentAllBookedSessions";

const router = Router();

router.get(
  "/findmentor/interest",
  authenticateToken as express.RequestHandler,
  requireStudent as express.RequestHandler,
  getSuggestedMentorsInterestBased as express.RequestHandler
);

// router.get(
//   "/all",
//   StudentAuthController.getAllStudents as express.RequestHandler
// );

router
  .post("/register", StudentAuthController.register as express.RequestHandler)
  .post("/login", StudentAuthController.login as express.RequestHandler)
  .put(
    "/myself",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    StudentAuthController.updateStudentProfile as express.RequestHandler
  )
  .get(
    "/myself",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    StudentAuthController.getStudentProfile as express.RequestHandler
  )
  .get(
    "/image/:student_id",
    StudentAuthController.getStudentImage as express.RequestHandler
  );

// router.get(
//   "/:student_id",
//   StudentAuthController.getProfile as express.RequestHandler
// );

// router.put(
//   "/profile/edit",
//   authenticateToken as express.RequestHandler,
//   StudentAuthController.updateProfile as express.RequestHandler
// );

// Interest-related routes
router
  .put(
    "/interests/list",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    StudentInterestController.updateStudentInterests as express.RequestHandler
  )
  .get(
    "/interests/list",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    StudentInterestController.getStudentInterests as express.RequestHandler
  );

router
  .get(
    "/mavaliableat/:mentorId",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    MentorAvailabilityController.getMentorAvailability as express.RequestHandler
  )
  .get(
    "/mavaliableat/aid/:availabilityID",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    MentorAvailabilityController.getAvailabilityById as express.RequestHandler
  );

router.get(
  "/booked/:studentID",
  authenticateToken as express.RequestHandler,
  requireStudent as express.RequestHandler,
  getAllBookedSessions as express.RequestHandler
);

router.post(
  "/payment/:sessionID",
  authenticateToken as express.RequestHandler,
  requireStudent as express.RequestHandler,
  StudentSessionController.bookSession as express.RequestHandler
);

export default router;
