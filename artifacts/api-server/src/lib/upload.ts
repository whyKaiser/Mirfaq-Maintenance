/**
 * Multer configuration for handling multipart/form-data file uploads.
 * Accepts JPEG, PNG, and WebP only; max 3 MB per file; max 3 files per request.
 */

import multer from "multer";
import path from "path";
import crypto from "crypto";
import { mkdirSync, existsSync } from "fs";
import { UPLOAD_DIR } from "./storage";

// Ensure uploads directory exists at startup
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(_req, file, cb) {
    const ext =
      file.mimetype === "image/jpeg" ? ".jpg" :
      file.mimetype === "image/png"  ? ".png" :
      ".webp";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 3 * 1024 * 1024, // 3 MB
    files: 3,
  },
  fileFilter(_req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("نوع الملف غير مسموح. يُقبل JPEG و PNG و WebP فقط."));
    }
  },
});
