import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const PgStore = connectPg(session);

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Trust first proxy (Replit reverse proxy / Vite dev proxy)
app.set("trust proxy", 1);

app.use(cors({
  origin: true,       // reflect request origin
  credentials: true,  // allow cookies
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Session ────────────────────────────────────────────────────────────────
app.use(
  session({
    store: new PgStore({
      pool,
      tableName: "session",
      // Table is created via DB migration — createTableIfMissing is
      // unreliable in bundled (esbuild) output because connect-pg-simple
      // reads its SQL file with a relative fs path that breaks after bundling.
    }),
    secret: (() => {
      const s = process.env["SESSION_SECRET"];
      if (!s) throw new Error("SESSION_SECRET env var is required but not set.");
      return s;
    })(),
    resave: false,
    saveUninitialized: false,
    name: "gyd_sid",
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  }),
);

app.use("/api", router);

export default app;
