import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { logAction } from "../lib/audit";
import { getPlanState } from "../lib/plan-usage";
import { PLANS, PLAN_ORDER, isPlanCode, getPlan } from "../lib/plans";
import { buildMonthlyInvoice, monthStart } from "../lib/billing";

const router = Router();
const INVOICE_STATUSES = new Set(["مسودة", "صادرة", "مدفوعة"]);

function toSar(halalas: number): number {
  return halalas / 100;
}

function fmtInvoice(inv: {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  planCode: string;
  subscriptionHalalas: number;
  maintenanceHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  requestsCount: number;
  status: string;
  issuedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: inv.id,
    periodStart: inv.periodStart.toISOString(),
    periodEnd: inv.periodEnd.toISOString(),
    periodLabel: inv.periodStart.toISOString().slice(0, 7),
    planCode: inv.planCode,
    planName: getPlan(inv.planCode).name,
    subscription: toSar(inv.subscriptionHalalas),
    maintenance: toSar(inv.maintenanceHalalas),
    vat: toSar(inv.vatHalalas),
    total: toSar(inv.totalHalalas),
    requestsCount: inv.requestsCount,
    status: inv.status,
    issuedAt: inv.issuedAt ? inv.issuedAt.toISOString() : null,
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    createdAt: inv.createdAt.toISOString(),
  };
}

// GET /api/plans — public catalogue, used by the pricing page.
router.get("/plans", (_req, res) => {
  res.json(
    PLAN_ORDER.map((code) => {
      const plan = PLANS[code];
      return {
        code: plan.code,
        name: plan.name,
        monthlyPrice: plan.isCustomPriced ? null : toSar(plan.monthlyPriceHalalas),
        isCustomPriced: plan.isCustomPriced,
        maxUnits: plan.maxUnits,
        maxProperties: plan.maxProperties,
        maxManagers: plan.maxManagers,
        maxTechnicians: plan.maxTechnicians,
        features: plan.features,
      };
    }),
  );
});

// GET /api/subscription — current plan, usage and remaining allowance.
router.get("/subscription", requireRole("manager"), async (req, res) => {
  try {
    const state = await getPlanState(req.session.organizationId!);
    if (!state) return res.status(404).json({ error: "المؤسسة غير موجودة" });

    res.json({
      planCode: state.plan.code,
      planName: state.plan.name,
      monthlyPrice: state.plan.isCustomPriced
        ? null
        : toSar(state.plan.monthlyPriceHalalas),
      isCustomPriced: state.plan.isCustomPriced,
      status: state.planStatus,
      renewsAt: state.planRenewsAt,
      usage: state.usage,
      limits: state.limits,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// PATCH /api/subscription — change plan (self-serve upgrade/downgrade).
router.patch("/subscription", requireRole("manager"), async (req, res) => {
  try {
    const { planCode } = req.body as { planCode?: unknown };
    if (!isPlanCode(planCode)) {
      return res.status(400).json({ error: "الباقة غير معروفة" });
    }

    const state = await getPlanState(req.session.organizationId!);
    if (!state) return res.status(404).json({ error: "المؤسسة غير موجودة" });

    // Refuse a downgrade that would leave the org already over the new limits.
    const target = PLANS[planCode];
    const overages: string[] = [];
    if (target.maxUnits !== null && state.usage.units > target.maxUnits) {
      overages.push(`الوحدات (${state.usage.units} من ${target.maxUnits})`);
    }
    if (target.maxProperties !== null && state.usage.properties > target.maxProperties) {
      overages.push(`العقارات (${state.usage.properties} من ${target.maxProperties})`);
    }
    if (target.maxManagers !== null && state.usage.managers > target.maxManagers) {
      overages.push(`المدراء (${state.usage.managers} من ${target.maxManagers})`);
    }
    if (target.maxTechnicians !== null && state.usage.technicians > target.maxTechnicians) {
      overages.push(`الفنيين (${state.usage.technicians} من ${target.maxTechnicians})`);
    }
    if (overages.length > 0) {
      return res.status(409).json({
        error: `لا يمكن التحويل لباقة "${target.name}" لأن الاستخدام الحالي يتجاوزها: ${overages.join("، ")}.`,
      });
    }

    const org = await prisma.organization.update({
      where: { id: req.session.organizationId! },
      data: {
        planCode: target.code,
        planStartedAt: new Date(),
        planStatus: "نشط",
      },
    });

    await logAction({
      organizationId: org.id,
      actorId: req.session.userId!,
      actorName: req.session.userName!,
      action: "change_plan",
      entityType: "organization",
      entityId: org.id,
      entityLabel: org.name,
      details: { from: state.plan.code, to: target.code },
    });

    res.json({ planCode: org.planCode, planName: target.name, status: org.planStatus });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/invoices
router.get("/invoices", requireRole("manager"), async (req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: req.session.organizationId! },
      orderBy: { periodStart: "desc" },
      take: 24,
    });
    res.json(invoices.map(fmtInvoice));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// POST /api/invoices — build (or refresh) the draft invoice for a month.
// Body: { month?: "YYYY-MM" } — defaults to the current month.
router.post("/invoices", requireRole("manager"), async (req, res) => {
  try {
    const { month } = req.body as { month?: unknown };
    let monthDate = new Date();
    if (month !== undefined) {
      if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: "صيغة الشهر غير صالحة، استخدم YYYY-MM" });
      }
      monthDate = new Date(`${month}-01T00:00:00.000Z`);
      if (Number.isNaN(monthDate.getTime())) {
        return res.status(400).json({ error: "صيغة الشهر غير صالحة، استخدم YYYY-MM" });
      }
    }

    const invoice = await buildMonthlyInvoice(
      req.session.organizationId!,
      monthStart(monthDate),
    );
    res.status(201).json(fmtInvoice(invoice));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// PATCH /api/invoices/:id — move an invoice through مسودة → صادرة → مدفوعة.
router.patch("/invoices/:id", requireRole("manager"), async (req, res) => {
  try {
    const { status } = req.body as { status?: unknown };
    if (typeof status !== "string" || !INVOICE_STATUSES.has(status)) {
      return res.status(400).json({ error: "حالة الفاتورة غير صالحة" });
    }

    const existing = await prisma.invoice.findFirst({
      where: { id: req.params.id, organizationId: req.session.organizationId! },
    });
    if (!existing) return res.status(404).json({ error: "الفاتورة غير موجودة" });

    const invoice = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        status,
        ...(status === "صادرة" && !existing.issuedAt ? { issuedAt: new Date() } : {}),
        ...(status === "مدفوعة"
          ? { paidAt: new Date(), issuedAt: existing.issuedAt ?? new Date() }
          : {}),
      },
    });

    await logAction({
      organizationId: req.session.organizationId!,
      actorId: req.session.userId!,
      actorName: req.session.userName!,
      action: "update_invoice_status",
      entityType: "invoice",
      entityId: invoice.id,
      entityLabel: invoice.periodStart.toISOString().slice(0, 7),
      details: { from: existing.status, to: status },
    });

    res.json(fmtInvoice(invoice));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
