import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Request, Response } from "express";
import pool from "../../config/database";
import { v4 as uuidv4 } from "uuid";

interface AuthenticatedRequest extends Request {
  user?: { user_id: string; user_type: string; email?: string };
}

interface Session {
  session_id: string;
  mentor_id: string;
  session_title: string;
  duration_mins: number;
  price: number;
  medium: "Online" | "Offline";
}

interface AvailabilityDetail {
  detail_id: string;
  availability_id: string;
  available_date: string;
  start_time: string;
  meeting_link: string | null;
  offline_address: string | null;
  status: "Available" | "Booked" | "Cancelled";
}

// Google OAuth2 Client
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Set up Google Calendar API
const calendar = google.calendar({ version: "v3", auth: oauth2Client });

export class MentorSessionController {
  // Generate a Google Meet link using Google Calendar API
  static async generateGoogleMeetLink(
    sessionTitle: string,
    startTime: string,
    endTime: string
  ): Promise<string> {
    try {
      oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      });

      // Create a calendar event with a Google Meet link
      const event = {
        summary: sessionTitle,
        start: {
          dateTime: startTime,
          timeZone: "UTC",
        },
        end: {
          dateTime: endTime,
          timeZone: "UTC",
        },
        conferenceData: {
          createRequest: {
            requestId: uuidv4(),
            conferenceSolutionKey: {
              type: "hangoutsMeet",
            },
          },
        },
      };

      const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
        conferenceDataVersion: 1,
      });

      // Return the Google Meet link
      return response.data.hangoutLink || "";
    } catch (error) {
      console.error("Error generating Google Meet link:", error);
      throw new Error("Failed to generate Google Meet link");
    }
  }

  // Create a session and add availability in one call
  static async createSessionWithAvailability(
    req: AuthenticatedRequest,
    res: Response
  ) {
    const { session_title, duration_mins, price, medium, availabilities } =
      req.body;
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    if (
      !session_title ||
      !duration_mins ||
      !price ||
      !medium ||
      !availabilities ||
      !Array.isArray(availabilities)
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Step 1: Fetch the mentor_id from the Mentors table using user_id
      const FIND_MENTOR = `
        SELECT mentor_id FROM Mentors WHERE user_id = ?
      `;
      const [mentorRows] = await connection.execute(FIND_MENTOR, [user_id]);
      const mentor = (mentorRows as { mentor_id: string }[])[0];

      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      const mentor_id = mentor.mentor_id;

      // Step 2: Create the session
      const session_id = uuidv4();
      const CREATE_SESSION = `
        INSERT INTO Sessions (session_id, mentor_id, session_title, duration_mins, price, medium)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      await connection.execute(CREATE_SESSION, [
        session_id,
        mentor_id,
        session_title,
        duration_mins,
        price,
        medium,
      ]);

      // Step 3: Add availability for the session
      const availabilityDetails: AvailabilityDetail[] = [];
      for (const availability of availabilities) {
        const { available_date, times, offline_address } = availability;

        if (!available_date || !times || !Array.isArray(times)) {
          throw new Error("Invalid availability data");
        }

        const availability_id = uuidv4();
        const CREATE_AVAILABILITY = `
          INSERT INTO Mentor_Availability (availability_id, session_id, available_date)
          VALUES (?, ?, ?)
        `;
        await connection.execute(CREATE_AVAILABILITY, [
          availability_id,
          session_id,
          available_date,
        ]);

        // Add time slots for the availability
        for (const time of times) {
          const detail_id = uuidv4();
          let meeting_link = null;

          // Generate Google Meet link for online sessions
          if (medium === "Online") {
            const startTime = new Date(
              `${available_date}T${time}:00Z`
            ).toISOString();
            const endTime = new Date(
              new Date(startTime).getTime() + duration_mins * 60000
            ).toISOString();

            meeting_link = await MentorSessionController.generateGoogleMeetLink(
              session_title,
              startTime,
              endTime
            );
          }

          const CREATE_AVAILABILITY_DETAIL = `
            INSERT INTO Availability_Details (detail_id, availability_id, start_time, meeting_link, offline_address, status)
            VALUES (?, ?, ?, ?, ?, ?)
          `;
          await connection.execute(CREATE_AVAILABILITY_DETAIL, [
            detail_id,
            availability_id,
            time,
            meeting_link,
            medium === "Offline" ? offline_address : null,
            "Available",
          ]);

          availabilityDetails.push({
            detail_id,
            availability_id,
            available_date,
            start_time: time,
            meeting_link,
            offline_address: medium === "Offline" ? offline_address : null,
            status: "Available",
          });
        }
      }

      await connection.commit();

      res.status(201).json({
        message: "Session and availability created successfully",
        session: {
          session_id,
          session_title,
          duration_mins,
          price,
          medium,
        },
        availabilityDetails,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Create session with availability error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }

  static async getSessionDetails(req: AuthenticatedRequest, res: Response) {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    try {
      // Step 1: Fetch the mentor_id from the Mentors table using user_id
      const FIND_MENTOR = `
            SELECT mentor_id FROM Mentors WHERE user_id = ?
          `;
      const [mentorRows] = await pool.execute(FIND_MENTOR, [user_id]);
      const mentor = (mentorRows as { mentor_id: string }[])[0];

      if (!mentor) {
        return res.status(404).json({ message: "Mentor not found" });
      }

      const mentor_id = mentor.mentor_id;

      // Step 2: Fetch all sessions for the mentor
      const GET_SESSIONS = `
            SELECT session_id, session_title, duration_mins, price, medium, created_at
            FROM Sessions
            WHERE mentor_id = ?
          `;
      const [sessionRows] = await pool.execute(GET_SESSIONS, [mentor_id]);
      const sessions = sessionRows as Session[];

      if (sessions.length === 0) {
        return res
          .status(404)
          .json({ message: "No sessions found for this mentor" });
      }

      // Step 3: Fetch availability details for each session
      const sessionsWithAvailability = await Promise.all(
        sessions.map(async (session) => {
          const GET_AVAILABILITY = `
                SELECT
                  a.available_date,
                  d.start_time,
                  d.meeting_link,
                  d.offline_address,
                  d.status
                FROM Mentor_Availability a
                INNER JOIN Availability_Details d ON a.availability_id = d.availability_id
                WHERE a.session_id = ?
                ORDER BY a.available_date, d.start_time
              `;
          const [availabilityRows] = await pool.execute(GET_AVAILABILITY, [
            session.session_id,
          ]);
          const availabilityDetails = availabilityRows as AvailabilityDetail[];

          const groupedAvailability: { [key: string]: AvailabilityDetail[] } =
            {};
          for (const detail of availabilityDetails) {
            const date = new Date(detail.available_date)
              .toISOString()
              .split("T")[0];
            if (!groupedAvailability[date]) {
              groupedAvailability[date] = [];
            }

            const availabilityDetail: any = {
              start_time: detail.start_time.slice(0, 5),
              status: detail.status,
            };

            if (session.medium === "Online") {
              availabilityDetail.meeting_link = detail.meeting_link;
            }

            if (session.medium === "Offline") {
              availabilityDetail.offline_address = detail.offline_address;
            }

            groupedAvailability[date].push(availabilityDetail);
          }

          return {
            session: {
              session_id: session.session_id,
              session_title: session.session_title,
              duration_mins: session.duration_mins,
              price: session.price,
              medium: session.medium,
            },
            availability: groupedAvailability,
          };
        })
      );

      res.status(200).json({
        message: "All sessions retrieved successfully",
        data: sessionsWithAvailability,
      });
    } catch (error) {
      console.error("Get all sessions error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  static async getPublicSessionDetails(req: Request, res: Response) {
    const { mentor_id } = req.params;

    if (!mentor_id) {
      return res.status(400).json({ message: "Mentor ID is required" });
    }

    try {
      // Step 1: Fetch all sessions for the specified mentor
      const GET_SESSIONS = `
        SELECT session_id, session_title, duration_mins, price, medium, created_at
        FROM Sessions
        WHERE mentor_id = ?
      `;
      const [sessionRows] = await pool.execute(GET_SESSIONS, [mentor_id]);
      const sessions = sessionRows as Session[];

      if (sessions.length === 0) {
        return res
          .status(404)
          .json({ message: "No sessions found for this mentor" });
      }

      // Step 2: Fetch availability details for each session
      const sessionsWithAvailability = await Promise.all(
        sessions.map(async (session) => {
          const GET_AVAILABILITY = `
            SELECT
              a.available_date,
              d.start_time,
              d.meeting_link,
              d.offline_address,
              d.status
            FROM Mentor_Availability a
            INNER JOIN Availability_Details d ON a.availability_id = d.availability_id
            WHERE a.session_id = ?
            ORDER BY a.available_date, d.start_time
          `;
          const [availabilityRows] = await pool.execute(GET_AVAILABILITY, [
            session.session_id,
          ]);
          const availabilityDetails = availabilityRows as AvailabilityDetail[];

          const groupedAvailability: { [key: string]: AvailabilityDetail[] } =
            {};
          for (const detail of availabilityDetails) {
            const date = new Date(detail.available_date)
              .toISOString()
              .split("T")[0];
            if (!groupedAvailability[date]) {
              groupedAvailability[date] = [];
            }

            const availabilityDetail: any = {
              start_time: detail.start_time.slice(0, 5),
              status: detail.status,
            };

            if (session.medium === "Online") {
              availabilityDetail.meeting_link = detail.meeting_link;
            }

            if (session.medium === "Offline") {
              availabilityDetail.offline_address = detail.offline_address;
            }

            groupedAvailability[date].push(availabilityDetail);
          }

          return {
            session: {
              session_id: session.session_id,
              session_title: session.session_title,
              duration_mins: session.duration_mins,
              price: session.price,
              medium: session.medium,
            },
            availability: groupedAvailability,
          };
        })
      );

      res.status(200).json({
        message: "All sessions retrieved successfully",
        data: sessionsWithAvailability,
      });
    } catch (error) {
      console.error("Get public session details error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }

  static async deleteSession(req: AuthenticatedRequest, res: Response) {
    const { session_id } = req.params; // Extract session_id from the URL
    const user_id = req.user?.user_id; // Extract user_id from the decoded JWT token

    if (!session_id) {
      return res.status(400).json({ message: "Session ID is required" });
    }

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Step 1: Fetch the mentor_id of the logged-in user
      const FIND_MENTOR = `
        SELECT mentor_id FROM Mentors WHERE user_id = ?
      `;
      const [mentorRows] = await connection.execute(FIND_MENTOR, [user_id]);
      const mentor = (mentorRows as { mentor_id: string }[])[0];

      if (!mentor) {
        await connection.rollback();
        return res.status(404).json({ message: "Mentor not found" });
      }

      const mentor_id = mentor.mentor_id;

      // Step 2: Verify that the session belongs to the logged-in mentor
      const VERIFY_SESSION = `
        SELECT mentor_id FROM Sessions WHERE session_id = ?
      `;
      const [sessionRows] = await connection.execute(VERIFY_SESSION, [
        session_id,
      ]);
      const session = (sessionRows as { mentor_id: string }[])[0];

      if (!session) {
        await connection.rollback();
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.mentor_id !== mentor_id) {
        await connection.rollback();
        return res.status(403).json({
          message: "Forbidden: You are not authorized to delete this session",
        });
      }

      // Step 3: Delete availability details associated with the session
      const DELETE_AVAILABILITY_DETAILS = `
        DELETE FROM Availability_Details
        WHERE availability_id IN (
          SELECT availability_id FROM Mentor_Availability WHERE session_id = ?
        )
      `;
      await connection.execute(DELETE_AVAILABILITY_DETAILS, [session_id]);

      // Step 4: Delete availability records associated with the session
      const DELETE_AVAILABILITY = `
        DELETE FROM Mentor_Availability
        WHERE session_id = ?
      `;
      await connection.execute(DELETE_AVAILABILITY, [session_id]);

      // Step 5: Delete the session
      const DELETE_SESSION = `
        DELETE FROM Sessions
        WHERE session_id = ?
      `;
      const [result] = await connection.execute(DELETE_SESSION, [session_id]);

      // Check if the session was deleted
      if ((result as any).affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Session not found" });
      }

      await connection.commit();

      res.status(200).json({ message: "Session deleted successfully" });
    } catch (error) {
      await connection.rollback();
      console.error("Delete session error:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      connection.release();
    }
  }
}
