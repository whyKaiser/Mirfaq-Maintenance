import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { getFileUrl } from "../lib/storage";

const router = Router();

// GET /api/reports/work-order/:requestId
router.get("/reports/work-order/:requestId", requireRole("manager"), async (req, res) => {
  try {
    const orgId = req.session.organizationId!;

    const [request, org] = await Promise.all([
      prisma.maintenanceRequest.findFirst({
        where: { id: req.params.requestId, organizationId: orgId },
        include: {
          property: { select: { name: true, address: true } },
          unit: { select: { number: true, floor: true } },
          resident: { select: { name: true, email: true, phone: true } },
          technician: { include: { user: { select: { name: true, phone: true } } } },
          comments: {
            include: { author: { select: { name: true, role: true } } },
            orderBy: { createdAt: "asc" },
          },
          attachments: { orderBy: { createdAt: "asc" } },
        },
      }),
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true, brandColor: true, logoUrl: true, city: true, phone: true },
      }),
    ]);

    if (!request || !org) return res.status(404).json({ error: "البلاغ غير موجود" });

    res.json({
      org,
      request: {
        id: request.id,
        title: request.title,
        description: request.description,
        category: request.category,
        priority: request.priority,
        status: request.status,
        propertyName: request.property.name,
        propertyAddress: request.property.address,
        unitNumber: request.unit.number,
        unitFloor: request.unit.floor,
        residentName: request.resident.name,
        residentPhone: request.resident.phone,
        technicianName: request.technician?.user.name ?? null,
        technicianSpecialty: request.technician?.specialty ?? null,
        technicianPhone: request.technician?.user.phone ?? request.technician?.phone ?? null,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
        comments: request.comments.map((c) => ({
          content: c.content,
          authorName: c.author.name,
          authorRole: c.author.role,
          createdAt: c.createdAt.toISOString(),
        })),
        attachments: request.attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          attachmentType: a.attachmentType,
          url: getFileUrl(a.filePath),
        })),
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/reports/monthly?year=2025&month=1
router.get("/reports/monthly", requireRole("manager"), async (req, res) => {
  try {
    const orgId = req.session.organizationId!;
    const now = new Date();
    const year = parseInt(req.query.year as string) || now.getFullYear();
    const month = parseInt(req.query.month as string) || now.getMonth() + 1;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const [org, requests] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true, brandColor: true, logoUrl: true, city: true },
      }),
      prisma.maintenanceRequest.findMany({
        where: {
          organizationId: orgId,
          createdAt: { gte: startDate, lte: endDate },
        },
        include: {
          property: { select: { name: true } },
          unit: { select: { number: true } },
          resident: { select: { name: true } },
          technician: { include: { user: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (!org) return res.status(404).json({ error: "المؤسسة غير موجودة" });

    const stats = {
      total: requests.length,
      pending: requests.filter((r) => r.status === "معلّقة").length,
      inProgress: requests.filter((r) => r.status === "قيد التنفيذ").length,
      completed: requests.filter((r) => r.status === "مكتملة").length,
      urgent: requests.filter((r) => r.priority === "عاجل").length,
      byCategory: requests.reduce<Record<string, number>>((acc, r) => {
        acc[r.category] = (acc[r.category] || 0) + 1;
        return acc;
      }, {}),
    };

    res.json({
      org,
      period: { year, month },
      stats,
      requests: requests.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        priority: r.priority,
        status: r.status,
        propertyName: r.property.name,
        unitNumber: r.unit.number,
        residentName: r.resident.name,
        technicianName: r.technician?.user.name ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
