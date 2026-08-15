/**
 * Attachment storage.
 *
 * Two drivers behind one interface, chosen by STORAGE_PROVIDER:
 *
 *   local (default)  files on the server's disk, under <cwd>/uploads/
 *   s3               any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO,
 *                    Backblaze B2, …) — required when running more than one
 *                    server, since local disk is not shared between them.
 *
 * The database stores only the storage key (a UUID filename), so switching
 * drivers needs no schema change — only moving the existing objects, which
 * `pnpm run storage:migrate` does.
 *
 * Files are always served through GET /api/files/:key, never through a public
 * bucket URL or a presigned link: that route checks that the caller belongs to
 * the organization and may see the underlying maintenance request. Making the
 * bucket public would bypass those checks, so keep it private.
 */

import path from "path";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export interface StorageDriver {
  readonly name: "local" | "s3";
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  /** Resolves to null when the object is missing. */
  getStream(key: string): Promise<Readable | null>;
  /** Missing objects are not an error. */
  delete(key: string): Promise<void>;
}

/** Rejects keys that could escape the storage root. */
function assertSafeKey(key: string): string {
  const safe = path.basename(key);
  if (!safe || safe !== key || safe === "." || safe === "..") {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return safe;
}

// ─── local disk ───────────────────────────────────────────────────────────────

const localDriver: StorageDriver = {
  name: "local",

  async put(key, body) {
    const safe = assertSafeKey(key);
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, safe), body);
  },

  async getStream(key) {
    const safe = assertSafeKey(key);
    const filePath = path.join(UPLOAD_DIR, safe);
    try {
      await fs.access(filePath);
    } catch {
      return null;
    }
    return createReadStream(filePath);
  },

  async delete(key) {
    try {
      await fs.unlink(path.join(UPLOAD_DIR, assertSafeKey(key)));
    } catch {
      // Already gone — nothing to do.
    }
  },
};

// ─── S3-compatible ────────────────────────────────────────────────────────────

export interface S3Config {
  bucket: string;
  region: string;
  /** Set for non-AWS providers (R2, MinIO, …). */
  endpoint?: string;
  forcePathStyle: boolean;
  prefix: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export function readS3Config(env: NodeJS.ProcessEnv = process.env): S3Config {
  const bucket = env["S3_BUCKET"];
  if (!bucket) {
    throw new Error("S3_BUCKET is required when STORAGE_PROVIDER=s3");
  }
  return {
    bucket,
    region: env["S3_REGION"] ?? "us-east-1",
    ...(env["S3_ENDPOINT"] ? { endpoint: env["S3_ENDPOINT"] } : {}),
    // Path-style addressing is what MinIO and most self-hosted gateways expect.
    forcePathStyle: env["S3_FORCE_PATH_STYLE"] === "1" || Boolean(env["S3_ENDPOINT"]),
    prefix: (env["S3_PREFIX"] ?? "").replace(/^\/+|\/+$/g, ""),
    ...(env["S3_ACCESS_KEY_ID"] ? { accessKeyId: env["S3_ACCESS_KEY_ID"] } : {}),
    ...(env["S3_SECRET_ACCESS_KEY"]
      ? { secretAccessKey: env["S3_SECRET_ACCESS_KEY"] }
      : {}),
  };
}

export function createS3Driver(config: S3Config): StorageDriver {
  // Imported lazily so a local-storage deployment never loads the AWS SDK.
  const clientPromise = import("@aws-sdk/client-s3").then((sdk) => ({
    sdk,
    client: new sdk.S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      ...(config.accessKeyId && config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }
        : {}),
    }),
  }));

  const objectKey = (key: string) =>
    config.prefix ? `${config.prefix}/${assertSafeKey(key)}` : assertSafeKey(key);

  return {
    name: "s3",

    async put(key, body, mimeType) {
      const { sdk, client } = await clientPromise;
      await client.send(
        new sdk.PutObjectCommand({
          Bucket: config.bucket,
          Key: objectKey(key),
          Body: body,
          ContentType: mimeType,
        }),
      );
    },

    async getStream(key) {
      const { sdk, client } = await clientPromise;
      try {
        const result = await client.send(
          new sdk.GetObjectCommand({
            Bucket: config.bucket,
            Key: objectKey(key),
          }),
        );
        return (result.Body as Readable | undefined) ?? null;
      } catch (err) {
        if (
          err instanceof Error &&
          (err.name === "NoSuchKey" || err.name === "NotFound")
        ) {
          return null;
        }
        throw err;
      }
    },

    async delete(key) {
      const { sdk, client } = await clientPromise;
      await client.send(
        new sdk.DeleteObjectCommand({
          Bucket: config.bucket,
          Key: objectKey(key),
        }),
      );
    },
  };
}

// ─── driver selection ─────────────────────────────────────────────────────────

let driver: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (driver) return driver;
  driver =
    process.env["STORAGE_PROVIDER"] === "s3"
      ? createS3Driver(readS3Config())
      : localDriver;
  return driver;
}

/** Test hook: swap the driver, or pass null to fall back to the env choice. */
export function setStorageDriver(next: StorageDriver | null): void {
  driver = next;
}

export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function saveStoredFile(
  key: string,
  body: Buffer,
  mimeType: string,
): Promise<void> {
  await getStorageDriver().put(key, body, mimeType);
}

export async function readStoredFile(key: string): Promise<Readable | null> {
  return getStorageDriver().getStream(key);
}

export async function deleteStoredFile(key: string): Promise<void> {
  await getStorageDriver().delete(key);
}

/** API URL for a stored file. Access control lives on that route. */
export function getFileUrl(key: string): string {
  return `/api/files/${path.basename(key)}`;
}
