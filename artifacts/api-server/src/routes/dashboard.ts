import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";

const router = Router();

// GET /api/dashboard/stats  (manager-only, org-isolated)
router.get("/dashboard/stats", requireRole("manager"), async (req, res) => {
  try {
    const orgId = req.session.organizationId!;

    const [totalRequests, pending, inProgress, completed, totalProperties, totalUnits, totalTechnicians] =
      await Promise.all([
        prisma.maintenanceRequest.count({ where: { organizationId: orgId } }),
        prisma.maintenanceRequest.count({ where: { organizationId: orgId, status: "معلّقة" } }),
        prisma.maintenanceRequest.count({ where: { organizationId: orgId, status: "قيد التنفيذ" } }),
        prisma.maintenanceRequest.count({ where: { organizationId: orgId, status: "مكتملة" } }),
        prisma.property.count({ where: { organizationId: orgId } }),
        prisma.unit.count({ where: { property: { organizationId: orgId } } }),
        prisma.technicianProfile.count({ where: { user: { organizationId: orgId, isActive: true } } }),
      ]);

    res.json({ totalRequests, pending, inProgress, completed, totalProperties, totalUnits, totalTechnicians });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
