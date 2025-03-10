import express, { Router } from "express";
import { StudentAuthController } from "../controllers/student/authController";
import { authenticateToken } from "../middleware/auth";
import {
  getStudentInterests,
  addStudentInterests,
  updateStudentInterests,
} from "../controllers/student/interestController";

const router = Router();

router.post(
  "/register",
  StudentAuthController.register as express.RequestHandler
);

router.post("/login", StudentAuthController.login as express.RequestHandler);

router.get(
  "/profile",
  authenticateToken as express.RequestHandler,
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
  authenticateToken as express.RequestHandler, // Now requires authentication
  getStudentInterests as express.RequestHandler // Changed to fetch student's interests
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
