/**
 * Runs a prisma command against the schema that matches MIRFAQ_DB_URL.
 *
 * SQLite and PostgreSQL need different `datasource` providers, and Prisma has
 * no way to switch that at runtime — so the URL decides which schema file the
 * CLI is pointed at. Application code is unaffected: the generated client API
 * is identical for both.
 *
 * Usage: node ./scripts/prisma-schema.mjs <prisma-args…>
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const url = process.env["MIRFAQ_DB_URL"] ?? "";
const isPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://");

if (isPostgres) {
  // Keep the generated PostgreSQL schema in step with the canonical one.
  const sync = spawnSync(
    process.execPath,
    [path.join(serverRoot, "scripts", "sync-postgres-schema.mjs")],
    { cwd: serverRoot, stdio: "inherit" },
  );
  if (sync.status !== 0) process.exit(sync.status ?? 1);
}

const schema = isPostgres
  ? path.join(serverRoot, "prisma", "postgres", "schema.prisma")
  : path.join(serverRoot, "prisma", "schema.prisma");

const result = spawnSync(
  "pnpm",
  ["exec", "prisma", ...process.argv.slice(2), "--schema", schema],
  { cwd: serverRoot, stdio: "inherit", env: process.env },
);

process.exit(result.status ?? 1);
