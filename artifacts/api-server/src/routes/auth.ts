import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import {
  commitLoginFailure,
  completeLoginSuccess,
  reserveLoginAttempt,
  rollbackLoginAttempt,
  type LoginAttemptReservation,
} from "../lib/login-rate-limit";

const router = Router();

function regenerateSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

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
  let reservation: LoginAttemptReservation | undefined;

  try {
    const { email, password } = req.body as { email?: string; password?: string };
    const rateLimit = reserveLoginAttempt(req, email);
    if (rateLimit.limited) {
      res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      return res.status(429).json({ error: "محاولات دخول كثيرة. حاول مرة أخرى لاحقًا." });
    }
    reservation = rateLimit.reservation;

    if (!email || !password) {
      commitLoginFailure(reservation);
      return res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { residentUnit: { select: { id: true } }, organization: { select: { name: true, brandColor: true } } },
    });
    if (!user) {
      commitLoginFailure(reservation);
      return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    }
    if (!user.isActive) {
      commitLoginFailure(reservation);
      return res.status(401).json({ error: "الحساب معطل. تواصل مع المدير." });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      commitLoginFailure(reservation);
      return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    req.session.organizationId = user.organizationId;
    req.session.organizationName = user.organization.name;

    await saveSession(req);
    completeLoginSuccess(reservation);
    res.json(buildUserResponse(user, user.organization));
  } catch (err) {
    if (reservation) rollbackLoginAttempt(reservation);
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
