import { createHash } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { prisma } from "../lib/prisma";
import { notify, organizationManagerIds } from "../lib/notify";

const router = Router();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_RATE_BUCKETS = 10_000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();
let lastCleanupAt = 0;

function cleanupRateBuckets(now: number, force = false) {
  if (!force && now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }

  while (rateBuckets.size >= MAX_RATE_BUCKETS) {
    const oldestKey = rateBuckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    rateBuckets.delete(oldestKey);
  }
}

function setBoundedBucket(key: string, bucket: RateBucket, now: number) {
  if (!rateBuckets.has(key) && rateBuckets.size >= MAX_RATE_BUCKETS) {
    cleanupRateBuckets(now, true);
  }
  rateBuckets.set(key, bucket);
}

function rateLimit(limit: number, scope: "ip" | "token-ip"): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    cleanupRateBuckets(now);

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const tokenDigest = createHash("sha256")
      .update(req.params.token ?? "")
      .digest("base64url");
    const key =
      scope === "ip"
        ? `ip:${req.method}:${ip}`
        : `token-ip:${req.method}:${ip}:${tokenDigest}`;
    const existing = rateBuckets.get(key);
    const bucket =
      !existing || existing.resetAt <= now
        ? { count: 0, resetAt: now + WINDOW_MS }
        : existing;

    bucket.count += 1;
    setBoundedBucket(key, bucket, now);

    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(0, limit - bucket.count)),
    );
    res.setHeader(
      "X-RateLimit-Reset",
      String(Math.ceil(bucket.resetAt / 1000)),
    );
    res.setHeader("X-RateLimit-Scope", scope);

    if (bucket.count > limit) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil((bucket.resetAt - now) / 1000)),
      );
      res.status(429).json({ error: "طلبات كثيرة، حاول لاحقًا" });
      return;
    }

    next();
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const publicUnitInclude = {
  property: {
    select: {
      name: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
  },
} as const;

// GET /api/public/units/:token
router.get(
  "/public/units/:token",
  rateLimit(120, "ip"),
  rateLimit(60, "token-ip"),
  async (req, res) => {
    try {
      const unit = await prisma.unit.findUnique({
        where: { publicToken: req.params.token },
        include: publicUnitInclude,
      });
      if (!unit) {
        return res.status(404).json({ error: "الوحدة غير موجودة" });
      }

      res.json({
        orgName: unit.property.organization.name,
        propertyName: unit.property.name,
        unitId: unit.id,
        unitNumber: unit.number,
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "خطأ في الخادم" });
    }
  },
);

// POST /api/public/units/:token/requests
router.post(
  "/public/units/:token/requests",
  rateLimit(30, "ip"),
  rateLimit(10, "token-ip"),
  async (req, res) => {
    try {
      if (!isRecord(req.body)) {
        return res.status(400).json({ error: "بيانات البلاغ غير صالحة" });
      }

      const unit = await prisma.unit.findUnique({
        where: { publicToken: req.params.token },
        include: publicUnitInclude,
      });
      if (!unit) {
        return res.status(404).json({ error: "الوحدة غير موجودة" });
      }
      if (!unit.residentId) {
        return res
          .status(409)
          .json({ error: "لا يوجد ساكن مرتبط بهذه الوحدة" });
      }

      const { name, phone, title, description, category, priority } =
        req.body as {
          name?: unknown;
          phone?: unknown;
          title?: unknown;
          description?: unknown;
          category?: unknown;
          priority?: unknown;
        };

      if (
        typeof name !== "string" ||
        typeof phone !== "string" ||
        typeof title !== "string" ||
        typeof description !== "string" ||
        typeof category !== "string" ||
        typeof priority !== "string"
      ) {
        return res.status(400).json({ error: "جميع الحقول مطلوبة" });
      }

      const cleanName = name.trim();
      const cleanPhone = phone.trim();
      const cleanTitle = title.trim();
      const cleanDescription = description.trim();
      const cleanCategory = category.trim();
      const cleanPriority = priority.trim();
      const categories = new Set(["كهرباء", "سباكة", "تكييف", "أخرى"]);
      const priorities = new Set(["عاجل", "عادي"]);

      if (cleanName.length < 2 || cleanName.length > 100) {
        return res.status(400).json({ error: "الاسم غير صالح" });
      }
      if (!/^[+\d\s()-]{7,25}$/.test(cleanPhone)) {
        return res.status(400).json({ error: "رقم الجوال غير صالح" });
      }
      if (cleanTitle.length < 3 || cleanTitle.length > 160) {
        return res.status(400).json({ error: "عنوان البلاغ غير صالح" });
      }
      if (cleanDescription.length < 10 || cleanDescription.length > 3000) {
        return res.status(400).json({ error: "وصف البلاغ غير صالح" });
      }
      if (!categories.has(cleanCategory)) {
        return res.status(400).json({ error: "تصنيف البلاغ غير صالح" });
      }
      if (!priorities.has(cleanPriority)) {
        return res.status(400).json({ error: "أولوية البلاغ غير صالحة" });
      }

      const request = await prisma.maintenanceRequest.create({
        data: {
          title: cleanTitle,
          description: cleanDescription,
          category: cleanCategory,
          priority: cleanPriority,
          status: "معلّقة",
          propertyId: unit.propertyId,
          unitId: unit.id,
          residentId: unit.residentId,
          organizationId: unit.property.organizationId,
          reporterName: cleanName,
          reporterPhone: cleanPhone,
        },
      });

      await notify({
        organizationId: unit.property.organizationId,
        userIds: await organizationManagerIds(unit.property.organizationId),
        type: "request_created",
        title: `بلاغ جديد عبر QR: ${request.title}`,
        body: `${unit.property.name} — وحدة ${unit.number} · مُبلّغ: ${cleanName}`,
        entityType: "request",
        entityId: request.id,
      });

      res.status(201).json({
        id: request.id,
        title: request.title,
        status: request.status,
        propertyName: unit.property.name,
        unitNumber: unit.number,
        createdAt: request.createdAt.toISOString(),
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "خطأ في الخادم" });
    }
  },
);

export default router;
