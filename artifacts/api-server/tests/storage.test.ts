import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startFakeS3, type FakeS3 } from "./fake-s3";
import {
  createS3Driver,
  readS3Config,
  getStorageDriver,
  setStorageDriver,
  UPLOAD_DIR,
} from "../src/lib/storage";

async function collect(stream: NodeJS.ReadableStream | null): Promise<Buffer | null> {
  if (!stream) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("مشغّل التخزين المحلي", () => {
  afterAll(() => {
    setStorageDriver(null);
    rmSync(UPLOAD_DIR, { recursive: true, force: true });
  });

  it("يكتب ويقرأ ويحذف الملف", async () => {
    setStorageDriver(null);
    const driver = getStorageDriver();
    expect(driver.name).toBe("local");

    await driver.put("sample.png", Buffer.from("hello"), "image/png");
    expect(existsSync(path.join(UPLOAD_DIR, "sample.png"))).toBe(true);

    const body = await collect(await driver.getStream("sample.png"));
    expect(body?.toString()).toBe("hello");

    await driver.delete("sample.png");
    expect(await driver.getStream("sample.png")).toBeNull();
  });

  it("يعيد null للملف غير الموجود ولا يفشل عند حذفه", async () => {
    const driver = getStorageDriver();
    expect(await driver.getStream("missing.png")).toBeNull();
    await expect(driver.delete("missing.png")).resolves.toBeUndefined();
  });

  it("يرفض المفاتيح التي تحاول الخروج من مجلد التخزين", async () => {
    const driver = getStorageDriver();
    await expect(
      driver.put("../escape.png", Buffer.from("x"), "image/png"),
    ).rejects.toThrow(/Invalid storage key/);
    await expect(driver.getStream("nested/path.png")).rejects.toThrow(
      /Invalid storage key/,
    );
  });
});

describe("مشغّل التخزين S3", () => {
  let s3: FakeS3;

  beforeAll(async () => {
    s3 = await startFakeS3("mirfaq-test");
  });

  afterAll(async () => {
    await s3.close();
    setStorageDriver(null);
  });

  afterEach(() => {
    s3.objects.clear();
  });

  function driverFor(prefix?: string) {
    return createS3Driver({
      bucket: "mirfaq-test",
      region: "us-east-1",
      endpoint: s3.url,
      forcePathStyle: true,
      prefix: prefix ?? "",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    });
  }

  it("يرفع الملف بنوع المحتوى الصحيح ويسترجعه", async () => {
    const driver = driverFor();
    await driver.put("photo.jpg", Buffer.from("image-bytes"), "image/jpeg");

    expect(s3.objects.get("photo.jpg")?.contentType).toBe("image/jpeg");

    const body = await collect(await driver.getStream("photo.jpg"));
    expect(body?.toString()).toBe("image-bytes");
  });

  it("يطبّق البادئة على مفتاح الكائن", async () => {
    const driver = driverFor("mirfaq/attachments");
    await driver.put("photo.jpg", Buffer.from("x"), "image/jpeg");

    expect([...s3.objects.keys()]).toEqual(["mirfaq/attachments/photo.jpg"]);
    const body = await collect(await driver.getStream("photo.jpg"));
    expect(body?.toString()).toBe("x");
  });

  it("يعيد null للكائن غير الموجود", async () => {
    const driver = driverFor();
    expect(await driver.getStream("ghost.jpg")).toBeNull();
  });

  it("يحذف الكائن", async () => {
    const driver = driverFor();
    await driver.put("photo.jpg", Buffer.from("x"), "image/jpeg");
    await driver.delete("photo.jpg");
    expect(s3.objects.size).toBe(0);
  });
});

describe("قراءة إعدادات S3", () => {
  it("يتطلب اسم الحاوية", () => {
    expect(() => readS3Config({} as NodeJS.ProcessEnv)).toThrow(/S3_BUCKET/);
  });

  it("يفعّل نمط المسار تلقائيًا مع مزوّد غير AWS", () => {
    const config = readS3Config({
      S3_BUCKET: "b",
      S3_ENDPOINT: "http://minio:9000",
    } as NodeJS.ProcessEnv);
    expect(config.forcePathStyle).toBe(true);
    expect(config.region).toBe("us-east-1");
  });

  it("ينظّف الشرطات الزائدة من البادئة", () => {
    const config = readS3Config({
      S3_BUCKET: "b",
      S3_PREFIX: "/mirfaq/files/",
    } as NodeJS.ProcessEnv);
    expect(config.prefix).toBe("mirfaq/files");
  });
});
