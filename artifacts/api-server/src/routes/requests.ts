import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";

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

// GET /api/requests (role-filtered)
router.get("/requests", requireAuth, async (req, res) => {
  try {
    const role = req.session.userRole!;
    const userId = req.session.userId!;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let where: any = {};

    if (role === "resident") {
      where.residentId = userId;
    } else if (role === "technician") {
      const profile = await prisma.technicianProfile.findUnique({ where: { userId } });
      if (!profile) return res.json([]);
      where.technicianId = profile.id;
    } else if (role === "manager") {
      const properties = await prisma.property.findMany({
        where: { managerId: userId },
        select: { id: true },
      });
      where.propertyId = { in: properties.map((p) => p.id) };
    }

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

    const unit = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit || unit.residentId !== req.session.userId) {
      return res.status(403).json({ error: "لا يمكنك إرسال بلاغ لهذه الوحدة" });
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
      },
      include: includeRelations,
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
    const request = await prisma.maintenanceRequest.findUnique({
      where: { id: req.params.id },
      include: includeRelations,
    });
    if (!request) return res.status(404).json({ error: "البلاغ غير موجود" });

    const role = req.session.userRole!;
    const userId = req.session.userId!;

    // Authorization
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

    const existing = await prisma.maintenanceRequest.findUnique({
      where: { id: req.params.id },
      include: { property: { select: { managerId: true } } },
    });
    if (!existing) return res.status(404).json({ error: "البلاغ غير موجود" });

    const { status, priority, technicianId, title, description } = req.body as {
      status?: string; priority?: string; technicianId?: string | null;
      title?: string; description?: string;
    };

    // Role-based access
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

    if (role === "manager") {
      if (existing.property.managerId !== userId) {
        return res.status(403).json({ error: "ليس لديك صلاحية تعديل هذا البلاغ" });
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

    res.json(fmtRequest(request));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/requests/:requestId/comments
router.get("/requests/:requestId/comments", requireAuth, async (req, res) => {
  try {
    const request = await prisma.maintenanceRequest.findUnique({
      where: { id: req.params.requestId },
    });
    if (!request) return res.status(404).json({ error: "البلاغ غير موجود" });

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
    const { content } = req.body as { content?: string };

    if (!content?.trim()) {
      return res.status(400).json({ error: "محتوى التعليق مطلوب" });
    }

    const request = await prisma.maintenanceRequest.findUnique({
      where: { id: req.params.requestId },
    });
    if (!request) return res.status(404).json({ error: "البلاغ غير موجود" });

    // Residents can only comment on their own requests
    const role = req.session.userRole!;
    if (role === "resident" && request.residentId !== userId) {
      return res.status(403).json({ error: "ليس لديك صلاحية التعليق على هذا البلاغ" });
    }

    const comment = await prisma.requestComment.create({
      data: { content: content.trim(), requestId: req.params.requestId, authorId: userId },
      include: { author: { select: { name: true } } },
    });

    res.status(201).json({
      id: comment.id,
      content: comment.content,
      requestId: comment.requestId,
      authorId: comment.authorId,
      authorName: comment.author.name,
      createdAt: comment.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
