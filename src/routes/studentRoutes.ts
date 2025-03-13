import express, { Router } from "express";
import { StudentAuthController } from "../controllers/student/authController";
import { authenticateToken } from "../middleware/auth";
import {
  getStudentInterests,
  addStudentInterests,
  updateStudentInterests,
} from "../controllers/student/interestController";
import { getSuggestedMentors } from "../controllers/student/mentorSuggestionController";

const router = Router();

router.get(
  "/suggested-mentors",
  authenticateToken as express.RequestHandler,
  getSuggestedMentors as express.RequestHandler
);

router.get(
  "/all",
  StudentAuthController.getAllStudents as express.RequestHandler
);

router.post(
  "/register",
  StudentAuthController.register as express.RequestHandler
);

router.post("/login", StudentAuthController.login as express.RequestHandler);

router.get(
  "/:student_id",
  StudentAuthController.getProfile as express.RequestHandler
);

router.put(
  "/profile/edit",
  authenticateToken as express.RequestHandler,
  StudentAuthController.updateProfile as express.RequestHandler
);

// Interest-related routes

router.get(
  "/interests/list",
  authenticateToken as express.RequestHandler,
  getStudentInterests as express.RequestHandler
);

router.post(
  "/interests/add",
  authenticateToken as express.RequestHandler,
  addStudentInterests as express.RequestHandler
);

router.put(
  "/interests/update",
  authenticateToken as express.RequestHandler,
  updateStudentInterests as express.RequestHandler
);

export default router;
