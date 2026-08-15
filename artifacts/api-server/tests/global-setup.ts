/**
 * Prepares a throwaway database for the test run and applies the migrations.
 *
 * By default the tests use a temporary SQLite file so `pnpm run test` needs no
 * services. Set TEST_DATABASE_URL to a PostgreSQL URL to run the same suite
 * against PostgreSQL:
 *
 *   TEST_DATABASE_URL="postgresql://…/mirfaq_test" pnpm run test
 *
 * With PostgreSQL the schema is dropped and recreated before the run, so point
 * it at a scratch database — never at one holding real data.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dbDir: string | undefined;

function isPostgres(url: string) {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

export function setup() {
  const configured = process.env["TEST_DATABASE_URL"];
  let dbUrl: string;

  if (configured && isPostgres(configured)) {
    dbUrl = configured;
  } else {
    dbDir = mkdtempSync(path.join(tmpdir(), "mirfaq-test-"));
    dbUrl = `file:${path.join(dbDir, "test.db")}`;
  }

  process.env["MIRFAQ_DB_URL"] = dbUrl;
  process.env["NODE_ENV"] = "test";
  process.env["PORT"] = process.env["PORT"] ?? "5099";
  process.env["DISABLE_PLAN_REMINDERS"] = "1";

  const env = { ...process.env, MIRFAQ_DB_URL: dbUrl };

  if (isPostgres(dbUrl)) {
    // A fresh schema keeps runs independent of whatever the last one left.
    execFileSync(
      "node",
      ["./scripts/prisma-schema.mjs", "db", "execute", "--stdin"],
      {
        env,
        input: 'DROP SCHEMA IF EXISTS "public" CASCADE; CREATE SCHEMA "public";',
        stdio: ["pipe", "inherit", "inherit"],
      },
    );
  }

  execFileSync("node", ["./scripts/prisma-schema.mjs", "migrate", "deploy"], {
    env,
    stdio: "inherit",
  });
  execFileSync("node", ["./scripts/prisma-schema.mjs", "generate"], {
    env,
    stdio: "inherit",
  });
}

export function teardown() {
  if (dbDir) rmSync(dbDir, { recursive: true, force: true });
}
