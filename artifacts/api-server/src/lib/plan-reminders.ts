/**
 * Preventive-maintenance reminders.
 *
 * Scans active plans whose next due date falls inside the reminder window and
 * notifies the organization's managers plus the assigned technician. A plan is
 * reminded at most once per day: before notifying we look for a notification
 * of type "plan_due" created for that plan in the last 24 hours.
 */

import { prisma } from "./prisma";
import { notify, organizationManagerIds, technicianUserId } from "./notify";
import { logger } from "./logger";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REMINDER_WINDOW_DAYS = 3;

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function runPlanReminders(now: Date = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + REMINDER_WINDOW_DAYS * DAY_MS);
  const since = new Date(now.getTime() - DAY_MS);

  const plans = await prisma.preventivePlan.findMany({
    where: { isActive: true, nextDueAt: { lte: horizon } },
    include: {
      property: { select: { name: true } },
      unit: { select: { number: true } },
    },
  });

  let sent = 0;
  for (const plan of plans) {
    const alreadyReminded = await prisma.notification.findFirst({
      where: {
        organizationId: plan.organizationId,
        type: "plan_due",
        entityId: plan.id,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (alreadyReminded) continue;

    const overdue = plan.nextDueAt.getTime() < now.getTime();
    const location = plan.unit
      ? `${plan.property.name} — وحدة ${plan.unit.number}`
      : plan.property.name;

    await notify({
      organizationId: plan.organizationId,
      userIds: [
        ...(await organizationManagerIds(plan.organizationId)),
        await technicianUserId(plan.assignedTechnicianId),
      ],
      type: "plan_due",
      title: overdue
        ? `صيانة وقائية متأخرة: ${plan.title}`
        : `صيانة وقائية قريبة: ${plan.title}`,
      body: `${location} · تاريخ الاستحقاق ${formatDate(plan.nextDueAt)}`,
      entityType: "plan",
      entityId: plan.id,
    });
    sent += 1;
  }

  return sent;
}

/**
 * Starts the hourly reminder loop. Returns a stop function so tests and
 * graceful shutdown can clear the timer.
 */
export function startPlanReminders(intervalMs = 60 * 60 * 1000): () => void {
  const tick = () => {
    runPlanReminders().catch((err) => {
      logger.error({ err }, "[plan-reminders] run failed");
    });
  };

  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
