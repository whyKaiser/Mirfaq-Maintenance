import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { maintenanceAdvice } from './maintenance-advice';

export async function safetyContext(db: Prisma.TransactionClient, organizationId: string, requestId: string) {
  const ticket = await db.maintenanceRequest.findFirst({ where: { id: requestId, organizationId }, select: { id: true, title: true, description: true, updatedAt: true } });
  if (!ticket) return null;
  const [order, intakes] = await Promise.all([
    db.agentOrder.findFirst({ where: { organizationId, requestId }, select: { id: true, revision: true, createdAt: true } }),
    db.agentIntake.findMany({ where: { organizationId, requestId }, orderBy: { id: 'asc' }, select: { id: true, state: true, factsJson: true, updatedAt: true } }),
  ]);
  const risk = maintenanceAdvice(ticket.title, ticket.description).state === 'escalate' || intakes.some(i => i.state === 'escalate');
  const fingerprint = createHash('sha256').update(JSON.stringify({ ticket: { id: ticket.id, title: ticket.title, description: ticket.description }, intakes })).digest('hex');
  return { fingerprint, risk, order, orderRevision: order?.revision ?? null, requestVersion: ticket.updatedAt };
}
export async function activeSafetyReview(db: Prisma.TransactionClient, organizationId: string, requestId: string) {
  if (process.env.NODE_ENV === 'production' || process.env.MIRFAQ_AUTONOMY_DEMO !== '1' || organizationId !== 'org-demo') return null;
  const context = await safetyContext(db, organizationId, requestId);
  if (!context?.risk) return null;
  const review = await db.agentSafetyReview.findFirst({ where: { organizationId, requestId, fingerprint: context.fingerprint, state: 'reassessed', expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  if (!review || review.requestVersion.getTime() !== context.requestVersion.getTime()) return null;
  const valid = review.orderId ? context.order?.id === review.orderId && context.order.revision === review.orderRevision : !context.order || (context.order.revision === 0 && context.order.createdAt.getTime() >= review.createdAt.getTime());
  return valid ? review : null;
}
export async function safetyReassessed(db: Prisma.TransactionClient, organizationId: string, requestId: string) {
  return !!await activeSafetyReview(db, organizationId, requestId);
}
export async function safetyReplanReceiptValid(db: Prisma.TransactionClient, organizationId: string, requestId: string, orderId: string, revision: number, reviewId: string | null) {
  if (!reviewId || process.env.NODE_ENV === 'production' || process.env.MIRFAQ_AUTONOMY_DEMO !== '1' || organizationId !== 'org-demo') return false;
  const context = await safetyContext(db, organizationId, requestId);
  if (!context?.risk || context.order?.id !== orderId || context.orderRevision !== revision) return false;
  const review = await db.agentSafetyReview.findFirst({ where: { id: reviewId, organizationId, requestId, fingerprint: context.fingerprint, orderId, state: 'reassessed', expiresAt: { gt: new Date() } } });
  return review?.orderRevision != null && review.orderRevision + 1 === revision;
}

// A receipt permits inspection of a committed assignment only; it cannot authorize another action.
export async function safetyAssignmentReceipt(db: Prisma.TransactionClient, organizationId: string, requestId: string, orderId: string, reviewId?: string | null) {
  if (process.env.NODE_ENV === 'production' || process.env.MIRFAQ_AUTONOMY_DEMO !== '1' || organizationId !== 'org-demo') return false;
  const context = await safetyContext(db, organizationId, requestId);
  if (!context?.risk || context.order?.id !== orderId) return false;
  const receipt = await db.agentSafetyReview.findFirst({ where: { ...(reviewId ? { id: reviewId } : {}), organizationId, requestId, orderId, fingerprint: context.fingerprint, state: 'assignment_consumed', expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  return !!receipt && receipt.orderRevision === context.orderRevision && receipt.requestVersion.getTime() === context.requestVersion.getTime();
}
