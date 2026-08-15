/**
 * Derives prisma/postgres/schema.prisma from the canonical SQLite schema.
 *
 * The models are identical across both databases — only the datasource block
 * differs — so the PostgreSQL schema is generated instead of hand-maintained.
 * That makes drift between the two impossible: edit prisma/schema.prisma, then
 * run `pnpm run db:pg:sync`.
 *
 * Types that need a different PostgreSQL mapping are declared in TYPE_TWEAKS
 * below; today the shared model definitions map cleanly on both.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const source = path.join(serverRoot, "prisma", "schema.prisma");
const targetDir = path.join(serverRoot, "prisma", "postgres");
const target = path.join(targetDir, "schema.prisma");

const TYPE_TWEAKS = [];

const HEADER = `// GENERATED FILE — do not edit.
// Produced from prisma/schema.prisma by scripts/sync-postgres-schema.mjs.
// Edit the SQLite schema and run: pnpm run db:pg:sync
`;

const DATASOURCE = `datasource db {
  provider = "postgresql"
  url      = env("MIRFAQ_DB_URL")
}`;

// The generated client API is identical for both providers — only the query
// engine baked in at generate time differs — so both schemas emit to the
// default location and `db:generate` picks the schema matching MIRFAQ_DB_URL.
const GENERATOR = `generator client {
  provider = "prisma-client-js"
}`;

let schema = readFileSync(source, "utf8");

const datasourceBlock = /datasource db \{[^}]*\}/;
const generatorBlock = /generator client \{[^}]*\}/;
if (!datasourceBlock.test(schema) || !generatorBlock.test(schema)) {
  throw new Error("Could not locate the datasource/generator blocks in schema.prisma");
}

schema = schema.replace(datasourceBlock, DATASOURCE);
schema = schema.replace(generatorBlock, GENERATOR);
for (const [pattern, replacement] of TYPE_TWEAKS) {
  schema = schema.replace(pattern, replacement);
}

// Drop the SQLite-oriented file header; HEADER above replaces it.
schema = schema.replace(/^(?:\/\/[^\n]*\n|\s*\n)*(?=generator client)/, "");

mkdirSync(targetDir, { recursive: true });
writeFileSync(target, `${HEADER}\n${schema.trimStart()}`);
console.log(`wrote ${path.relative(serverRoot, target)}`);
