// import { Request, Response } from "express";
// import pool from "../../config/database";
// import { v4 as uuidv4 } from "uuid";

// // Extend Request type to include user from JWT
// interface AuthenticatedRequest extends Request {
//   user?: { user_id: string; user_type: string; email?: string };
// }

// export class MentorApprovalController {
//   static async getUnapprovedMentors(req: AuthenticatedRequest, res: Response) {
//     try {
//       const user = req.user;
//       if (!user || user.user_type !== "Admin") {
//         return res
//           .status(403)
//           .json({ message: "Unauthorized: Admin access required" });
//       }

//       const FIND_UNAPPROVED_MENTORS = `
//         SELECT 
//           m.mentor_id, u.user_id, u.name, u.email, u.username, u.gender,
//           m.bio, m.social_link, m.image_url
//         FROM Users u
//         JOIN Mentors m ON u.user_id = m.user_id
//         WHERE m.is_approved = FALSE
//       `;
//       const [mentors] = await pool.execute(FIND_UNAPPROVED_MENTORS);

//       const formattedMentors = (mentors as any[]).map((mentor) => ({
//         ...mentor,
//         image_url: mentor.image_url
//           ? mentor.image_url.toString("base64")
//           : null,
//       }));

//       res.status(200).json(formattedMentors);
//     } catch (error) {
//       console.error("Get unapproved mentors error:", error);
//       res
//         .status(500)
//         .json({ message: "Server error", error: (error as any).message });
//     }
//   }

//   static async updateMentorApproval(req: AuthenticatedRequest, res: Response) {
//     try {
//       const user = req.user;
//       if (!user || user.user_type !== "Admin") {
//         return res
//           .status(403)
//           .json({ message: "Unauthorized: Admin access required" });
//       }

//       const { mentor_id, action } = req.body;
//       const admin_id = user.user_id;

//       if (!mentor_id || !action) {
//         return res.status(400).json({ message: "Missing mentor_id or action" });
//       }

//       if (!["Approved", "Rejected"].includes(action)) {
//         return res
//           .status(400)
//           .json({ message: "Action must be 'Approved' or 'Rejected'" });
//       }

//       const CHECK_MENTOR = `
//         SELECT user_id, is_approved
//         FROM Mentors
//         WHERE mentor_id = ?
//       `;
//       const [mentorRows] = await pool.execute(CHECK_MENTOR, [mentor_id]);
//       const mentor = (
//         mentorRows as { user_id: string; is_approved: boolean }[]
//       )[0];

//       if (!mentor) {
//         return res.status(404).json({ message: "Mentor not found" });
//       }

//       if (action === "Approved" && mentor.is_approved) {
//         return res.status(400).json({ message: "Mentor already approved" });
//       }
//       if (action === "Rejected" && !mentor.is_approved) {
//         return res.status(400).json({ message: "Mentor already not approved" });
//       }

//       const UPDATE_MENTOR = `
//         UPDATE Mentors
//         SET is_approved = ?
//         WHERE mentor_id = ?
//       `;
//       const isApproved = action === "Approved" ? true : false;
//       const [updateResult] = await pool.execute(UPDATE_MENTOR, [
//         isApproved,
//         mentor_id,
//       ]);

//       if ((updateResult as any).affectedRows === 0) {
//         return res
//           .status(500)
//           .json({ message: "Failed to update mentor status" });
//       }

//       const history_id = uuidv4();
//       const LOG_APPROVAL = `
//         INSERT INTO Mentor_Approval_History (history_id, mentor_id, admin_id, action)
//         VALUES (?, ?, ?, ?)
//       `;
//       await pool.execute(LOG_APPROVAL, [
//         history_id,
//         mentor_id,
//         admin_id,
//         action,
//       ]);

//       res
//         .status(200)
//         .json({ message: `Mentor ${action.toLowerCase()} successfully` });
//     } catch (error) {
//       console.error("Update mentor approval error:", error);
//       res
//         .status(500)
//         .json({ message: "Server error", error: (error as any).message });
//     }
//   }
// }
