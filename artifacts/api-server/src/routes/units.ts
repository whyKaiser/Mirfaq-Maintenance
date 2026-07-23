import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { logAction } from "../lib/audit";

const router = Router();

function fmtUnit(u: {
  id: string; number: string; floor: number; propertyId: string;
  residentId: string | null; resident: { id: string; name: string } | null;
}) {
  return {
    id: u.id,
    number: u.number,
    floor: u.floor,
    propertyId: u.propertyId,
    residentId: u.residentId,
    residentName: u.resident?.name ?? null,
  };
}

// GET /api/properties/:propertyId/units
router.get("/properties/:propertyId/units", requireRole("manager"), async (req, res) => {
  try {
    const prop = await prisma.property.findFirst({
      where: { id: req.params.propertyId, organizationId: req.session.organizationId! },
    });
    if (!prop) return res.status(404).json({ error: "العقار غير موجود" });

    const units = await prisma.unit.findMany({
      where: { propertyId: req.params.propertyId },
      include: { resident: { select: { id: true, name: true } } },
      orderBy: [{ floor: "asc" }, { number: "asc" }],
    });
    res.json(units.map(fmtUnit));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/properties/:propertyId/units
router.post("/properties/:propertyId/units", requireRole("manager"), async (req, res) => {
  try {
    const prop = await prisma.property.findFirst({
      where: { id: req.params.propertyId, organizationId: req.session.organizationId! },
    });
    if (!prop) return res.status(404).json({ error: "العقار غير موجود" });

    const { number, floor, residentId } = req.body as {
      number?: string; floor?: number; residentId?: string | null;
    };
    if (!number?.trim() || floor === undefined) {
      return res.status(400).json({ error: "رقم الوحدة والطابق مطلوبان" });
    }

    // Validate resident belongs to same org
    if (residentId) {
      const r = await prisma.user.findFirst({ where: { id: residentId, organizationId: req.session.organizationId! } });
      if (!r) return res.status(400).json({ error: "الساكن غير موجود" });
    }

    const unit = await prisma.unit.create({
      data: {
        number: number.trim(),
        floor: Number(floor),
        propertyId: req.params.propertyId,
        residentId: residentId || null,
      },
      include: { resident: { select: { id: true, name: true } } },
    });
    await logAction({
      organizationId: req.session.organizationId!,
      actorId: req.session.userId!,
      actorName: req.session.userName!,
      action: "create_unit",
      entityType: "unit",
      entityId: unit.id,
      entityLabel: `${prop.name} - وحدة ${unit.number}`,
    });
    res.status(201).json(fmtUnit(unit));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// PATCH /api/units/:id
router.patch("/units/:id", requireRole("manager"), async (req, res) => {
  try {
    const unit = await prisma.unit.findFirst({
      where: { id: req.params.id },
      include: { property: { select: { organizationId: true } } },
    });
    if (!unit || unit.property.organizationId !== req.session.organizationId) {
      return res.status(404).json({ error: "الوحدة غير موجودة" });
    }

    const { number, floor, residentId } = req.body as {
      number?: string; floor?: number; residentId?: string | null;
    };

    // Validate new resident belongs to same org
    if (residentId) {
      const r = await prisma.user.findFirst({ where: { id: residentId, organizationId: req.session.organizationId! } });
      if (!r) return res.status(400).json({ error: "الساكن غير موجود" });
    }

    const updated = await prisma.unit.update({
      where: { id: req.params.id },
      data: {
        ...(number?.trim() && { number: number.trim() }),
        ...(floor !== undefined && { floor: Number(floor) }),
        ...(residentId !== undefined && { residentId: residentId || null }),
      },
      include: { resident: { select: { id: true, name: true } } },
    });
    res.json(fmtUnit(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// DELETE /api/units/:id
router.delete("/units/:id", requireRole("manager"), async (req, res) => {
  try {
    const unit = await prisma.unit.findFirst({
      where: { id: req.params.id },
      include: { property: { select: { organizationId: true } } },
    });
    if (!unit || unit.property.organizationId !== req.session.organizationId) {
      return res.status(404).json({ error: "الوحدة غير موجودة" });
    }
    await prisma.unit.delete({ where: { id: req.params.id } });
    await logAction({
      organizationId: req.session.organizationId!,
      actorId: req.session.userId!,
      actorName: req.session.userName!,
      action: "delete_unit",
      entityType: "unit",
      entityId: unit.id,
      entityLabel: `وحدة ${unit.number}`,
    });
    res.json({ message: "تم حذف الوحدة بنجاح" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
