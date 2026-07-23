import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { ACTION_LABELS } from "../lib/audit";

const router = Router();

// GET /api/audit  (manager-only, org-isolated)
router.get("/audit", requireRole("manager"), async (req, res) => {
  try {
    const { limit = "100", before } = req.query as { limit?: string; before?: string };

    const logs = await prisma.auditLog.findMany({
      where: {
        organizationId: req.session.organizationId!,
        ...(before && { createdAt: { lt: new Date(before) } }),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(parseInt(limit, 10) || 100, 200),
    });

    res.json(
      logs.map((l) => ({
        id: l.id,
        actorName: l.actorName,
        action: l.action,
        actionLabel: ACTION_LABELS[l.action as keyof typeof ACTION_LABELS] ?? l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        entityLabel: l.entityLabel,
        details: l.details ? JSON.parse(l.details) : null,
        createdAt: l.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
