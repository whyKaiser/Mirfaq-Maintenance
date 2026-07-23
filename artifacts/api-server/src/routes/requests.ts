import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { logAction } from "../lib/audit";
import { getFileUrl } from "../lib/storage";

const router = Router();

const includeRelations = {
  property: { select: { name: true } },
  unit: { select: { number: true } },
  resident: { select: { name: true } },
  technician: { include: { user: { select: { name: true } } } },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtRequest(r: any) {
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
    technicianId: r.technicianId ?? null,
    technicianName: r.technician?.user?.name ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
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
      const profile = await prisma.technicianProfile.findUnique({ where: { userId } });
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
      title?: string; description?: string; category?: string;
      priority?: string; unitId?: string;
    };

    if (!title?.trim() || !description?.trim() || !category || !priority || !unitId) {
      return res.status(400).json({ error: "جميع الحقول مطلوبة" });
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

    res.status(201).json(fmtRequest(request));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/requests/:id
router.get("/requests/:id", requireAuth, async (req, res) => {
  try {
    const orgId = req.session.organizationId!;
    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      include: includeRelations,
    });
    if (!request) return res.status(404).json({ error: "البلاغ غير موجود" });

    const role = req.session.userRole!;
    const userId = req.session.userId!;

    if (role === "resident" && request.residentId !== userId) {
      return res.status(403).json({ error: "ليس لديك صلاحية الوصول لهذا البلاغ" });
    }
    if (role === "technician") {
      const profile = await prisma.technicianProfile.findUnique({ where: { userId } });
      if (!profile || request.technicianId !== profile.id) {
        return res.status(403).json({ error: "ليس لديك صلاحية الوصول لهذا البلاغ" });
      }
    }

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

    const existing = await prisma.maintenanceRequest.findFirst({
      where: { id: req.params.id, organizationId: orgId },
    });
    if (!existing) return res.status(404).json({ error: "البلاغ غير موجود" });

    const { status, priority, technicianId, title, description } = req.body as {
      status?: string; priority?: string; technicianId?: string | null;
      title?: string; description?: string;
    };

    if (role === "resident") {
      if (existing.residentId !== userId) {
        return res.status(403).json({ error: "ليس لديك صلاحية تعديل هذا البلاغ" });
      }
      if (status || technicianId !== undefined || priority) {
        return res.status(403).json({ error: "لا يمكنك تغيير الحالة أو الأولوية" });
      }
    }

    if (role === "technician") {
      const profile = await prisma.technicianProfile.findUnique({ where: { userId } });
      if (!profile || existing.technicianId !== profile.id) {
        return res.status(403).json({ error: "ليس لديك صلاحية تعديل هذا البلاغ" });
      }
      if (technicianId !== undefined || priority) {
        return res.status(403).json({ error: "لا يمكنك تغيير الفني أو الأولوية" });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (technicianId !== undefined) updateData.technicianId = technicianId || null;
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
        await logAction({ organizationId: orgId, actorId: userId, actorName: req.session.userName!, action: "change_status", entityType: "request", entityId: existing.id, entityLabel: existing.title, details: { from: existing.status, to: status } });
      }
      if (priority && priority !== existing.priority) {
        await logAction({ organizationId: orgId, actorId: userId, actorName: req.session.userName!, action: "change_priority", entityType: "request", entityId: existing.id, entityLabel: existing.title, details: { from: existing.priority, to: priority } });
      }
      if (technicianId !== undefined && technicianId !== existing.technicianId) {
        await logAction({ organizationId: orgId, actorId: userId, actorName: req.session.userName!, action: "assign_technician", entityType: "request", entityId: existing.id, entityLabel: existing.title });
      }
    }
    if (role === "technician" && status && status !== existing.status) {
      await logAction({ organizationId: orgId, actorId: userId, actorName: req.session.userName!, action: "change_status", entityType: "request", entityId: existing.id, entityLabel: existing.title, details: { from: existing.status, to: status } });
    }

    res.json(fmtRequest(request));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/requests/:requestId/comments
router.get("/requests/:requestId/comments", requireAuth, async (req, res) => {
  try {
    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: req.params.requestId, organizationId: req.session.organizationId! },
    });
    if (!request) return res.status(404).json({ error: "البلاغ غير موجود" });

    const role = req.session.userRole!;
    const userId = req.session.userId!;
    if (role === "resident" && request.residentId !== userId) {
      return res.status(403).json({ error: "ليس لديك صلاحية" });
    }

    const comments = await prisma.requestComment.findMany({
      where: { requestId: req.params.requestId },
      include: { author: { select: { name: true, role: true } } },
      orderBy: { createdAt: "asc" },
    });

    res.json(comments.map((c) => ({
      id: c.id,
      content: c.content,
      requestId: c.requestId,
      authorId: c.authorId,
      authorName: c.author.name,
      authorRole: c.author.role,
      createdAt: c.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/requests/:requestId/comments
router.post("/requests/:requestId/comments", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { content } = req.body as { content?: string };

    if (!content?.trim()) {
      return res.status(400).json({ error: "محتوى التعليق مطلوب" });
    }

    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: req.params.requestId, organizationId: req.session.organizationId! },
    });
    if (!request) return res.status(404).json({ error: "البلاغ غير موجود" });

    const role = req.session.userRole!;
    if (role === "resident" && request.residentId !== userId) {
      return res.status(403).json({ error: "ليس لديك صلاحية التعليق على هذا البلاغ" });
    }
    if (role === "technician") {
      const profile = await prisma.technicianProfile.findUnique({ where: { userId } });
      if (!profile || request.technicianId !== profile.id) {
        return res.status(403).json({ error: "ليس لديك صلاحية التعليق على هذا البلاغ" });
      }
    }

    const comment = await prisma.requestComment.create({
      data: { content: content.trim(), requestId: req.params.requestId, authorId: userId },
      include: { author: { select: { name: true, role: true } } },
    });

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
router.get("/requests/:requestId/attachments", requireAuth, async (req, res) => {
  try {
    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: req.params.requestId, organizationId: req.session.organizationId! },
    });
    if (!request) return res.status(404).json({ error: "البلاغ غير موجود" });

    const role = req.session.userRole!;
    const userId = req.session.userId!;
    if (role === "resident" && request.residentId !== userId) {
      return res.status(403).json({ error: "ليس لديك صلاحية" });
    }

    const attachments = await prisma.requestAttachment.findMany({
      where: { requestId: req.params.requestId },
      orderBy: { createdAt: "asc" },
    });

    res.json(attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      attachmentType: a.attachmentType,
      url: getFileUrl(a.filePath),
      createdAt: a.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
