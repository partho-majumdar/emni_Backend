import express from "express";
import { DiscussionController } from "../controllers/common/newsFeedController";
import { authenticateToken, requireMentorOrStudent } from "../middleware/auth";

const router = express.Router();

// Post Routes
router
  .post(
    "/post",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.createPost as express.RequestHandler
  )
  .put(
    "/post/:post_id",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.updatePost as express.RequestHandler
  )
  .delete(
    "/post/:post_id",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.deletePost as express.RequestHandler
  )
  .get(
    "/posts",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.getAllPosts as express.RequestHandler
  )
  .get(
    "/posts/:studentOrMentorId",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.getUserPosts as express.RequestHandler
  );

// Poll Routes
router
  .post(
    "/poll",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.createPoll as express.RequestHandler
  )
  .put(
    "/poll/:poll_id",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.updatePoll as express.RequestHandler
  )
  .delete(
    "/poll/:poll_id",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.deletePoll as express.RequestHandler
  )
  .get(
    "/polls",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.getAllPolls as express.RequestHandler
  )
  .get(
    "/polls/:studentOrMentorId",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.getUserPolls as express.RequestHandler
  )
  .post(
    "/poll/vote/add",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.votePoll as express.RequestHandler
  )
  .put(
    "/poll/vote/update",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.updateVote as express.RequestHandler
  );

// Reaction Routes
router
  .post(
    "/reaction/add",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.addReaction as express.RequestHandler
  )
  .delete(
    "/reaction/remove",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.removeReaction as express.RequestHandler
  );

// Comment Routes
router
  .post(
    "/comment/:post_id",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.createComment as express.RequestHandler
  )
  .post(
    "/reply/:comment_id",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.createReplyComment as express.RequestHandler
  )
  .put(
    "/comment/:comment_id",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.updateComment as express.RequestHandler
  )
  .delete(
    "/comment/:comment_id",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.deleteComment as express.RequestHandler
  )
  .get(
    "/post/comments/:post_id",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.getPostComments as express.RequestHandler
  )
  .get(
    "/comment/replies/:comment_id",
    authenticateToken as express.RequestHandler,
    requireMentorOrStudent as express.RequestHandler,
    DiscussionController.getCommentReplies as express.RequestHandler
  );

export default router;
