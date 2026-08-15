/**
 * Invoice building.
 *
 * A monthly invoice combines the subscription fee for the organization's plan
 * with the maintenance costs (labour + parts) recorded on requests that were
 * last updated inside the period, then adds VAT.
 */

import { prisma } from "./prisma";
import { getPlan, VAT_RATE } from "./plans";

export interface InvoiceTotals {
  subscriptionHalalas: number;
  maintenanceHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  requestsCount: number;
}

/** First instant of the month containing `date`, in UTC. */
export function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** First instant of the following month, in UTC (exclusive period end). */
export function monthEnd(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

export async function computeTotals(
  organizationId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<InvoiceTotals> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planCode: true },
  });
  const plan = getPlan(org?.planCode ?? "tajribi");

  const completed = await prisma.maintenanceRequest.findMany({
    where: {
      organizationId,
      status: "مكتملة",
      updatedAt: { gte: periodStart, lt: periodEnd },
    },
    select: { laborCostHalalas: true, partsCostHalalas: true },
  });

  const maintenanceHalalas = completed.reduce(
    (sum, r) => sum + r.laborCostHalalas + r.partsCostHalalas,
    0,
  );
  const subscriptionHalalas = plan.isCustomPriced ? 0 : plan.monthlyPriceHalalas;
  const net = subscriptionHalalas + maintenanceHalalas;
  const vatHalalas = Math.round(net * VAT_RATE);

  return {
    subscriptionHalalas,
    maintenanceHalalas,
    vatHalalas,
    totalHalalas: net + vatHalalas,
    requestsCount: completed.length,
  };
}

/**
 * Creates or refreshes the draft invoice for the given month. Invoices that
 * have already been issued or paid are returned untouched.
 */
export async function buildMonthlyInvoice(
  organizationId: string,
  monthDate: Date,
) {
  const periodStart = monthStart(monthDate);
  const periodEnd = monthEnd(monthDate);

  const existing = await prisma.invoice.findUnique({
    where: { organizationId_periodStart: { organizationId, periodStart } },
  });
  if (existing && existing.status !== "مسودة") {
    return existing;
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planCode: true },
  });
  const totals = await computeTotals(organizationId, periodStart, periodEnd);
  const data = {
    organizationId,
    periodStart,
    periodEnd,
    planCode: org?.planCode ?? "tajribi",
    ...totals,
  };

  if (existing) {
    return prisma.invoice.update({ where: { id: existing.id }, data });
  }
  return prisma.invoice.create({ data });
}
