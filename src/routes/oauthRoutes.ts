// import express, { Request, Response } from "express";
// import { OAuth2Client } from "google-auth-library";

// const router = express.Router();

// const oauth2Client = new OAuth2Client(
//   process.env.GOOGLE_CLIENT_ID,
//   process.env.GOOGLE_CLIENT_SECRET,
//   process.env.GOOGLE_REDIRECT_URI
// );

// // Step 1: Generate Authorization URL
// router.get("/auth/google", (req: Request, res: Response) => {
//   const authUrl = oauth2Client.generateAuthUrl({
//     access_type: "offline",
//     scope: ["https://www.googleapis.com/auth/calendar"],
//   });

//   res.redirect(authUrl);
// });

// // Step 2: Handle Callback and Exchange Code for Tokens
// router.get("/auth/google/callback", async (req: Request, res: Response) => {
//   const { code } = req.query;

//   if (!code) {
//     res.status(400).json({ message: "Authorization code is missing" });
//     return;
//   }

//   try {
//     // Exchange the code for tokens
//     const { tokens } = await oauth2Client.getToken(code as string);
//     console.log("Tokens:", tokens);

//     // Save the refresh token to .env or a secure storage
//     if (tokens.refresh_token) {
//       console.log("Refresh Token:", tokens.refresh_token);
//       res.json({
//         message: "Refresh token generated successfully",
//         refresh_token: tokens.refresh_token,
//       });
//     } else {
//       res.json({
//         message:
//           "No refresh token returned. Make sure to request offline access.",
//       });
//     }
//   } catch (error) {
//     console.error("Error exchanging code for tokens:", error);
//     res.status(500).json({ message: "Failed to generate refresh token" });
//   }
// });

// export default router;
