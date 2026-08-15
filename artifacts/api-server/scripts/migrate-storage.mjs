/**
 * Copies existing attachments from local disk into the configured S3 bucket.
 *
 * Run this once, before switching STORAGE_PROVIDER to s3, so files uploaded
 * while the app used local disk stay reachable:
 *
 *   MIRFAQ_DB_URL=…  S3_BUCKET=…  S3_REGION=…  \
 *   S3_ACCESS_KEY_ID=…  S3_SECRET_ACCESS_KEY=…  \
 *   node ./scripts/migrate-storage.mjs [--delete-local]
 *
 * The storage key in the database does not change, so no rows are touched.
 * Objects already present in the bucket are skipped, which makes re-running
 * safe after a partial failure. Local files are kept unless --delete-local is
 * passed — verify the app serves attachments from S3 before removing them.
 */

import { createRequire } from "node:module";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const uploadDir = path.join(serverRoot, "uploads");
const deleteLocal = process.argv.includes("--delete-local");

const bucket = process.env.S3_BUCKET;
if (!bucket) {
  console.error("S3_BUCKET is required");
  process.exit(1);
}

const prefix = (process.env.S3_PREFIX ?? "").replace(/^\/+|\/+$/g, "");
const client = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
  forcePathStyle:
    process.env.S3_FORCE_PATH_STYLE === "1" || Boolean(process.env.S3_ENDPOINT),
  ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

const objectKey = (key) => (prefix ? `${prefix}/${key}` : key);

async function alreadyUploaded(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey(key) }));
    return true;
  } catch {
    return false;
  }
}

const prisma = new PrismaClient();

try {
  const attachments = await prisma.requestAttachment.findMany({
    select: { id: true, filePath: true, mimeType: true },
  });
  console.log(`${attachments.length} attachment(s) to check`);

  let uploaded = 0;
  let skipped = 0;
  const missing = [];

  for (const attachment of attachments) {
    const key = path.basename(attachment.filePath);

    if (await alreadyUploaded(key)) {
      skipped += 1;
      continue;
    }

    let body;
    try {
      body = await readFile(path.join(uploadDir, key));
    } catch {
      missing.push(key);
      continue;
    }

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey(key),
        Body: body,
        ContentType: attachment.mimeType,
      }),
    );
    uploaded += 1;

    if (deleteLocal) {
      await unlink(path.join(uploadDir, key)).catch(() => {});
    }
  }

  console.log(`uploaded: ${uploaded}`);
  console.log(`already in bucket: ${skipped}`);
  if (missing.length > 0) {
    console.warn(`missing on local disk (${missing.length}):`);
    for (const key of missing) console.warn(`  ${key}`);
    console.warn("These rows point at files that are not on this server.");
  }
} finally {
  await prisma.$disconnect();
}
