import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // "node" is the default so domain/application tests (the majority)
    // run without a DOM — matching docs/engineering-standards.md's
    // testing philosophy that domain logic must be testable without any
    // infrastructure, DOM included. Component test files opt into jsdom
    // individually via a `// @vitest-environment jsdom` docblock at the
    // top of the file, rather than paying the jsdom cost for every test.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
