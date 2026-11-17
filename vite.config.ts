import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // The licenses of every library in the bundle (React, VexFlow, alphaTab...), served at /licenses.md.
    license: { fileName: "licenses.md" },
  },
  test: {
    environment: "node",
    // The browser tests in e2e/ run with Playwright (pnpm test:e2e), not Vitest.
    include: ["src/**/*.test.ts", "worker/**/*.test.ts"],
  },
});
