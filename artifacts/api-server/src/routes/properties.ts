import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { logAction } from "../lib/audit";

const router = Router();

function fmt(p: {
  id: string; name: string; address: string; managerId: string;
  organizationId: string; createdAt: Date; _count: { units: number };
}) {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    managerId: p.managerId,
    organizationId: p.organizationId,
    createdAt: p.createdAt.toISOString(),
    unitCount: p._count.units,
  };
}

// GET /api/properties
router.get("/properties", requireRole("manager"), async (req, res) => {
  try {
    const props = await prisma.property.findMany({
      where: { organizationId: req.session.organizationId! },
      include: { _count: { select: { units: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(props.map(fmt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/properties
router.post("/properties", requireRole("manager"), async (req, res) => {
  try {
    const { name, address } = req.body as { name?: string; address?: string };
    if (!name?.trim() || !address?.trim()) {
      return res.status(400).json({ error: "اسم العقار والعنوان مطلوبان" });
    }
    const prop = await prisma.property.create({
      data: {
        name: name.trim(),
        address: address.trim(),
        managerId: req.session.userId!,
        organizationId: req.session.organizationId!,
      },
      include: { _count: { select: { units: true } } },
    });
    await logAction({
      organizationId: req.session.organizationId!,
      actorId: req.session.userId!,
      actorName: req.session.userName!,
      action: "create_property",
      entityType: "property",
      entityId: prop.id,
      entityLabel: prop.name,
    });
    res.status(201).json(fmt(prop));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/properties/:id
router.get("/properties/:id", requireRole("manager"), async (req, res) => {
  try {
    const prop = await prisma.property.findFirst({
      where: { id: req.params.id, organizationId: req.session.organizationId! },
      include: { _count: { select: { units: true } } },
    });
    if (!prop) return res.status(404).json({ error: "العقار غير موجود" });
    res.json(fmt(prop));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// PATCH /api/properties/:id
router.patch("/properties/:id", requireRole("manager"), async (req, res) => {
  try {
    const existing = await prisma.property.findFirst({
      where: { id: req.params.id, organizationId: req.session.organizationId! },
    });
    if (!existing) return res.status(404).json({ error: "العقار غير موجود" });

    const { name, address } = req.body as { name?: string; address?: string };
    const prop = await prisma.property.update({
      where: { id: req.params.id },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(address?.trim() && { address: address.trim() }),
      },
      include: { _count: { select: { units: true } } },
    });
    res.json(fmt(prop));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// DELETE /api/properties/:id
router.delete("/properties/:id", requireRole("manager"), async (req, res) => {
  try {
    const existing = await prisma.property.findFirst({
      where: { id: req.params.id, organizationId: req.session.organizationId! },
    });
    if (!existing) return res.status(404).json({ error: "العقار غير موجود" });
    await prisma.property.delete({ where: { id: req.params.id } });
    await logAction({
      organizationId: req.session.organizationId!,
      actorId: req.session.userId!,
      actorName: req.session.userName!,
      action: "delete_property",
      entityType: "property",
      entityId: existing.id,
      entityLabel: existing.name,
    });
    res.json({ message: "تم حذف العقار بنجاح" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
