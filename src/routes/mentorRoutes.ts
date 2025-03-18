import express, { Router } from "express";
import { MentorAuthController } from "../controllers/mentor/authController";
import { authenticateToken } from "../middleware/auth";
import {
  getMentorInterests,
  addMentorInterests,
  updateMentorInterests,
} from "../controllers/mentor/interestController";

const router = Router();

// router.get(
//   "/image/:mentor_id",
//   MentorAuthController.getMentorImage as express.RequestHandler
// );

// router.get(
//   "/all",
//   MentorAuthController.getAllMentors as express.RequestHandler
// );

// router.post(
//   "/register",
//   MentorAuthController.register as express.RequestHandler
// );

// router.post("/login", MentorAuthController.login as express.RequestHandler);

// router.get(
//   "/:mentor_id",
//   MentorAuthController.getProfile as express.RequestHandler
// );

// router.put(
//   "/profile/edit",
//   authenticateToken as express.RequestHandler,
//   MentorAuthController.updateProfile as express.RequestHandler
// );

// router.get(
//   "/interests/list",
//   authenticateToken as express.RequestHandler,
//   getMentorInterests as express.RequestHandler
// );

// router.post(
//   "/interests/add",
//   authenticateToken as express.RequestHandler,
//   addMentorInterests as express.RequestHandler
// );

// router.put(
//   "/interests/update",
//   authenticateToken as express.RequestHandler,
//   updateMentorInterests as express.RequestHandler
// );

router
  .get(
    "/image/:mentor_id",
    MentorAuthController.getMentorImage as express.RequestHandler
  )
  .get("/all", MentorAuthController.getAllMentors as express.RequestHandler)
  .post("/register", MentorAuthController.register as express.RequestHandler)
  .post("/login", MentorAuthController.login as express.RequestHandler)
  .get("/:mentor_id", MentorAuthController.getProfile as express.RequestHandler)
  .put(
    "/profile/edit",
    authenticateToken as express.RequestHandler,
    MentorAuthController.updateProfile as express.RequestHandler
  )
  .get(
    "/interests/list",
    authenticateToken as express.RequestHandler,
    getMentorInterests as express.RequestHandler
  )
  .post(
    "/interests/add",
    authenticateToken as express.RequestHandler,
    addMentorInterests as express.RequestHandler
  )
  .put(
    "/interests/update",
    authenticateToken as express.RequestHandler,
    updateMentorInterests as express.RequestHandler
  );

export default router;
