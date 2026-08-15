/**
 * Creates a throwaway SQLite database for the test run and applies the
 * migrations to it. MIRFAQ_DB_URL is exported so the Prisma client picks up
 * the test database instead of the developer's local one.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dbDir: string;

export function setup() {
  dbDir = mkdtempSync(path.join(tmpdir(), "mirfaq-test-"));
  const dbUrl = `file:${path.join(dbDir, "test.db")}`;

  process.env["MIRFAQ_DB_URL"] = dbUrl;
  process.env["NODE_ENV"] = "test";
  process.env["PORT"] = process.env["PORT"] ?? "5099";
  process.env["DISABLE_PLAN_REMINDERS"] = "1";

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, MIRFAQ_DB_URL: dbUrl },
    stdio: "inherit",
  });
}

export function teardown() {
  if (dbDir) rmSync(dbDir, { recursive: true, force: true });
}
