import express, { Router } from "express";
import { MentorAuthController } from "../controllers/mentor/authController";
import { authenticateToken } from "../middleware/auth";
import {
  getMentorInterests,
  addMentorInterests,
  updateMentorInterests,
} from "../controllers/mentor/interestController";

const router = Router();

// this is for login and register
router.post(
  "/register",
  MentorAuthController.register as express.RequestHandler
);

router.post("/login", MentorAuthController.login as express.RequestHandler);

router.get(
  "/profile",
  authenticateToken as express.RequestHandler,
  MentorAuthController.getProfile as express.RequestHandler
);

router.put(
  "/profile/edit",
  authenticateToken as express.RequestHandler,
  MentorAuthController.updateProfile as express.RequestHandler
);

// Interest-related routes

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

export default router;
