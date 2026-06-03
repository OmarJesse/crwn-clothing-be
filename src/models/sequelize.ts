import { Sequelize } from "sequelize";

// Detect whether we're talking to a remote managed database. Render, Neon,
// Supabase, Heroku, etc. all require SSL and serve certificates that don't
// validate against the system CA bundle out of the box. Locally we connect
// to a plain Postgres on localhost without SSL.
const host = process.env.DB_HOST || "";
const isLocalHost = ["localhost", "127.0.0.1", ""].includes(host);
const useSsl = process.env.DB_SSL === "true" || (host && !isLocalHost);

const sequelize = new Sequelize({
  dialect: "postgres",
  host: process.env.DB_HOST,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  logging: process.env.NODE_ENV === "production" ? false : console.log,
  dialectOptions: useSsl
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : undefined,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

export default sequelize;
