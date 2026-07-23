import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const defaultDatabasePath = path.join(serverRoot, ".data", "mirfaq-local.db");

function toPrismaFileUrl(filePath) {
  return `file:${path.resolve(filePath).replaceAll("\\", "/")}`;
}

function resolveDatabaseUrl(rawUrl) {
  if (!rawUrl) {
    return toPrismaFileUrl(defaultDatabasePath);
  }

  if (!rawUrl.startsWith("file:") || rawUrl === "file::memory:") {
    return rawUrl;
  }

  const configuredPath = rawUrl.slice("file:".length);
  const windowsAbsolutePath = /^[A-Za-z]:[\\/]/.test(configuredPath);
  const absolutePath =
    path.isAbsolute(configuredPath) || windowsAbsolutePath
      ? configuredPath
      : path.resolve(serverRoot, configuredPath);

  return toPrismaFileUrl(absolutePath);
}

async function runNodeModule(modulePath, args, env) {
  const child = spawn(process.execPath, [modulePath, ...args], {
    cwd: serverRoot,
    env,
    stdio: "inherit",
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Command stopped by signal ${signal}`));
        return;
      }

      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}`);
  }
}

const databaseUrl = resolveDatabaseUrl(process.env.MIRFAQ_DB_URL);
const env = {
  ...process.env,
  MIRFAQ_DB_URL: databaseUrl,
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || "5000",
};
// Prisma's Windows schema engine can exit before its first RPC message when
// the inherited Rust filter is unset or incompatible. Keep this child process
// deterministic without changing the API server's own environment.
const prismaEnv = { ...env, RUST_LOG: "info" };

const isFileDatabase =
  databaseUrl.startsWith("file:") && databaseUrl !== "file::memory:";

if (isFileDatabase) {
  const databasePath = databaseUrl.slice("file:".length);
  await mkdir(path.dirname(databasePath), { recursive: true });
}

const prismaCli = require.resolve("prisma/build/index.js");
const tsxCli = require.resolve("tsx/cli");

console.log(
  isFileDatabase
    ? `[mirfaq] SQLite: ${databaseUrl}`
    : "[mirfaq] Database: configured MIRFAQ_DB_URL",
);
console.log("[mirfaq] Preparing database schema...");
await runNodeModule(
  prismaCli,
  ["db", "push", "--schema", "prisma/schema.prisma"],
  prismaEnv,
);

console.log("[mirfaq] Seeding demo data...");
await runNodeModule(tsxCli, ["prisma/seed.ts"], env);

if (!process.argv.includes("--prepare-only")) {
  console.log(`[mirfaq] Starting API on port ${env.PORT}...`);
  await runNodeModule(tsxCli, ["watch", "src/index.ts"], env);
}
