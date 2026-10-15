/**
 * Express application (exported for supertest). Start the server with src/server/index.ts.
 */
import "./lib/env";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./lib/env";
import { errorMiddleware } from "./lib/errors";
import { adminRouter } from "./routes/admin";
import { publicRouter } from "./routes/public";
import { platformModules } from "./modules";

/** Allowed browser origins: WEB_ORIGIN list + local dev ports 3000–3499. */
function originAllowed(origin: string | undefined) {
  if (!origin) return true; // server-to-server, curl
  if (env.webOrigins.includes(origin)) return true;
  if (!/^http:\/\/(localhost|127\.0\.0\.1):3[0-4]\d\d$/.test(origin)) return false;
  return env.nodeEnv !== "production";
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, originAllowed(origin)),
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    }),
  );
  app.use(cookieParser());
  // Provider webhooks need the raw body (signature verification) → mounted before the JSON parser
  for (const m of platformModules) for (const r of m.routes) if (r.scope === "webhook") app.use(`/v1${r.path}`, r.router);
  // JSON only for non-multipart routes; multipart endpoints read the raw stream themselves
  app.use((req, res, next) => (req.is("multipart/form-data") ? next() : express.json({ limit: "1mb" })(req, res, next)));

  app.use("/v1", publicRouter);
  app.use("/v1/admin", adminRouter);
  for (const m of platformModules) {
    for (const r of m.routes) {
      if (r.scope === "admin") app.use(`/v1/admin${r.path}`, r.router);
      else if (r.scope === "public") app.use(`/v1${r.path}`, r.router);
    }
  }
  app.use((_req, res) => res.status(404).json({ ok: false, error: "Not found." }));
  app.use(errorMiddleware);
  return app;
}

export const app = createApp();
