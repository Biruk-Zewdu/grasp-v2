import { defineConfig } from "vitest/config";
import path from "node:path";

// Alias `server-only` to a noop so server modules can be imported in Node tests,
// and wire the `@/*` path alias used across the app.
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "test/empty.ts"),
      "@": path.resolve(__dirname),
    },
  },
  test: { environment: "node" },
});
