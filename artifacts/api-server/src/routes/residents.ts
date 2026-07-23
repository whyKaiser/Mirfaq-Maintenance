import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";

const router = Router();

// GET /api/residents  (manager-only, org-isolated – used for unit resident picker)
router.get("/residents", requireRole("manager"), async (req, res) => {
  try {
    const residents = await prisma.user.findMany({
      where: { role: "resident", organizationId: req.session.organizationId!, isActive: true },
      include: { residentUnit: { select: { id: true, number: true } } },
      orderBy: { name: "asc" },
    });
    res.json(
      residents.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        unitId: r.residentUnit?.id ?? null,
        unitNumber: r.residentUnit?.number ?? null,
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
