import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts", "apps/web/**/*.test.ts"],
    exclude: ["**/node_modules/**", "tests/e2e/**"],
    environment: "node",
    setupFiles: ["./tests/setup-unit.ts"],
    testTimeout: 20_000,
  },
});
