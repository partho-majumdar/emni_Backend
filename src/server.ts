import express from "express";
import dotenv from "dotenv";
import studentRoutes from "./routes/studentRoutes";
import mentorRoutes from "./routes/mentorRoutes";
import adminRoutes from "./routes/adminRoutes";
import sessionsRoutes from "./routes/sessionsRoutes";
import groupSessionsRoutes from "./routes/groupsessionsRoutes";
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
app.use("/api/groupsessions", groupSessionsRoutes);

app.get("/api/interests", getAllInterests);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ------------------------- for docker

// import express from "express";
// import dotenv from "dotenv";
// import studentRoutes from "./routes/studentRoutes";
// import mentorRoutes from "./routes/mentorRoutes";
// import adminRoutes from "./routes/adminRoutes";
// import sessionsRoutes from "./routes/sessionsRoutes";
// import groupSessionsRoutes from "./routes/groupsessionsRoutes";
// import { getAllInterests } from "./controllers/common/interestController";
// import { AdminAuthController } from "./controllers/admin/authController";

// dotenv.config(); // Loads .env from project root
// console.log(
//   "JWT_SECRET loaded at startup:",
//   process.env.JWT_SECRET || "default_secret"
// );

// const app = express();
// const PORT = process.env.PORT || 3000;

// app.use(express.json());

// app.use("/api/student", studentRoutes);
// app.use("/api/mentor", mentorRoutes);
// app.use("/api/admin", adminRoutes);
// app.use("/api/sessions", sessionsRoutes);
// app.use("/api/groupsessions", groupSessionsRoutes);

// app.get("/api/interests", getAllInterests);

// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });
