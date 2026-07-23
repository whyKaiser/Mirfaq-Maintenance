import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

function buildUserResponse(user: {
  id: string; name: string; email: string; phone: string | null;
  role: string; isActive: boolean; organizationId: string;
  residentUnit: { id: string } | null;
}, org: { name: string; brandColor: string }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    unitId: user.residentUnit?.id ?? null,
    organizationId: user.organizationId,
    organizationName: org.name,
    brandColor: org.brandColor,
  };
}

// GET /api/auth/me
router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId! },
      include: { residentUnit: { select: { id: true } }, organization: { select: { name: true, brandColor: true } } },
    });
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "غير مصرح" });
    }
    if (!user.isActive) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "الحساب معطل. تواصل مع المدير." });
    }
    res.json(buildUserResponse(user, user.organization));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { residentUnit: { select: { id: true } }, organization: { select: { name: true, brandColor: true } } },
    });
    if (!user) {
      return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    }
    if (!user.isActive) {
      return res.status(401).json({ error: "الحساب معطل. تواصل مع المدير." });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    }

    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    req.session.organizationId = user.organizationId;
    req.session.organizationName = user.organization.name;

    res.json(buildUserResponse(user, user.organization));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/auth/logout
router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ message: "تم تسجيل الخروج بنجاح" });
  });
});

export default router;
