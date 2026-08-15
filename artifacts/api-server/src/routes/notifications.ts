import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { NOTIFICATION_LABELS, type NotificationType } from "../lib/notify";

const router = Router();
const MAX_PAGE_SIZE = 100;

function fmtNotification(n: {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: n.id,
    type: n.type,
    typeLabel: NOTIFICATION_LABELS[n.type as NotificationType] ?? n.type,
    title: n.title,
    body: n.body,
    entityType: n.entityType,
    entityId: n.entityId,
    isRead: n.readAt !== null,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

// GET /api/notifications?unread=1&limit=30
router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const { unread, limit } = req.query as { unread?: string; limit?: string };
    const take = Math.min(
      Math.max(parseInt(limit ?? "30", 10) || 30, 1),
      MAX_PAGE_SIZE,
    );

    const where = {
      userId: req.session.userId!,
      organizationId: req.session.organizationId!,
      ...(unread === "1" ? { readAt: null } : {}),
    };

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
      }),
      prisma.notification.count({
        where: {
          userId: req.session.userId!,
          organizationId: req.session.organizationId!,
          readAt: null,
        },
      }),
    ]);

    res.json({ items: items.map(fmtNotification), unreadCount });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/notifications/:id/read
router.post("/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        id: req.params.id,
        userId: req.session.userId!,
        organizationId: req.session.organizationId!,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      const exists = await prisma.notification.findFirst({
        where: {
          id: req.params.id,
          userId: req.session.userId!,
          organizationId: req.session.organizationId!,
        },
        select: { id: true },
      });
      if (!exists) return res.status(404).json({ error: "الإشعار غير موجود" });
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/notifications/read-all
router.post("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        userId: req.session.userId!,
        organizationId: req.session.organizationId!,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    res.json({ ok: true, updated: result.count });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/notification-preferences
router.get("/notification-preferences", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: {
        id: req.session.userId!,
        organizationId: req.session.organizationId!,
      },
      select: { notifyInApp: true, notifyEmail: true },
    });
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    res.json(user);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// PATCH /api/notification-preferences
router.patch("/notification-preferences", requireAuth, async (req, res) => {
  try {
    const { notifyInApp, notifyEmail } = req.body as {
      notifyInApp?: unknown;
      notifyEmail?: unknown;
    };

    const data: { notifyInApp?: boolean; notifyEmail?: boolean } = {};
    if (notifyInApp !== undefined) {
      if (typeof notifyInApp !== "boolean") {
        return res.status(400).json({ error: "قيمة غير صالحة لإشعارات المنصة" });
      }
      data.notifyInApp = notifyInApp;
    }
    if (notifyEmail !== undefined) {
      if (typeof notifyEmail !== "boolean") {
        return res.status(400).json({ error: "قيمة غير صالحة لإشعارات البريد" });
      }
      data.notifyEmail = notifyEmail;
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "لا توجد تفضيلات للتحديث" });
    }

    const updated = await prisma.user.updateMany({
      where: {
        id: req.session.userId!,
        organizationId: req.session.organizationId!,
      },
      data,
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: "المستخدم غير موجود" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.session.userId! },
      select: { notifyInApp: true, notifyEmail: true },
    });
    res.json(user);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
