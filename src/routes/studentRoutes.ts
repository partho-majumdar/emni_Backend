import express, { Router } from "express";
import { StudentAuthController } from "../controllers/student/authController";
import {
  authenticateToken,
  requireStudent,
  requireAnyAuthenticated,
} from "../middleware/auth";

import {
  // getStudentInterests,
  // addStudentInterests,
  // updateStudentInterests,
  StudentInterestController,
} from "../controllers/student/interestController";
import { getSuggestedMentors } from "../controllers/student/mentorSuggestionController";
import MentorAvailabilityController from "../controllers/student/studentSeeMentorFreeTime";

const router = Router();

router.get(
  "/suggested-mentors",
  authenticateToken as express.RequestHandler,
  getSuggestedMentors as express.RequestHandler
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
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
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

// router.post(
//   "/interests/add",
//   authenticateToken as express.RequestHandler,
//   addStudentInterests as express.RequestHandler
// );

// router.put(
//   "/interests/update",
//   authenticateToken as express.RequestHandler,
//   updateStudentInterests as express.RequestHandler
// );

router.get(
  "/mavaliableat/:mentorId",
  MentorAvailabilityController.getMentorAvailability as express.RequestHandler
);

export default router;
