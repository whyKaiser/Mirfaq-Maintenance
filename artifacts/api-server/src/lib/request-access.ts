import { prisma } from "./prisma";

export type MaintenanceRequestActor = {
  organizationId: string;
  userId: string;
  role: string;
};

export type MaintenanceRequestAccessDecision =
  | {
      decision: "allowed";
      request: {
        id: string;
        title: string;
        residentId: string;
        technician: { userId: string } | null;
      };
    }
  | {
      decision: "forbidden";
      request: {
        id: string;
        title: string;
        residentId: string;
        technician: { userId: string } | null;
      };
    }
  | { decision: "not-found"; request: null };

/**
 * Central authorization rule for a maintenance request.
 *
 * The organization filter is applied in the database query. Managers can
 * access any request in their organization, residents can access requests
 * recorded under their account, and technicians can access only
 * requests assigned to their technician profile.
 */
export async function getMaintenanceRequestAccess(
  actor: MaintenanceRequestActor,
  requestId: string,
): Promise<MaintenanceRequestAccessDecision> {
  const request = await prisma.maintenanceRequest.findFirst({
    where: {
      id: requestId,
      organizationId: actor.organizationId,
    },
    select: {
      id: true,
      title: true,
      residentId: true,
      technician: { select: { userId: true } },
    },
  });

  if (!request) {
    return { decision: "not-found", request: null };
  }

  const allowed =
    actor.role === "manager" ||
    (actor.role === "resident" && request.residentId === actor.userId) ||
    (actor.role === "technician" &&
      request.technician?.userId === actor.userId);

  if (!allowed) {
    return { decision: "forbidden", request };
  }

  return { decision: "allowed", request };
}
