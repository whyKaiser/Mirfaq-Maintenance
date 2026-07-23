/**
 * Storage Service Abstraction
 *
 * Current implementation: Local filesystem (development / demo only)
 * Files are stored in <project_root>/uploads/<filename>
 *
 * ── How to replace with S3-compatible storage ──────────────────────────────
 *  1. npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 *  2. Add env vars: STORAGE_PROVIDER=s3, AWS_BUCKET, AWS_REGION,
 *     AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, CDN_BASE_URL (optional)
 *  3. Replace saveFile() body with:
 *       const client = new S3Client({ region: process.env.AWS_REGION });
 *       await client.send(new PutObjectCommand({
 *         Bucket: process.env.AWS_BUCKET, Key: filename,
 *         Body: buffer, ContentType: mimeType,
 *       }));
 *  4. Replace deleteFile() body with DeleteObjectCommand
 *  5. Replace getFileUrl() with a presigned GetObject URL or CDN URL
 *
 * The database stores only the filename (the "storage key").
 * The rest of the application is unchanged.
 * ───────────────────────────────────────────────────────────────────────────
 */

import path from "path";
import fs from "fs/promises";

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

/**
 * Delete a stored file by its filename.
 * Silently ignores missing files.
 */
export async function deleteStoredFile(filename: string): Promise<void> {
  try {
    await fs.unlink(path.join(UPLOAD_DIR, path.basename(filename)));
  } catch {
    // Ignore if file is already gone
  }
}

/**
 * Returns the API URL for serving a stored file.
 * Used when embedding attachment URLs in API responses.
 */
export function getFileUrl(filename: string): string {
  return `/api/files/${path.basename(filename)}`;
}
