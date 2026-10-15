/**
 * Express application (exported for supertest). Start the server with src/server/index.ts.
 */
import "./lib/env";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorMiddleware } from "./lib/errors";
import { csrfGuard, globalRequestLimiter, globalWriteLimiter, originAllowed } from "./lib/security";
import { adminRouter } from "./routes/admin";
import { publicRouter } from "./routes/public";
import { platformModules } from "./modules";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  // CORP same-site: the website (www.express-bags.com) may embed private, cookie-authorized media
  // served by the API (api.express-bags.com — deploy the API on a subdomain of the same site).
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, originAllowed(origin)),
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    }),
  );
  app.use(cookieParser());
  // CSRF: state-changing requests must come from an allowed browser origin (lib/security.ts)
  app.use(csrfGuard);
  app.use(globalRequestLimiter, globalWriteLimiter);
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
