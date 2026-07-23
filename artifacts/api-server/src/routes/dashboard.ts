import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";

const router = Router();

// GET /api/dashboard/stats
router.get("/dashboard/stats", requireRole("manager"), async (req, res) => {
  try {
    const userId = req.session.userId!;

    const properties = await prisma.property.findMany({
      where: { managerId: userId },
      select: { id: true },
    });
    const propertyIds = properties.map((p) => p.id);

    const [totalRequests, pending, inProgress, completed, totalUnits, totalTechnicians] =
      await Promise.all([
        prisma.maintenanceRequest.count({ where: { propertyId: { in: propertyIds } } }),
        prisma.maintenanceRequest.count({
          where: { propertyId: { in: propertyIds }, status: "معلّقة" },
        }),
        prisma.maintenanceRequest.count({
          where: { propertyId: { in: propertyIds }, status: "قيد التنفيذ" },
        }),
        prisma.maintenanceRequest.count({
          where: { propertyId: { in: propertyIds }, status: "مكتملة" },
        }),
        prisma.unit.count({ where: { propertyId: { in: propertyIds } } }),
        prisma.technicianProfile.count(),
      ]);

    res.json({
      totalRequests,
      pending,
      inProgress,
      completed,
      totalProperties: properties.length,
      totalUnits,
      totalTechnicians,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
