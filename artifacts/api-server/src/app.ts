import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { mountClient } from "./lib/client-assets";

// Extend session type
import "./types/session.d";

const app: Express = express();
const isProduction = process.env["NODE_ENV"] === "production";
const sessionSecret = process.env["SESSION_SECRET"];

if (isProduction && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error("SESSION_SECRET must contain at least 32 characters in production");
}

const configuredOrigins = (process.env["APP_ORIGINS"] || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = isProduction
  ? configuredOrigins
  : [...configuredOrigins, "http://localhost:5173", "http://127.0.0.1:5173"];

// Trust proxy (Replit reverse proxy)
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// CORS: allow credentials from same origin (proxied via Replit)
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(
  session({
    secret: sessionSecret || "mirfaq-local-development-secret-only",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

app.use("/api", router);

// JSON error handler for the API. Four parameters, so Express registers it as
// an error handler rather than ordinary middleware.
app.use(
  "/api",
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    req.log?.error(err);
    if (res.headersSent) return;
    res.status(500).json({ error: "خطأ في الخادم" });
  },
);

// Optional: serve the built client from this process (SERVE_CLIENT=1).
// Mounted after the API router so /api always takes precedence.
const clientDir = mountClient(app);
if (clientDir) {
  logger.info({ clientDir }, "Serving web client");
}

export default app;
