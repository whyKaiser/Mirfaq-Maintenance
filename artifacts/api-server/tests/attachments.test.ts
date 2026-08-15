import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import {
  createS3Driver,
  setStorageDriver,
  UPLOAD_DIR,
} from "../src/lib/storage";
import { startFakeS3, type FakeS3 } from "./fake-s3";
import { resetDatabase, seedFixture, loginAs, type Fixture } from "./helpers";

// A one-pixel PNG — real bytes, so the mime filter and size accounting behave
// the way they would with a genuine upload.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function createRequestFor(fx: Fixture) {
  const resident = await loginAs(fx.residentEmail);
  const created = await resident.post("/api/requests").send({
    title: "تسريب",
    description: "تسريب في الحمام",
    category: "سباكة",
    priority: "عادي",
    unitId: fx.unitId,
  });
  return { resident, requestId: created.body.id as string };
}

describe("المرفقات", () => {
  let fx: Fixture;

  beforeEach(async () => {
    await resetDatabase();
    fx = await seedFixture();
  });

  afterAll(async () => {
    setStorageDriver(null);
    rmSync(UPLOAD_DIR, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  describe("على التخزين المحلي", () => {
    beforeEach(() => setStorageDriver(null));

    it("يرفع الصورة ويقدّمها ثم يحذفها", async () => {
      const { resident, requestId } = await createRequestFor(fx);

      const uploaded = await resident
        .post(`/api/requests/${requestId}/attachments`)
        .field("attachmentType", "initial")
        .attach("images", PNG, "before.png");
      expect(uploaded.status).toBe(201);
      expect(uploaded.body).toHaveLength(1);

      const key = uploaded.body[0].url.replace("/api/files/", "");
      const served = await resident.get(`/api/files/${key}`);
      expect(served.status).toBe(200);
      expect(served.headers["content-type"]).toContain("image/png");
      expect(Buffer.from(served.body)).toEqual(PNG);

      const removed = await resident.delete(`/api/attachments/${uploaded.body[0].id}`);
      expect(removed.status).toBe(200);

      const gone = await resident.get(`/api/files/${key}`);
      expect(gone.status).toBe(404);
    });

    it("يرفض نوع ملف غير مسموح", async () => {
      const { resident, requestId } = await createRequestFor(fx);
      const res = await resident
        .post(`/api/requests/${requestId}/attachments`)
        .attach("images", Buffer.from("%PDF-1.4"), {
          filename: "doc.pdf",
          contentType: "application/pdf",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("غير مسموح");
    });

    it("يمنع تجاوز ثلاث صور من نفس النوع", async () => {
      const { resident, requestId } = await createRequestFor(fx);
      const ok = await resident
        .post(`/api/requests/${requestId}/attachments`)
        .field("attachmentType", "initial")
        .attach("images", PNG, "a.png")
        .attach("images", PNG, "b.png")
        .attach("images", PNG, "c.png");
      expect(ok.status).toBe(201);

      const tooMany = await resident
        .post(`/api/requests/${requestId}/attachments`)
        .field("attachmentType", "initial")
        .attach("images", PNG, "d.png");
      expect(tooMany.status).toBe(400);
    });

    it("يمنع مستخدم مؤسسة أخرى من قراءة الملف", async () => {
      const { resident, requestId } = await createRequestFor(fx);
      const uploaded = await resident
        .post(`/api/requests/${requestId}/attachments`)
        .attach("images", PNG, "before.png");
      const key = uploaded.body[0].url.replace("/api/files/", "");

      const other = await seedFixture("aamal", "b");
      const outsider = await loginAs(other.managerEmail);
      expect((await outsider.get(`/api/files/${key}`)).status).toBe(404);
    });

    it("يرفض اسم ملف يحاول الخروج من المجلد", async () => {
      const manager = await loginAs(fx.managerEmail);
      const res = await manager.get("/api/files/..%2F..%2Fetc%2Fpasswd");
      expect([400, 404]).toContain(res.status);
    });
  });

  describe("على تخزين S3", () => {
    let s3: FakeS3;

    beforeAll(async () => {
      s3 = await startFakeS3("mirfaq-attachments");
    });

    afterAll(async () => {
      await s3.close();
    });

    beforeEach(() => {
      s3.objects.clear();
      setStorageDriver(
        createS3Driver({
          bucket: "mirfaq-attachments",
          region: "us-east-1",
          endpoint: s3.url,
          forcePathStyle: true,
          prefix: "attachments",
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
        }),
      );
    });

    afterEach(() => setStorageDriver(null));

    it("يرفع إلى الحاوية ويقدّم الملف منها ثم يحذفه", async () => {
      const { resident, requestId } = await createRequestFor(fx);

      const uploaded = await resident
        .post(`/api/requests/${requestId}/attachments`)
        .field("attachmentType", "completion")
        .attach("images", PNG, "after.png");
      expect(uploaded.status).toBe(201);

      // The bytes went to the bucket, not to the server's disk.
      expect(s3.objects.size).toBe(1);
      expect([...s3.objects.keys()][0]).toMatch(/^attachments\//);

      const key = uploaded.body[0].url.replace("/api/files/", "");
      const served = await resident.get(`/api/files/${key}`);
      expect(served.status).toBe(200);
      expect(Buffer.from(served.body)).toEqual(PNG);

      await resident.delete(`/api/attachments/${uploaded.body[0].id}`);
      expect(s3.objects.size).toBe(0);
    });

    it("يعيد 404 إذا فُقد الكائن من الحاوية", async () => {
      const { resident, requestId } = await createRequestFor(fx);
      const uploaded = await resident
        .post(`/api/requests/${requestId}/attachments`)
        .attach("images", PNG, "after.png");
      const key = uploaded.body[0].url.replace("/api/files/", "");

      s3.objects.clear();

      const served = await resident.get(`/api/files/${key}`);
      expect(served.status).toBe(404);
    });
  });
});
