/**
 * Notification service.
 *
 * Creates in-app notifications and hands them to the outbound channels
 * (email / webhook) defined in ./notify-channels.
 *
 * Every function here is fire-and-forget from the caller's point of view:
 * failures are logged and swallowed so a notification problem never fails
 * the maintenance action that triggered it.
 */

import { prisma } from "./prisma";
import { dispatchOutbound } from "./notify-channels";
import { logger } from "./logger";

export type NotificationType =
  | "request_created"
  | "request_assigned"
  | "request_status_changed"
  | "request_commented"
  | "request_rated"
  | "plan_due";

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  request_created: "بلاغ جديد",
  request_assigned: "إسناد بلاغ",
  request_status_changed: "تحديث حالة بلاغ",
  request_commented: "تعليق جديد",
  request_rated: "تقييم بلاغ",
  plan_due: "صيانة وقائية مستحقة",
};

export interface NotifyParams {
  organizationId: string;
  /** Users to notify. Duplicates and empty values are ignored. */
  userIds: (string | null | undefined)[];
  type: NotificationType;
  title: string;
  body: string;
  entityType?: "request" | "plan";
  entityId?: string;
  /** Actor who caused the event — never notified about their own action. */
  actorId?: string;
}

export async function notify(params: NotifyParams): Promise<void> {
  try {
    const recipients = [
      ...new Set(
        params.userIds.filter(
          (id): id is string => Boolean(id) && id !== params.actorId,
        ),
      ),
    ];
    if (recipients.length === 0) return;

    const users = await prisma.user.findMany({
      where: {
        id: { in: recipients },
        organizationId: params.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        notifyInApp: true,
        notifyEmail: true,
      },
    });

    const inApp = users.filter((user) => user.notifyInApp);
    if (inApp.length > 0) {
      await prisma.notification.createMany({
        data: inApp.map((user) => ({
          organizationId: params.organizationId,
          userId: user.id,
          type: params.type,
          title: params.title,
          body: params.body,
          entityType: params.entityType ?? null,
          entityId: params.entityId ?? null,
        })),
      });
    }

    const outbound = users.filter((user) => user.notifyEmail);
    for (const user of outbound) {
      void dispatchOutbound({
        to: user.email,
        name: user.name,
        type: params.type,
        title: params.title,
        body: params.body,
      });
    }
  } catch (err) {
    logger.error({ err }, "[notify] failed to create notifications");
  }
}

/** Managers of an organization — the default audience for most events. */
export async function organizationManagerIds(
  organizationId: string,
): Promise<string[]> {
  const managers = await prisma.user.findMany({
    where: { organizationId, role: "manager", isActive: true },
    select: { id: true },
  });
  return managers.map((manager) => manager.id);
}

/** The user account behind a technician profile, if any. */
export async function technicianUserId(
  technicianId: string | null | undefined,
): Promise<string | null> {
  if (!technicianId) return null;
  const profile = await prisma.technicianProfile.findUnique({
    where: { id: technicianId },
    select: { userId: true },
  });
  return profile?.userId ?? null;
}
