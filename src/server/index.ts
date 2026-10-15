/** Starts the Express Bags API. `npm run api:dev` (watch) or `tsx src/server/index.ts`. */
import { assertProductionConfig } from "./lib/security";
import { app } from "./app";
import { env } from "./lib/env";

// In production, refuse to start with missing or unsafe configuration (docs/SECURITY.md)
assertProductionConfig();

app.listen(env.port, () => {
  console.info(`[api] Express Bags API listening on http://localhost:${env.port}`);
});
