import express, { Router } from "express";
import { AdminAuthController } from "../controllers/admin/authController";
import {
  authenticateToken,
  requireAnyAuthenticated,
  requireAdmin,
} from "../middleware/auth";

const router = Router();

router.post(
  "/setup",
  AdminAuthController.setupDefaultAdmin as express.RequestHandler
);

router.post("/login", AdminAuthController.login as express.RequestHandler);

router.get(
  "/mentors/unapproved",
  authenticateToken as express.RequestHandler,
  requireAdmin as express.RequestHandler,
  AdminAuthController.getUnapprovedMentors as express.RequestHandler
);

router.post(
  "/mentor/approve",
  authenticateToken as express.RequestHandler,
  requireAdmin as express.RequestHandler,
  AdminAuthController.approveMentor as express.RequestHandler
);

router.post(
  "/promote-to-admin",
  authenticateToken as express.RequestHandler,
  AdminAuthController.promoteToAdmin as express.RequestHandler
);

export default router;
