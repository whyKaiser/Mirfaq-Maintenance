import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { logAction } from "../lib/audit";

const router = Router();
const PLAN_MUTABLE_FIELDS = new Set([
  "propertyId",
  "unitId",
  "assignedTechnicianId",
  "title",
  "category",
  "frequencyDays",
  "nextDueAt",
  "notes",
  "isActive",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const includeRelations = {
  property: { select: { name: true } },
  unit: { select: { number: true } },
  assignedTechnician: {
    include: { user: { select: { name: true } } },
  },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtPlan(plan: any) {
  return {
    id: plan.id,
    organizationId: plan.organizationId,
    propertyId: plan.propertyId,
    propertyName: plan.property?.name ?? null,
    unitId: plan.unitId ?? null,
    unitNumber: plan.unit?.number ?? null,
    assignedTechnicianId: plan.assignedTechnicianId ?? null,
    assignedTechnicianName: plan.assignedTechnician?.user?.name ?? null,
    title: plan.title,
    category: plan.category,
    frequencyDays: plan.frequencyDays,
    nextDueAt: plan.nextDueAt.toISOString(),
    notes: plan.notes ?? null,
    isActive: plan.isActive,
    lastCompletedAt: plan.lastCompletedAt?.toISOString() ?? null,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function validateRelations(input: {
  organizationId: string;
  propertyId: string;
  unitId: string | null;
  assignedTechnicianId: string | null;
}) {
  const property = await prisma.property.findFirst({
    where: { id: input.propertyId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!property) return "العقار غير موجود";

  if (input.unitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: input.unitId, propertyId: input.propertyId },
      select: { id: true },
    });
    if (!unit) return "الوحدة لا تتبع العقار المحدد";
  }

  if (input.assignedTechnicianId) {
    const technician = await prisma.technicianProfile.findFirst({
      where: {
        id: input.assignedTechnicianId,
        user: { organizationId: input.organizationId, isActive: true },
      },
      select: { id: true },
    });
    if (!technician) return "الفني غير موجود";
  }

  return null;
}

// GET /api/preventive-plans (manager sees organization; technician sees assigned plans)
router.get(
  "/preventive-plans",
  requireRole("manager", "technician"),
  async (req, res) => {
    try {
      const orgId = req.session.organizationId!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { organizationId: orgId };

      if (req.session.userRole === "technician") {
        const profile = await prisma.technicianProfile.findUnique({
          where: { userId: req.session.userId! },
          select: { id: true },
        });
        if (!profile) return res.json([]);
        where.assignedTechnicianId = profile.id;
      }
      if (typeof req.query.propertyId === "string") {
        where.propertyId = req.query.propertyId;
      }
      if (req.query.isActive === "true" || req.query.isActive === "false") {
        where.isActive = req.query.isActive === "true";
      }

      const plans = await prisma.preventivePlan.findMany({
        where,
        include: includeRelations,
        orderBy: [{ nextDueAt: "asc" }, { createdAt: "desc" }],
      });
      res.json(plans.map(fmtPlan));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "خطأ في الخادم" });
    }
  },
);

// POST /api/preventive-plans
router.post("/preventive-plans", requireRole("manager"), async (req, res) => {
  try {
    if (!isRecord(req.body)) {
      return res.status(400).json({ error: "بيانات خطة الصيانة غير صالحة" });
    }

    const {
      propertyId,
      unitId,
      assignedTechnicianId,
      title,
      category,
      frequencyDays,
      nextDueAt,
      notes,
      isActive,
    } = req.body;

    if (
      typeof propertyId !== "string" ||
      !propertyId.trim() ||
      typeof title !== "string" ||
      typeof category !== "string" ||
      !Number.isInteger(frequencyDays) ||
      typeof frequencyDays !== "number" ||
      frequencyDays <= 0 ||
      frequencyDays > 3650
    ) {
      return res.status(400).json({ error: "بيانات خطة الصيانة غير صالحة" });
    }
    const dueDate = parseDate(nextDueAt);
    if (!dueDate) {
      return res.status(400).json({ error: "تاريخ الاستحقاق غير صالح" });
    }
    if (
      title.trim().length < 2 ||
      title.trim().length > 160 ||
      category.trim().length < 2 ||
      category.trim().length > 80
    ) {
      return res.status(400).json({ error: "العنوان أو التصنيف غير صالح" });
    }
    if (unitId !== undefined && unitId !== null && typeof unitId !== "string") {
      return res.status(400).json({ error: "الوحدة غير صالحة" });
    }
    if (
      assignedTechnicianId !== undefined &&
      assignedTechnicianId !== null &&
      typeof assignedTechnicianId !== "string"
    ) {
      return res.status(400).json({ error: "الفني غير صالح" });
    }
    if (
      notes !== undefined &&
      notes !== null &&
      (typeof notes !== "string" || notes.trim().length > 3000)
    ) {
      return res.status(400).json({ error: "الملاحظات غير صالحة" });
    }
    if (isActive !== undefined && typeof isActive !== "boolean") {
      return res.status(400).json({ error: "حالة الخطة غير صالحة" });
    }

    const orgId = req.session.organizationId!;
    const cleanPropertyId = propertyId.trim();
    const cleanUnitId =
      typeof unitId === "string" && unitId.trim() ? unitId.trim() : null;
    const cleanTechnicianId =
      typeof assignedTechnicianId === "string" && assignedTechnicianId.trim()
        ? assignedTechnicianId.trim()
        : null;
    const relationError = await validateRelations({
      organizationId: orgId,
      propertyId: cleanPropertyId,
      unitId: cleanUnitId,
      assignedTechnicianId: cleanTechnicianId,
    });
    if (relationError) {
      return res.status(400).json({ error: relationError });
    }

    const plan = await prisma.preventivePlan.create({
      data: {
        organizationId: orgId,
        propertyId: cleanPropertyId,
        unitId: cleanUnitId,
        assignedTechnicianId: cleanTechnicianId,
        title: title.trim(),
        category: category.trim(),
        frequencyDays,
        nextDueAt: dueDate,
        notes: typeof notes === "string" ? notes.trim() || null : null,
        isActive: typeof isActive === "boolean" ? isActive : true,
      },
      include: includeRelations,
    });

    await logAction({
      organizationId: orgId,
      actorId: req.session.userId!,
      actorName: req.session.userName!,
      action: "create_preventive_plan",
      entityType: "preventive_plan",
      entityId: plan.id,
      entityLabel: plan.title,
    });

    res.status(201).json(fmtPlan(plan));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/preventive-plans/:id
router.get(
  "/preventive-plans/:id",
  requireRole("manager", "technician"),
  async (req, res) => {
    try {
      const plan = await prisma.preventivePlan.findFirst({
        where: {
          id: req.params.id,
          organizationId: req.session.organizationId!,
        },
        include: includeRelations,
      });
      if (!plan) return res.status(404).json({ error: "الخطة غير موجودة" });

      if (req.session.userRole === "technician") {
        const profile = await prisma.technicianProfile.findUnique({
          where: { userId: req.session.userId! },
          select: { id: true },
        });
        if (!profile || plan.assignedTechnicianId !== profile.id) {
          return res.status(403).json({ error: "ليس لديك صلاحية" });
        }
      }

      res.json(fmtPlan(plan));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "خطأ في الخادم" });
    }
  },
);

// PATCH /api/preventive-plans/:id
router.patch(
  "/preventive-plans/:id",
  requireRole("manager"),
  async (req, res) => {
    try {
      if (!isRecord(req.body)) {
        return res.status(400).json({ error: "بيانات خطة الصيانة غير صالحة" });
      }
      const bodyKeys = Object.keys(req.body);
      if (bodyKeys.length === 0) {
        return res.status(400).json({ error: "لا توجد حقول لتحديثها" });
      }
      if (bodyKeys.some((key) => !PLAN_MUTABLE_FIELDS.has(key))) {
        return res.status(400).json({ error: "توجد حقول غير مدعومة" });
      }

      const existing = await prisma.preventivePlan.findFirst({
        where: {
          id: req.params.id,
          organizationId: req.session.organizationId!,
        },
      });
      if (!existing) return res.status(404).json({ error: "الخطة غير موجودة" });

      const {
        propertyId,
        unitId,
        assignedTechnicianId,
        title,
        category,
        frequencyDays,
        nextDueAt,
        notes,
        isActive,
      } = req.body;

      if (
        propertyId !== undefined &&
        (typeof propertyId !== "string" || !propertyId.trim())
      ) {
        return res.status(400).json({ error: "العقار غير صالح" });
      }
      if (
        unitId !== undefined &&
        unitId !== null &&
        typeof unitId !== "string"
      ) {
        return res.status(400).json({ error: "الوحدة غير صالحة" });
      }
      if (
        assignedTechnicianId !== undefined &&
        assignedTechnicianId !== null &&
        typeof assignedTechnicianId !== "string"
      ) {
        return res.status(400).json({ error: "الفني غير صالح" });
      }
      if (
        title !== undefined &&
        (typeof title !== "string" ||
          title.trim().length < 2 ||
          title.trim().length > 160)
      ) {
        return res.status(400).json({ error: "العنوان غير صالح" });
      }
      if (
        category !== undefined &&
        (typeof category !== "string" ||
          category.trim().length < 2 ||
          category.trim().length > 80)
      ) {
        return res.status(400).json({ error: "التصنيف غير صالح" });
      }
      if (
        frequencyDays !== undefined &&
        (typeof frequencyDays !== "number" ||
          !Number.isInteger(frequencyDays) ||
          frequencyDays <= 0 ||
          frequencyDays > 3650)
      ) {
        return res.status(400).json({ error: "فترة التكرار غير صالحة" });
      }
      const dueDate =
        nextDueAt === undefined ? undefined : parseDate(nextDueAt);
      if (nextDueAt !== undefined && !dueDate) {
        return res.status(400).json({ error: "تاريخ الاستحقاق غير صالح" });
      }
      if (
        notes !== undefined &&
        notes !== null &&
        (typeof notes !== "string" || notes.trim().length > 3000)
      ) {
        return res.status(400).json({ error: "الملاحظات غير صالحة" });
      }
      if (isActive !== undefined && typeof isActive !== "boolean") {
        return res.status(400).json({ error: "حالة الخطة غير صالحة" });
      }

      const finalPropertyId =
        typeof propertyId === "string"
          ? propertyId.trim()
          : existing.propertyId;
      const finalUnitId =
        unitId === undefined
          ? existing.unitId
          : typeof unitId === "string" && unitId.trim()
            ? unitId.trim()
            : null;
      const finalTechnicianId =
        assignedTechnicianId === undefined
          ? existing.assignedTechnicianId
          : typeof assignedTechnicianId === "string" &&
              assignedTechnicianId.trim()
            ? assignedTechnicianId.trim()
            : null;
      const relationError = await validateRelations({
        organizationId: req.session.organizationId!,
        propertyId: finalPropertyId,
        unitId: finalUnitId,
        assignedTechnicianId: finalTechnicianId,
      });
      if (relationError) {
        return res.status(400).json({ error: relationError });
      }

      const plan = await prisma.preventivePlan.update({
        where: { id: existing.id },
        data: {
          ...(propertyId !== undefined && { propertyId: finalPropertyId }),
          ...(unitId !== undefined && { unitId: finalUnitId }),
          ...(assignedTechnicianId !== undefined && {
            assignedTechnicianId: finalTechnicianId,
          }),
          ...(typeof title === "string" && { title: title.trim() }),
          ...(typeof category === "string" && { category: category.trim() }),
          ...(typeof frequencyDays === "number" && { frequencyDays }),
          ...(dueDate && { nextDueAt: dueDate }),
          ...(notes !== undefined && {
            notes: typeof notes === "string" ? notes.trim() || null : null,
          }),
          ...(typeof isActive === "boolean" && { isActive }),
        },
        include: includeRelations,
      });

      await logAction({
        organizationId: req.session.organizationId!,
        actorId: req.session.userId!,
        actorName: req.session.userName!,
        action: "update_preventive_plan",
        entityType: "preventive_plan",
        entityId: existing.id,
        entityLabel: plan.title,
        details: { fields: bodyKeys },
      });

      res.json(fmtPlan(plan));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "خطأ في الخادم" });
    }
  },
);

// DELETE /api/preventive-plans/:id
router.delete(
  "/preventive-plans/:id",
  requireRole("manager"),
  async (req, res) => {
    try {
      const existing = await prisma.preventivePlan.findFirst({
        where: {
          id: req.params.id,
          organizationId: req.session.organizationId!,
        },
      });
      if (!existing) return res.status(404).json({ error: "الخطة غير موجودة" });

      await prisma.preventivePlan.delete({ where: { id: existing.id } });
      await logAction({
        organizationId: req.session.organizationId!,
        actorId: req.session.userId!,
        actorName: req.session.userName!,
        action: "delete_preventive_plan",
        entityType: "preventive_plan",
        entityId: existing.id,
        entityLabel: existing.title,
      });

      res.json({ message: "تم حذف الخطة بنجاح" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "خطأ في الخادم" });
    }
  },
);

// POST /api/preventive-plans/:id/complete
router.post(
  "/preventive-plans/:id/complete",
  requireRole("manager", "technician"),
  async (req, res) => {
    try {
      const existing = await prisma.preventivePlan.findFirst({
        where: {
          id: req.params.id,
          organizationId: req.session.organizationId!,
        },
      });
      if (!existing) return res.status(404).json({ error: "الخطة غير موجودة" });

      if (req.session.userRole === "technician") {
        const profile = await prisma.technicianProfile.findUnique({
          where: { userId: req.session.userId! },
          select: { id: true },
        });
        if (!profile || existing.assignedTechnicianId !== profile.id) {
          return res.status(403).json({ error: "ليس لديك صلاحية إكمال الخطة" });
        }
      }
      if (!existing.isActive) {
        return res
          .status(409)
          .json({ error: "لا يمكن إكمال خطة صيانة غير نشطة" });
      }

      const completedAt = new Date();
      const nextDueAt = new Date(
        completedAt.getTime() + existing.frequencyDays * 24 * 60 * 60 * 1000,
      );
      const plan = await prisma.preventivePlan.update({
        where: { id: existing.id },
        data: { lastCompletedAt: completedAt, nextDueAt },
        include: includeRelations,
      });

      await logAction({
        organizationId: req.session.organizationId!,
        actorId: req.session.userId!,
        actorName: req.session.userName!,
        action: "complete_preventive_plan",
        entityType: "preventive_plan",
        entityId: existing.id,
        entityLabel: existing.title,
        details: { nextDueAt: nextDueAt.toISOString() },
      });

      res.json(fmtPlan(plan));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "خطأ في الخادم" });
    }
  },
);

export default router;
