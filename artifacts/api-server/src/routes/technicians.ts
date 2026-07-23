import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";

const router = Router();

// GET /api/technicians
router.get("/technicians", requireRole("manager"), async (req, res) => {
  try {
    const technicians = await prisma.technicianProfile.findMany({
      include: {
        user: { select: { name: true } },
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
        phone: t.phone,
        activeJobsCount: t._count.requests,
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
