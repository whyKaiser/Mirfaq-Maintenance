/**
 * Covers the single-process production mode (SERVE_CLIENT=1): the API keeps
 * answering as JSON while client routes fall back to the SPA shell.
 *
 * app.ts reads SERVE_CLIENT at import time, so each mode is exercised in a
 * fresh module registry via vi.resetModules().
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import type { Express } from "express";

const ORIGINAL_ENV = { ...process.env };

function buildFakeClient(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mirfaq-client-"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>مِرفق</title>");
  writeFileSync(path.join(dir, "sw.js"), "// service worker");
  mkdirSync(path.join(dir, "assets"));
  writeFileSync(path.join(dir, "assets", "index-abc123.js"), "console.log(1)");
  return dir;
}

async function loadApp(): Promise<Express> {
  vi.resetModules();
  const mod = await import("../src/app");
  return mod.default;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("تقديم الواجهة من خادم واحد", () => {
  it("لا يقدّم الواجهة عندما يكون SERVE_CLIENT معطّلًا", async () => {
    delete process.env["SERVE_CLIENT"];
    const app = await loadApp();

    const res = await request(app).get("/manager");
    expect(res.status).toBe(404);
  });

  it("يفشل بوضوح إذا فُعّل التقديم بدون واجهة مبنية", async () => {
    process.env["SERVE_CLIENT"] = "1";
    process.env["CLIENT_DIST_PATH"] = path.join(tmpdir(), "mirfaq-not-built");
    await expect(loadApp()).rejects.toThrow(/no built client/);
  });

  describe("عند تفعيله", () => {
    let dir: string;

    async function appWithClient() {
      dir = buildFakeClient();
      process.env["SERVE_CLIENT"] = "1";
      process.env["CLIENT_DIST_PATH"] = dir;
      return loadApp();
    }

    afterEach(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it("يعيد صفحة التطبيق لمسارات الواجهة", async () => {
      const app = await appWithClient();

      for (const route of ["/", "/manager", "/report/abc123"]) {
        const res = await request(app).get(route);
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toContain("text/html");
        expect(res.headers["cache-control"]).toBe("no-cache");
      }
    });

    it("يخزّن أصول البناء طويلًا ولا يخزّن عامل الخدمة", async () => {
      const app = await appWithClient();

      const asset = await request(app).get("/assets/index-abc123.js");
      expect(asset.status).toBe(200);
      expect(asset.headers["cache-control"]).toBe(
        "public, max-age=31536000, immutable",
      );

      const sw = await request(app).get("/sw.js");
      expect(sw.status).toBe(200);
      expect(sw.headers["cache-control"]).toBe("no-cache");
    });

    it("يبقي مسارات API تُجيب بـ JSON لا بصفحة التطبيق", async () => {
      const app = await appWithClient();

      const health = await request(app).get("/api/healthz");
      expect(health.status).toBe(200);
      expect(health.body).toEqual({ status: "ok" });

      const missing = await request(app).get("/api/no-such-route");
      expect(missing.status).toBe(404);
      expect(missing.headers["content-type"]).toContain("application/json");
      expect(missing.body.error).toBe("المسار غير موجود");
    });

    it("يحمي المسارات المحمية بدل إعادة صفحة التطبيق", async () => {
      const app = await appWithClient();
      const res = await request(app).get("/api/requests");
      expect(res.status).toBe(401);
      expect(res.headers["content-type"]).toContain("application/json");
    });
  });
});
