import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: process.env.DB_PASSWORD,
  database: "beforeproject",
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 10000,
  timezone: "utc",
});

export default pool;
