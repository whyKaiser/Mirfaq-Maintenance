import { Router, type Request } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { logAction } from "../lib/audit";
import { getFileUrl } from "../lib/storage";
import { getMaintenanceRequestAccess } from "../lib/request-access";
import { notify, organizationManagerIds, technicianUserId } from "../lib/notify";

const router = Router();
const MAX_COST_SAR = 10_000_000;
const REQUEST_STATUSES = new Set(["معلّقة", "قيد التنفيذ", "مكتملة"]);
const REQUEST_PRIORITIES = new Set(["عاجل", "عادي"]);

function requestActor(req: Request) {
  return {
    organizationId: req.session.organizationId!,
    userId: req.session.userId!,
    role: req.session.userRole!,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function costToHalalas(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > MAX_COST_SAR
  ) {
    return null;
  }

  const scaled = value * 100;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 0.000001) {
    return null;
  }
  return rounded;
}

const includeRelations = {
  property: { select: { name: true } },
  unit: { select: { number: true } },
  resident: { select: { name: true } },
  technician: { include: { user: { select: { name: true } } } },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtRequest(r: any) {
  const laborCostHalalas = r.laborCostHalalas ?? 0;
  const partsCostHalalas = r.partsCostHalalas ?? 0;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    priority: r.priority,
    status: r.status,
    propertyId: r.propertyId,
    propertyName: r.property?.name ?? null,
    unitId: r.unitId,
    unitNumber: r.unit?.number ?? null,
    residentId: r.residentId,
    residentName: r.resident?.name ?? null,
    reporterName: r.reporterName ?? null,
    reporterPhone: r.reporterPhone ?? null,
    technicianId: r.technicianId ?? null,
    technicianName: r.technician?.user?.name ?? null,
    laborCost: laborCostHalalas / 100,
    partsCost: partsCostHalalas / 100,
    totalCost: (laborCostHalalas + partsCostHalalas) / 100,
    rating: r.rating ?? null,
    ratingComment: r.ratingComment ?? null,
    ratedAt:
      r.ratedAt instanceof Date ? r.ratedAt.toISOString() : (r.ratedAt ?? null),
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt:
      r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  };
}

// GET /api/requests (role-filtered, org-isolated)
router.get("/requests", requireAuth, async (req, res) => {
  try {
    const role = req.session.userRole!;
    const userId = req.session.userId!;
    const orgId = req.session.organizationId!;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let where: any = { organizationId: orgId };

    if (role === "resident") {
      where.residentId = userId;
    } else if (role === "technician") {
      const profile = await prisma.technicianProfile.findUnique({
        where: { userId },
      });
      if (!profile) return res.json([]);
      where.technicianId = profile.id;
    }
    // manager sees all org requests (just { organizationId: orgId })

    const requests = await prisma.maintenanceRequest.findMany({
      where,
      include: includeRelations,
      orderBy: { createdAt: "desc" },
    });

    res.json(requests.map(fmtRequest));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/requests (resident only)
router.post("/requests", requireRole("resident"), async (req, res) => {
  try {
    const { title, description, category, priority, unitId } = req.body as {
      title?: string;
      description?: string;
      category?: string;
      priority?: string;
      unitId?: string;
    };

    if (
      !title?.trim() ||
      !description?.trim() ||
      !category ||
      !priority ||
      !unitId
    ) {
      return res.status(400).json({ error: "جميع الحقول مطلوبة" });
    }
    if (!REQUEST_PRIORITIES.has(priority)) {
      return res.status(400).json({ error: "أولوية البلاغ غير صالحة" });
    }

    // Check unit belongs to resident and same org
    const unit = await prisma.unit.findFirst({
      where: { id: unitId },
      include: { property: { select: { organizationId: true } } },
    });
    if (!unit || unit.residentId !== req.session.userId) {
      return res.status(403).json({ error: "لا يمكنك إرسال بلاغ لهذه الوحدة" });
    }
    if (unit.property.organizationId !== req.session.organizationId) {
      return res.status(403).json({ error: "ليس لديك صلاحية" });
    }

    const request = await prisma.maintenanceRequest.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        status: "معلّقة",
        propertyId: unit.propertyId,
        unitId,
        residentId: req.session.userId!,
        organizationId: req.session.organizationId!,
      },
      include: includeRelations,
    });

    await logAction({
      organizationId: req.session.organizationId!,
      actorId: req.session.userId!,
      actorName: req.session.userName!,
      action: "create_request",
      entityType: "request",
      entityId: request.id,
      entityLabel: request.title,
    });

    await notify({
      organizationId: request.organizationId,
      userIds: await organizationManagerIds(request.organizationId),
      actorId: req.session.userId!,
      type: "request_created",
      title: `بلاغ جديد: ${request.title}`,
      body: `${request.property?.name ?? ""} — وحدة ${request.unit?.number ?? ""} · أولوية ${request.priority}`,
      entityType: "request",
      entityId: request.id,
    });

    res.status(201).json(fmtRequest(request));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/requests/:id
router.get("/requests/:id", requireAuth, async (req, res) => {
  try {
    const access = await getMaintenanceRequestAccess(
      requestActor(req),
      req.params.id,
    );
    if (access.decision === "not-found") {
      return res.status(404).json({ error: "البلاغ غير موجود" });
    }
    if (access.decision === "forbidden") {
      return res
        .status(403)
        .json({ error: "ليس لديك صلاحية الوصول لهذا البلاغ" });
    }

    const orgId = req.session.organizationId!;
    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      include: includeRelations,
    });
    if (!request) return res.status(404).json({ error: "البلاغ غير موجود" });

    res.json(fmtRequest(request));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// PATCH /api/requests/:id
router.patch("/requests/:id", requireAuth, async (req, res) => {
  try {
    const role = req.session.userRole!;
    const userId = req.session.userId!;
    const orgId = req.session.organizationId!;

    const access = await getMaintenanceRequestAccess(
      requestActor(req),
      req.params.id,
    );
    if (access.decision === "not-found") {
      return res.status(404).json({ error: "البلاغ غير موجود" });
    }
    if (access.decision === "forbidden") {
      return res
        .status(403)
        .json({ error: "ليس لديك صلاحية تعديل هذا البلاغ" });
    }

    const existing = await prisma.maintenanceRequest.findFirst({
      where: { id: req.params.id, organizationId: orgId },
    });
    if (!existing) return res.status(404).json({ error: "البلاغ غير موجود" });

    const { status, priority, technicianId, title, description } = req.body as {
      status?: string;
      priority?: string;
      technicianId?: string | null;
      title?: string;
      description?: string;
    };

    if (
      status !== undefined &&
      (typeof status !== "string" || !REQUEST_STATUSES.has(status))
    ) {
      return res.status(400).json({ error: "حالة البلاغ غير صالحة" });
    }
    if (
      priority !== undefined &&
      (typeof priority !== "string" || !REQUEST_PRIORITIES.has(priority))
    ) {
      return res.status(400).json({ error: "أولوية البلاغ غير صالحة" });
    }

    if (role === "resident") {
      if (
        status !== undefined ||
        technicianId !== undefined ||
        priority !== undefined
      ) {
        return res
          .status(403)
          .json({ error: "لا يمكنك تغيير الحالة أو الأولوية" });
      }
    }

    if (role === "technician") {
      if (technicianId !== undefined || priority !== undefined) {
        return res
          .status(403)
          .json({ error: "لا يمكنك تغيير الفني أو الأولوية" });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (technicianId !== undefined)
      updateData.technicianId = technicianId || null;
    if (title?.trim()) updateData.title = title.trim();
    if (description?.trim()) updateData.description = description.trim();

    const request = await prisma.maintenanceRequest.update({
      where: { id: req.params.id },
      data: updateData,
      include: includeRelations,
    });

    // Audit log for significant changes (manager actions)
    if (role === "manager") {
      if (status && status !== existing.status) {
        await logAction({
          organizationId: orgId,
          actorId: userId,
          actorName: req.session.userName!,
          action: "change_status",
          entityType: "request",
          entityId: existing.id,
          entityLabel: existing.title,
          details: { from: existing.status, to: status },
        });
      }
      if (priority && priority !== existing.priority) {
        await logAction({
          organizationId: orgId,
          actorId: userId,
          actorName: req.session.userName!,
          action: "change_priority",
          entityType: "request",
          entityId: existing.id,
          entityLabel: existing.title,
          details: { from: existing.priority, to: priority },
        });
      }
      if (
        technicianId !== undefined &&
        technicianId !== existing.technicianId
      ) {
        await logAction({
          organizationId: orgId,
          actorId: userId,
          actorName: req.session.userName!,
          action: "assign_technician",
          entityType: "request",
          entityId: existing.id,
          entityLabel: existing.title,
        });
      }
    }
    if (role === "technician" && status && status !== existing.status) {
      await logAction({
        organizationId: orgId,
        actorId: userId,
        actorName: req.session.userName!,
        action: "change_status",
        entityType: "request",
        entityId: existing.id,
        entityLabel: existing.title,
        details: { from: existing.status, to: status },
      });
    }

    if (status && status !== existing.status) {
      await notify({
        organizationId: orgId,
        userIds: [
          existing.residentId,
          await technicianUserId(request.technicianId),
          ...(await organizationManagerIds(orgId)),
        ],
        actorId: userId,
        type: "request_status_changed",
        title: `تحديث حالة البلاغ: ${existing.title}`,
        body: `الحالة تغيّرت من "${existing.status}" إلى "${status}".`,
        entityType: "request",
        entityId: existing.id,
      });
    }

    if (technicianId !== undefined && technicianId !== existing.technicianId) {
      const assignedUserId = await technicianUserId(technicianId);
      await notify({
        organizationId: orgId,
        userIds: [assignedUserId, existing.residentId],
        actorId: userId,
        type: "request_assigned",
        title: `إسناد البلاغ: ${existing.title}`,
        body: technicianId
          ? `تم إسناد البلاغ إلى ${request.technician?.user?.name ?? "فني"}.`
          : "تم إلغاء إسناد الفني لهذا البلاغ.",
        entityType: "request",
        entityId: existing.id,
      });
    }

    res.json(fmtRequest(request));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// PATCH /api/requests/:id/costs (manager only)
router.patch(
  "/requests/:id/costs",
  requireRole("manager"),
  async (req, res) => {
    try {
      if (!isRecord(req.body)) {
        return res.status(400).json({ error: "بيانات التكلفة غير صالحة" });
      }

      const { laborCost, partsCost } = req.body;
      if (laborCost === undefined && partsCost === undefined) {
        return res.status(400).json({ error: "أدخل تكلفة العمالة أو القطع" });
      }

      const laborCostHalalas =
        laborCost === undefined ? undefined : costToHalalas(laborCost);
      const partsCostHalalas =
        partsCost === undefined ? undefined : costToHalalas(partsCost);
      if (
        (laborCost !== undefined && laborCostHalalas === null) ||
        (partsCost !== undefined && partsCostHalalas === null)
      ) {
        return res.status(400).json({
          error:
            "التكلفة يجب أن تكون من 0 إلى 10,000,000 ريال وبحد أقصى منزلتين عشريتين",
        });
      }

      const orgId = req.session.organizationId!;
      const existing = await prisma.maintenanceRequest.findFirst({
        where: { id: req.params.id, organizationId: orgId },
      });
      if (!existing) {
        return res.status(404).json({ error: "البلاغ غير موجود" });
      }

      const request = await prisma.maintenanceRequest.update({
        where: { id: existing.id },
        data: {
          ...(typeof laborCostHalalas === "number" && { laborCostHalalas }),
          ...(typeof partsCostHalalas === "number" && { partsCostHalalas }),
        },
        include: includeRelations,
      });

      await logAction({
        organizationId: orgId,
        actorId: req.session.userId!,
        actorName: req.session.userName!,
        action: "update_request_costs",
        entityType: "request",
        entityId: request.id,
        entityLabel: request.title,
        details: {
          laborCost: request.laborCostHalalas / 100,
          partsCost: request.partsCostHalalas / 100,
        },
      });

      res.json(fmtRequest(request));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "خطأ في الخادم" });
    }
  },
);

// POST /api/requests/:id/rating (resident who owns completed request)
router.post(
  "/requests/:id/rating",
  requireRole("resident"),
  async (req, res) => {
    try {
      const access = await getMaintenanceRequestAccess(
        requestActor(req),
        req.params.id,
      );
      if (access.decision === "not-found") {
        return res.status(404).json({ error: "البلاغ غير موجود" });
      }
      if (access.decision === "forbidden") {
        return res
          .status(403)
          .json({ error: "ليس لديك صلاحية تقييم هذا البلاغ" });
      }

      if (!isRecord(req.body)) {
        return res.status(400).json({ error: "بيانات التقييم غير صالحة" });
      }
      const { rating, comment } = req.body;
      if (
        typeof rating !== "number" ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      ) {
        return res
          .status(400)
          .json({ error: "التقييم يجب أن يكون عددًا صحيحًا من 1 إلى 5" });
      }
      if (comment !== undefined && typeof comment !== "string") {
        return res.status(400).json({ error: "التعليق غير صالح" });
      }
      const ratingComment = typeof comment === "string" ? comment.trim() : "";
      if (ratingComment.length > 1000) {
        return res.status(400).json({ error: "التعليق أطول من الحد المسموح" });
      }

      const request = await prisma.maintenanceRequest.findFirst({
        where: {
          id: req.params.id,
          organizationId: req.session.organizationId!,
          residentId: req.session.userId!,
        },
      });
      if (!request) {
        return res.status(404).json({ error: "البلاغ غير موجود" });
      }
      if (request.status !== "مكتملة") {
        return res
          .status(409)
          .json({ error: "يمكن تقييم البلاغ بعد اكتماله فقط" });
      }
      if (request.rating !== null) {
        return res.status(409).json({ error: "تم تقييم البلاغ مسبقًا" });
      }

      const result = await prisma.maintenanceRequest.updateMany({
        where: {
          id: request.id,
          organizationId: req.session.organizationId!,
          residentId: req.session.userId!,
          status: "مكتملة",
          rating: null,
        },
        data: {
          rating,
          ratingComment: ratingComment || null,
          ratedAt: new Date(),
        },
      });
      if (result.count !== 1) {
        return res.status(409).json({ error: "تم تقييم البلاغ مسبقًا" });
      }
      const updated = await prisma.maintenanceRequest.findUnique({
        where: { id: request.id },
        include: includeRelations,
      });
      if (!updated) {
        return res.status(404).json({ error: "البلاغ غير موجود" });
      }

      await logAction({
        organizationId: req.session.organizationId!,
        actorId: req.session.userId!,
        actorName: req.session.userName!,
        action: "rate_request",
        entityType: "request",
        entityId: request.id,
        entityLabel: request.title,
        details: { rating },
      });

      await notify({
        organizationId: req.session.organizationId!,
        userIds: [
          ...(await organizationManagerIds(req.session.organizationId!)),
          await technicianUserId(updated.technicianId),
        ],
        actorId: req.session.userId!,
        type: "request_rated",
        title: `تقييم البلاغ: ${request.title}`,
        body: `قيّم الساكن البلاغ بـ ${rating} من 5.`,
        entityType: "request",
        entityId: request.id,
      });

      res.json(fmtRequest(updated));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "خطأ في الخادم" });
    }
  },
);

// GET /api/requests/:requestId/comments
router.get("/requests/:requestId/comments", requireAuth, async (req, res) => {
  try {
    const access = await getMaintenanceRequestAccess(
      requestActor(req),
      req.params.requestId,
    );
    if (access.decision === "not-found") {
      return res.status(404).json({ error: "البلاغ غير موجود" });
    }
    if (access.decision === "forbidden") {
      return res.status(403).json({ error: "ليس لديك صلاحية" });
    }

    const comments = await prisma.requestComment.findMany({
      where: { requestId: req.params.requestId },
      include: { author: { select: { name: true, role: true } } },
      orderBy: { createdAt: "asc" },
    });

    res.json(
      comments.map((c) => ({
        id: c.id,
        content: c.content,
        requestId: c.requestId,
        authorId: c.authorId,
        authorName: c.author.name,
        authorRole: c.author.role,
        createdAt: c.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/requests/:requestId/comments
router.post("/requests/:requestId/comments", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const access = await getMaintenanceRequestAccess(
      requestActor(req),
      req.params.requestId,
    );
    if (access.decision === "not-found") {
      return res.status(404).json({ error: "البلاغ غير موجود" });
    }
    if (access.decision === "forbidden") {
      return res
        .status(403)
        .json({ error: "ليس لديك صلاحية التعليق على هذا البلاغ" });
    }

    const { content } = req.body as { content?: string };
    if (!content?.trim()) {
      return res.status(400).json({ error: "محتوى التعليق مطلوب" });
    }

    const comment = await prisma.requestComment.create({
      data: {
        content: content.trim(),
        requestId: req.params.requestId,
        authorId: userId,
      },
      include: { author: { select: { name: true, role: true } } },
    });

    const commented = await prisma.maintenanceRequest.findFirst({
      where: {
        id: req.params.requestId,
        organizationId: req.session.organizationId!,
      },
      select: { id: true, title: true, residentId: true, technicianId: true },
    });
    if (commented) {
      await notify({
        organizationId: req.session.organizationId!,
        userIds: [
          commented.residentId,
          await technicianUserId(commented.technicianId),
          ...(await organizationManagerIds(req.session.organizationId!)),
        ],
        actorId: userId,
        type: "request_commented",
        title: `تعليق جديد على: ${commented.title}`,
        body: `${comment.author.name}: ${comment.content.slice(0, 140)}`,
        entityType: "request",
        entityId: commented.id,
      });
    }

    res.status(201).json({
      id: comment.id,
      content: comment.content,
      requestId: comment.requestId,
      authorId: comment.authorId,
      authorName: comment.author.name,
      authorRole: comment.author.role,
      createdAt: comment.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/requests/:requestId/attachments
router.get(
  "/requests/:requestId/attachments",
  requireAuth,
  async (req, res) => {
    try {
      const access = await getMaintenanceRequestAccess(
        requestActor(req),
        req.params.requestId,
      );
      if (access.decision === "not-found") {
        return res.status(404).json({ error: "البلاغ غير موجود" });
      }
      if (access.decision === "forbidden") {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }

      const attachments = await prisma.requestAttachment.findMany({
        where: { requestId: req.params.requestId },
        orderBy: { createdAt: "asc" },
      });

      res.json(
        attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          attachmentType: a.attachmentType,
          url: getFileUrl(a.filePath),
          createdAt: a.createdAt.toISOString(),
        })),
      );
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "خطأ في الخادم" });
    }
  },
);

export default router;
