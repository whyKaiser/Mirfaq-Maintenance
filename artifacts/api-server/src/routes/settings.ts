import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { logAction } from "../lib/audit";

const router = Router();

function fmtOrg(org: {
  id: string; name: string; crNumber: string | null; phone: string | null;
  city: string; brandColor: string; logoUrl: string | null;
}) {
  return {
    id: org.id,
    name: org.name,
    crNumber: org.crNumber,
    phone: org.phone,
    city: org.city,
    brandColor: org.brandColor,
    logoUrl: org.logoUrl,
  };
}

// GET /api/settings
router.get("/settings", requireRole("manager"), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.session.organizationId! },
    });
    if (!org) return res.status(404).json({ error: "المؤسسة غير موجودة" });
    res.json(fmtOrg(org));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// PATCH /api/settings
router.patch("/settings", requireRole("manager"), async (req, res) => {
  try {
    const { name, crNumber, phone, city, brandColor, logoUrl } = req.body as {
      name?: string; crNumber?: string | null; phone?: string | null;
      city?: string; brandColor?: string; logoUrl?: string | null;
    };

    // Validate brand color format
    if (brandColor && !/^#[0-9A-Fa-f]{6}$/.test(brandColor)) {
      return res.status(400).json({ error: "لون غير صالح. استخدم صيغة HEX مثل #0891b2" });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (name?.trim()) data.name = name.trim();
    if (crNumber !== undefined) data.crNumber = crNumber?.trim() || null;
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (city?.trim()) data.city = city.trim();
    if (brandColor) data.brandColor = brandColor;
    if (logoUrl !== undefined) data.logoUrl = logoUrl?.trim() || null;

    const org = await prisma.organization.update({
      where: { id: req.session.organizationId! },
      data,
    });

    await logAction({
      organizationId: req.session.organizationId!,
      actorId: req.session.userId!,
      actorName: req.session.userName!,
      action: "update_settings",
      entityType: "organization",
      entityId: org.id,
      entityLabel: org.name,
    });

    res.json(fmtOrg(org));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
