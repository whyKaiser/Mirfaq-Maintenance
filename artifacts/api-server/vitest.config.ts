import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    // The tests share one SQLite file, so they must not run concurrently.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
