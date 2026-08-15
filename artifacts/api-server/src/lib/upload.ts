/**
 * Multer configuration for multipart/form-data uploads.
 * Accepts JPEG, PNG and WebP only; max 3 MB per file, max 3 files per request.
 *
 * Files are buffered in memory rather than written to disk, so the request
 * handler can hand the bytes to whichever storage driver is configured — local
 * disk or an S3-compatible bucket. At 3 MB × 3 files the memory cost is bounded
 * and small.
 */

import multer from "multer";
import crypto from "crypto";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/** Storage key for an uploaded file: a UUID plus the mime type's extension. */
export function buildStorageKey(mimeType: string): string {
  return `${crypto.randomUUID()}${EXTENSIONS[mimeType] ?? ".bin"}`;
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024, // 3 MB
    files: 3,
  },
  fileFilter(_req, file, cb) {
    if (file.mimetype in EXTENSIONS) {
      cb(null, true);
    } else {
      cb(new Error("نوع الملف غير مسموح. يُقبل JPEG و PNG و WebP فقط."));
    }
  },
});
