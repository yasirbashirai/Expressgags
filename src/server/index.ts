/** Starts the Express Bags API. `npm run api:dev` (watch) or `tsx src/server/index.ts`. */
import { app } from "./app";
import { env } from "./lib/env";

app.listen(env.port, () => {
  console.info(`[api] Express Bags API listening on http://localhost:${env.port}`);
});
