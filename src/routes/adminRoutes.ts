// import express from "express";
// import { AdminAuthController } from "../controllers/admin/authController";
// import { MentorApprovalController } from "../controllers/admin/mentorApprovalController";
// import { authenticateToken } from "../middleware/auth";

// const router = express.Router();

// // Public admin route (login only)
// router.post("/login", AdminAuthController.login as express.RequestHandler);

// // Protected admin routes
// router.post(
//   "/promote-to-admin",
//   authenticateToken as express.RequestHandler,
//   AdminAuthController.promoteToAdmin as express.RequestHandler
// );

// router.get(
//   "/mentors/unapproved",
//   authenticateToken as express.RequestHandler,
//   MentorApprovalController.getUnapprovedMentors as express.RequestHandler
// );

// router.post(
//   "/mentors/approve",
//   authenticateToken as express.RequestHandler,
//   MentorApprovalController.updateMentorApproval as express.RequestHandler
// );

// export default router;
