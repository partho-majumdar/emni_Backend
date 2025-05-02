import express, { Router } from "express";
import { MentorAuthController } from "../controllers/mentor/authController";
import {
  authenticateToken,
  requireMentor,
  requireAnyAuthenticated,
  requireMentorOrStudent,
} from "../middleware/auth";
import { MentorInterestController } from "../controllers/mentor/interestController";
import { MentorAvailabilityController } from "../controllers/mentor/mentorTimeController";

const router = Router();

router
  .post("/register", MentorAuthController.register as express.RequestHandler)
  .post("/login", MentorAuthController.login as express.RequestHandler)
  .get(
    "/image/:mentor_id",
    MentorAuthController.getMentorImage as express.RequestHandler
  )
  .get(
    "/myself",
    authenticateToken as express.RequestHandler,
    requireMentor as express.RequestHandler,
    MentorAuthController.getMentorMyselfProfile as express.RequestHandler
  )
  .put(
    "/myself",
    authenticateToken as express.RequestHandler,
    requireMentor as express.RequestHandler,
    MentorAuthController.updateMentorProfile as express.RequestHandler
  )
  .get(
    "/:mID",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    MentorAuthController.getMentorProfileById as express.RequestHandler
  );

// Interest Routes
router
  .put(
    "/interests/list",
    authenticateToken as express.RequestHandler,
    requireMentor as express.RequestHandler,
    MentorInterestController.updateMentorInterests as express.RequestHandler
  )
  .get(
    "/interests/list",
    authenticateToken as express.RequestHandler,
    requireMentor as express.RequestHandler,
    MentorInterestController.getMentorInterests as express.RequestHandler
  );

// C.1 Add Availability
router
  .post(
    "/availability/add",
    authenticateToken as express.RequestHandler,
    requireMentor as express.RequestHandler,
    MentorAvailabilityController.addAvailability as express.RequestHandler
  )
  .get(
    "/availability/list",
    authenticateToken as express.RequestHandler,
    requireMentor as express.RequestHandler,
    MentorAvailabilityController.getAvailabilities as express.RequestHandler
  )
  .delete(
    "/availability/:availability_id",
    authenticateToken as express.RequestHandler,
    requireMentor as express.RequestHandler,
    MentorAvailabilityController.deleteAvailability as express.RequestHandler
  );

// C.3 Get Closest Booked Session
// router.get(
//   "/booked/closest",
//   authenticateToken,
//   requireMentor,
//   mentorSessionController.getClosestBookedSession
// );

export default router;
