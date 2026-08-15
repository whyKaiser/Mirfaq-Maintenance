/**
 * Serving the built web client from the API server.
 *
 * In development the client runs under Vite on its own port and proxies /api
 * here, so this is disabled. In production one process serving both removes the
 * need for a second deployment or a reverse proxy in front of two services —
 * which is what most single-server installations want.
 *
 * Enabled when SERVE_CLIENT=1. CLIENT_DIST_PATH overrides where the built
 * client lives; the default matches the workspace layout.
 */

import path from "path";
import { existsSync } from "fs";
import express, { type Express } from "express";

const SPA_ENTRY = "index.html";

export function resolveClientDist(): string {
  const configured = process.env["CLIENT_DIST_PATH"];
  if (configured) return path.resolve(configured);
  // artifacts/api-server → artifacts/mirfaq/dist/public
  return path.resolve(process.cwd(), "..", "mirfaq", "dist", "public");
}

export function isClientServingEnabled(): boolean {
  return process.env["SERVE_CLIENT"] === "1";
}

/**
 * Mounts the static client. Call after the API router so /api always wins.
 * Returns the directory being served, or null when disabled or not built.
 */
export function mountClient(app: Express): string | null {
  if (!isClientServingEnabled()) return null;

  const distDir = resolveClientDist();
  if (!existsSync(path.join(distDir, SPA_ENTRY))) {
    throw new Error(
      `SERVE_CLIENT=1 but no built client at ${distDir}. Run "pnpm run build" or set CLIENT_DIST_PATH.`,
    );
  }

  // Hashed build output is immutable; index.html and the service worker must
  // not be cached, or clients keep booting a stale app after a deploy.
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        const name = path.basename(filePath);
        if (name === SPA_ENTRY || name === "sw.js") {
          res.setHeader("Cache-Control", "no-cache");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );

  // SPA fallback: client-side routes (/manager, /report/:token, …) are not
  // files on disk. Unknown /api paths must still 404 as JSON, not as HTML.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) {
      return next();
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(distDir, SPA_ENTRY));
  });

  return distDir;
}
