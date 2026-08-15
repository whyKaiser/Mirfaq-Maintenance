import { Router } from "express";
import bcrypt from "bcryptjs";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { logAction } from "../lib/audit";
import { getPasswordPolicyError } from "../lib/password-policy";
import { checkLimit } from "../lib/plan-usage";

const router = Router();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtUser(u: any) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    unitId: u.residentUnit?.id ?? null,
    unitNumber: u.residentUnit?.number ?? null,
    specialty: u.technicianProfile?.specialty ?? null,
    techPhone: u.technicianProfile?.phone ?? null,
  };
}

// GET /api/users  (manager-only, all residents + technicians in org)
router.get("/users", requireRole("manager"), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        organizationId: req.session.organizationId!,
        role: { in: ["resident", "technician"] },
      },
      include: {
        residentUnit: { select: { id: true, number: true } },
        technicianProfile: { select: { specialty: true, phone: true } },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    res.json(users.map(fmtUser));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/users  (create resident or technician)
router.post("/users", requireRole("manager"), async (req, res) => {
  try {
    const { name, email, phone, password, role, specialty, unitId } = req.body as {
      name?: string; email?: string; phone?: string; password?: string;
      role?: string; specialty?: string; unitId?: string;
    };

    if (!name?.trim() || !email?.trim() || !password || !role) {
      return res.status(400).json({ error: "الاسم والبريد والكلمة السرية والدور مطلوبة" });
    }
    if (!["resident", "technician"].includes(role)) {
      return res.status(400).json({ error: "الدور يجب أن يكون ساكن أو فني" });
    }
    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }
    if (role === "technician" && !specialty?.trim()) {
      return res.status(400).json({ error: "التخصص مطلوب للفني" });
    }

    if (role === "technician") {
      const limit = await checkLimit(req.session.organizationId!, "technicians");
      if (!limit.allowed) {
        return res
          .status(402)
          .json({ error: limit.message, limit: limit.limit, current: limit.current });
      }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: "البريد الإلكتروني مستخدم بالفعل" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        passwordHash,
        role,
        isActive: true,
        organizationId: req.session.organizationId!,
      },
      include: {
        residentUnit: { select: { id: true, number: true } },
        technicianProfile: { select: { specialty: true, phone: true } },
      },
    });

    if (role === "technician") {
      await prisma.technicianProfile.create({
        data: {
          userId: user.id,
          specialty: specialty!.trim(),
          phone: phone?.trim() || null,
        },
      });
    }

    if (role === "resident" && unitId) {
      // Verify unit belongs to org and is unoccupied
      const unit = await prisma.unit.findFirst({
        where: { id: unitId },
        include: { property: { select: { organizationId: true } } },
      });
      if (unit && unit.property.organizationId === req.session.organizationId && !unit.residentId) {
        await prisma.unit.update({ where: { id: unitId }, data: { residentId: user.id } });
      }
    }

    await logAction({
      organizationId: req.session.organizationId!,
      actorId: req.session.userId!,
      actorName: req.session.userName!,
      action: "create_user",
      entityType: "user",
      entityId: user.id,
      entityLabel: `${user.name} (${role === "resident" ? "ساكن" : "فني"})`,
    });

    // Re-fetch with updated relations (technician profile, unit)
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        residentUnit: { select: { id: true, number: true } },
        technicianProfile: { select: { specialty: true, phone: true } },
      },
    });
    res.status(201).json(fmtUser(fresh));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// PATCH /api/users/:id
router.patch("/users/:id", requireRole("manager"), async (req, res) => {
  try {
    const orgId = req.session.organizationId!;
    const target = await prisma.user.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      include: {
        residentUnit: { select: { id: true } },
        technicianProfile: { select: { id: true } },
      },
    });
    if (!target) return res.status(404).json({ error: "المستخدم غير موجود" });

    const { name, phone, email, isActive, specialty, unitId, password } = req.body as {
      name?: string; phone?: string | null; email?: string;
      isActive?: boolean; specialty?: string; unitId?: string | null; password?: string;
    };

    // Prevent deactivating own account
    if (isActive === false && req.params.id === req.session.userId) {
      return res.status(400).json({ error: "لا يمكنك تعطيل حسابك الخاص" });
    }

    // Check unique email
    if (email && email !== target.email) {
      const dup = await prisma.user.findUnique({ where: { email } });
      if (dup) return res.status(400).json({ error: "البريد الإلكتروني مستخدم بالفعل" });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (name?.trim()) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (email?.trim()) updateData.email = email.trim().toLowerCase();
    if (typeof isActive === "boolean") updateData.isActive = isActive;
    if (password !== undefined) {
      const passwordError = getPasswordPolicyError(password);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data: updateData });

    // Update technician specialty
    if (target.role === "technician" && specialty?.trim() && target.technicianProfile) {
      await prisma.technicianProfile.update({
        where: { userId: target.id },
        data: { specialty: specialty.trim() },
      });
    }

    // Re-assign resident unit
    if (target.role === "resident" && unitId !== undefined) {
      // Unassign from current unit
      if (target.residentUnit) {
        await prisma.unit.update({ where: { id: target.residentUnit.id }, data: { residentId: null } });
      }
      // Assign to new unit
      if (unitId) {
        const newUnit = await prisma.unit.findFirst({
          where: { id: unitId },
          include: { property: { select: { organizationId: true } } },
        });
        if (newUnit && newUnit.property.organizationId === orgId) {
          await prisma.unit.update({ where: { id: unitId }, data: { residentId: user.id } });
        }
      }
    }

    // Audit isActive changes
    if (typeof isActive === "boolean" && isActive !== target.isActive) {
      await logAction({
        organizationId: orgId,
        actorId: req.session.userId!,
        actorName: req.session.userName!,
        action: isActive ? "activate_user" : "deactivate_user",
        entityType: "user",
        entityId: target.id,
        entityLabel: target.name,
      });
    }

    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        residentUnit: { select: { id: true, number: true } },
        technicianProfile: { select: { specialty: true, phone: true } },
      },
    });
    res.json(fmtUser(fresh));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
