import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.join(__dirname, "src"),
      // `server-only` throws outside a Next.js server build; tests run in plain Node.
      "server-only": path.join(__dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
