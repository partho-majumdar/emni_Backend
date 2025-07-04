import express from "express";
import dotenv from "dotenv";
import studentRoutes from "./routes/studentRoutes";
import mentorRoutes from "./routes/mentorRoutes";
import adminRoutes from "./routes/adminRoutes";
import sessionsRoutes from "./routes/sessionsRoutes";
import newsFeedRoutes from "./routes/newsFeedRoutes";
import groupSessionsRoutes from "./routes/groupsessionsRoutes";
import messageRoutes from "./routes/messageRoutes";
import { getAllInterests } from "./controllers/common/interestController";
import { AdminAuthController } from "./controllers/admin/authController";

dotenv.config({ path: "../.env" });
console.log(
  "JWT_SECRET loaded at startup:",
  process.env.JWT_SECRET || "default_secret"
);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use("/api/student", studentRoutes);
app.use("/api/mentor", mentorRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/sessions", sessionsRoutes);
app.use("/api/group-sessions", groupSessionsRoutes);
app.use("/api/news-feed", newsFeedRoutes);

app.get("/api/interests", getAllInterests);

app.use("/api/messages", messageRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
