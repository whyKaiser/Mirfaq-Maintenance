import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", globalSetup: ["./tests/global-setup-existing-client.ts"], fileParallelism: false, include: ["tests/**/*.test.ts"], testTimeout: 20000 } });
