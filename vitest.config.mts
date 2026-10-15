import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Minimal shared Vitest config (unit + API tests). Path aliases mirror tsconfig.json.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/components\/(.*)$/, replacement: fileURLToPath(new URL("./components/$1", import.meta.url)) },
      { find: /^@\/(.*)$/, replacement: fileURLToPath(new URL("./src/$1", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules/**", ".next*/**", "dist/**"],
  },
});
