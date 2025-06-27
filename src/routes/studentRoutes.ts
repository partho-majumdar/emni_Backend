import express, { Router } from "express";
import { StudentAuthController } from "../controllers/student/authController";
import {
  authenticateToken,
  requireStudent,
  requireAnyAuthenticated,
  requireMentorOrStudent,
  requireMentor,
} from "../middleware/auth";

import { StudentInterestController } from "../controllers/student/interestController";
import MentorAvailabilityController from "../controllers/student/studentSeeMentorFreeTime";
import { StudentSessionController } from "../controllers/student/studentBookOneOnOneSession";
import {
  getNonMatchingMentors,
  getSuggestedMentorsInterestBased,
} from "../controllers/student/mentorSuggestionController";
import StudentBookSessionController from "../controllers/student/studentAllBookedSessions";
import { ReviewController } from "../controllers/student/studentGiveReviews";
import { AIChatController } from "../controllers/common/aiChatController";
import { JobController } from "../controllers/student/studentJobController";

const router = Router();

router
  .get(
    "/findmentor/interest",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    getSuggestedMentorsInterestBased as express.RequestHandler
  )
  .get(
    "/findmentor/other",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    getNonMatchingMentors as express.RequestHandler
  );

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
  )
  .get(
    "/:student_id",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    StudentAuthController.getStudentProfileById as express.RequestHandler
  );

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

router
  .get(
    "/booked/s/all",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    StudentBookSessionController.getAllBookedSessionsForStudent as express.RequestHandler
  )
  .get(
    "/booked/:studentID",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    StudentBookSessionController.getAllBookedSessions as express.RequestHandler
  );

// Review routes
router
  .post(
    "/review/one-on-one/:one_on_one_session_id",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    ReviewController.createOneOnOneReview as express.RequestHandler
  )
  .post(
    "/review/group/:group_session_id",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    ReviewController.createGroupSessionReview as express.RequestHandler
  )
  .get(
    "/review/one-on-one/:one_on_one_session_id",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    ReviewController.getOneOnOneSessionReview as express.RequestHandler
  )
  .get(
    "/review/group/:group_session_id",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    ReviewController.getGroupSessionReviews as express.RequestHandler
  );

router
  .get(
    "/ai-chat/student/:studentId",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    AIChatController.startOrContinueAIConversation as express.RequestHandler
  )
  .post(
    "/ai-chat/student/send/:studentId",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    AIChatController.sendAIMessage as express.RequestHandler
  );

// Job posting routes
router
  .post(
    "/jobs",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    JobController.createJobPost as express.RequestHandler
  )
  .put(
    "/jobs/:job_id",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    JobController.updateJobPost as express.RequestHandler
  )
  .delete(
    "/jobs/:job_id",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    JobController.deleteJobPost as express.RequestHandler
  );

// Job application routes
router
  .post(
    "/jobs/:job_id/apply",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    JobController.applyForJob as express.RequestHandler
  )
  .get(
    "/jobs/:job_id/applications",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    JobController.getJobApplications as express.RequestHandler
  )
  .put(
    "/jobs/:job_id/applications/:application_id",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    JobController.updateApplicationStatus as express.RequestHandler
  );

// Job completion
router.post(
  "/jobs/:job_id/complete",
  authenticateToken as express.RequestHandler,
  requireStudent as express.RequestHandler,
  JobController.completeJob as express.RequestHandler
);

// Job listing routes
router
  .get(
    "/s/jobs",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    JobController.getAllJobs as express.RequestHandler
  )
  .get(
    "/jobs/my-jobs",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    JobController.getMyPostedJobs as express.RequestHandler
  )
  .get(
    "/jobs/my-applications",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    JobController.getMyJobApplications as express.RequestHandler
  )
  .get(
    "/jobs/:job_id",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    JobController.getJobDetails as express.RequestHandler
  )
  .get(
    "/s/jobs/active-contracts",
    authenticateToken as express.RequestHandler,
    requireStudent as express.RequestHandler,
    JobController.getActiveContracts as express.RequestHandler
  );

export default router;
