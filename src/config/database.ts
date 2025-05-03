import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "localhost",
  // host: "host.docker.internal",
  user: "root",
  password: "",
  // password: "my-secret-pw",
  database: "beforeproject",
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 10000,
  timezone: "utc",
});

export default pool;

// ------------------------- for docker

// import mysql from "mysql2/promise";

// const pool = mysql.createPool({
//   host: process.env.DB_HOST || "localhost",
//   user: process.env.DB_USER || "root",
//   password: process.env.DB_PASSWORD || "",
//   database: process.env.DB_NAME || "beforeproject",
//   port: parseInt(process.env.DB_PORT || "3306"),
//   connectionLimit: 10,
//   waitForConnections: true,
//   queueLimit: 0,
//   connectTimeout: 10000,
//   timezone: "utc",
// });

// export default pool;
