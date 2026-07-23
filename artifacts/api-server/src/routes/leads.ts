import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();
const recentSubmissions = new Map<string, number>();

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

router.post("/leads", async (req, res) => {
  try {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const previous = recentSubmissions.get(ip) || 0;
    if (now - previous < 30_000) {
      return res.status(429).json({ error: "انتظر قليلًا قبل إرسال طلب آخر" });
    }

    const name = clean(req.body?.name, 100);
    const companyName = clean(req.body?.companyName, 140);
    const phone = clean(req.body?.phone, 30);
    const email = clean(req.body?.email, 160);
    const message = clean(req.body?.message, 1_000);
    const unitsCount = Number(req.body?.unitsCount);

    if (!name || !companyName || !phone) {
      return res.status(400).json({ error: "الاسم واسم المنشأة ورقم الجوال مطلوبة" });
    }
    if (!/^[+\d][\d\s-]{7,20}$/.test(phone)) {
      return res.status(400).json({ error: "رقم الجوال غير صالح" });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "البريد الإلكتروني غير صالح" });
    }

    const lead = await prisma.salesLead.create({
      data: {
        name,
        companyName,
        phone,
        email: email || null,
        message: message || null,
        unitsCount: Number.isFinite(unitsCount) && unitsCount > 0
          ? Math.min(Math.round(unitsCount), 100_000)
          : null,
      },
      select: { id: true },
    });
    recentSubmissions.set(ip, now);
    res.status(201).json({ id: lead.id, message: "تم استلام طلبك بنجاح" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "تعذر إرسال الطلب حاليًا" });
  }
});

export default router;
