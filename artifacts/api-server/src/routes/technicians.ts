import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";

const router = Router();

// GET /api/technicians  (manager-only, org-isolated)
router.get("/technicians", requireRole("manager"), async (req, res) => {
  try {
    const orgId = req.session.organizationId!;

    const technicians = await prisma.technicianProfile.findMany({
      where: { user: { organizationId: orgId, isActive: true } },
      include: {
        user: { select: { name: true, phone: true } },
        _count: {
          select: {
            requests: { where: { status: "قيد التنفيذ" } },
          },
        },
      },
    });

    res.json(
      technicians.map((t) => ({
        id: t.id,
        userId: t.userId,
        name: t.user.name,
        specialty: t.specialty,
        phone: t.phone ?? t.user.phone ?? "",
        activeJobsCount: t._count.requests,
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
