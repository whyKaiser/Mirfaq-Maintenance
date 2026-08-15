/**
 * Plan usage counting and limit checks.
 *
 * Counts are derived from live data (no counters to drift), and every check is
 * scoped to a single organization.
 */

import { prisma } from "./prisma";
import { getPlan, type PlanDefinition } from "./plans";

export type LimitedResource =
  | "units"
  | "properties"
  | "managers"
  | "technicians";

export interface UsageSnapshot {
  units: number;
  properties: number;
  managers: number;
  technicians: number;
}

export interface PlanState {
  plan: PlanDefinition;
  planStatus: string;
  planRenewsAt: string | null;
  usage: UsageSnapshot;
  limits: Record<LimitedResource, number | null>;
}

const RESOURCE_LABELS: Record<LimitedResource, string> = {
  units: "الوحدات",
  properties: "العقارات",
  managers: "المدراء",
  technicians: "الفنيين",
};

export async function getUsage(organizationId: string): Promise<UsageSnapshot> {
  const [properties, units, managers, technicians] = await Promise.all([
    prisma.property.count({ where: { organizationId } }),
    prisma.unit.count({ where: { property: { organizationId } } }),
    prisma.user.count({
      where: { organizationId, role: "manager", isActive: true },
    }),
    prisma.user.count({
      where: { organizationId, role: "technician", isActive: true },
    }),
  ]);
  return { properties, units, managers, technicians };
}

function limitsOf(plan: PlanDefinition): Record<LimitedResource, number | null> {
  return {
    units: plan.maxUnits,
    properties: plan.maxProperties,
    managers: plan.maxManagers,
    technicians: plan.maxTechnicians,
  };
}

export async function getPlanState(organizationId: string): Promise<PlanState | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planCode: true, planStatus: true, planRenewsAt: true },
  });
  if (!org) return null;

  const plan = getPlan(org.planCode);
  return {
    plan,
    planStatus: org.planStatus,
    planRenewsAt: org.planRenewsAt ? org.planRenewsAt.toISOString() : null,
    usage: await getUsage(organizationId),
    limits: limitsOf(plan),
  };
}

export interface LimitCheck {
  allowed: boolean;
  limit: number | null;
  current: number;
  message?: string;
}

/**
 * Checks whether one more `resource` can be added under the org's plan.
 */
export async function checkLimit(
  organizationId: string,
  resource: LimitedResource,
): Promise<LimitCheck> {
  const state = await getPlanState(organizationId);
  if (!state) {
    return { allowed: false, limit: null, current: 0, message: "المؤسسة غير موجودة" };
  }

  const limit = state.limits[resource];
  const current = state.usage[resource];

  if (limit === null) return { allowed: true, limit, current };
  if (current < limit) return { allowed: true, limit, current };

  return {
    allowed: false,
    limit,
    current,
    message: `وصلت للحد الأقصى من ${RESOURCE_LABELS[resource]} في باقة "${state.plan.name}" (${limit}). رقِّ الباقة للمتابعة.`,
  };
}
