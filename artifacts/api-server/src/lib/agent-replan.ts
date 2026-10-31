import { createHash } from 'node:crypto';
import { prisma } from './prisma';
import { reportHash, technicianMatchesIssue, type Actor } from './agent-workflow';
import { maintenanceAdvice } from './maintenance-advice';
import { activeSafetyReview, safetyAssignmentReceipt } from './agent-safety';

export type ReplanReason = 'technician_absent' | 'availability_changed' | 'workload_limit';
// The context token is bound by the server's validated recovery snapshot, not model arguments.
export type RecoverySelection = { technicianId: string; contextToken: string };
const hash = (orderId: string, reason: ReplanReason, expectedRevision: number) => createHash('sha256').update(JSON.stringify({ orderId, reason, expectedRevision })).digest('hex');

/** One bounded refresh and selection. Never creates another order. */
export async function replanOrder(actor: Actor, orderId: string, reason: ReplanReason, expectedRevision: number, key: string, requireRecordedAbsence = false, selection?: RecoverySelection) {
  if (actor.role !== 'manager') throw new Error('forbidden');
  const selectionEnabled = () => actor.organizationId === 'org-demo' && process.env.NODE_ENV !== 'production' && process.env.MIRFAQ_AUTONOMY_DEMO === '1' && process.env.MIRFAQ_AGENT_DEMO_ONLY === '1';
  if (selection) {
    if (!selectionEnabled()) return { state: 'disabled' as const };
    if (typeof selection.technicianId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(selection.technicianId) || typeof selection.contextToken !== 'string' || !/^[a-f0-9]{64}$/.test(selection.contextToken)) return { state: 'review' as const };
    requireRecordedAbsence = true;
  }
  const active = await prisma.user.findFirst({ where: { id: actor.userId, organizationId: actor.organizationId, role: 'manager', isActive: true }, select: { id: true } });
  if (!active) return { state: 'forbidden' as const };
  const baseHash = requireRecordedAbsence ? createHash('sha256').update(`followup:${hash(orderId, reason, expectedRevision)}`).digest('hex') : hash(orderId, reason, expectedRevision);
  const inputHash = selection ? createHash('sha256').update(JSON.stringify({ mode: 'model_recovery', baseHash, technicianId: selection.technicianId, contextToken: selection.contextToken })).digest('hex') : baseHash;
  async function readResult() {
    const command = await prisma.agentCommand.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: key } } });
    if (!command) return null;
    if (command.inputHash !== inputHash || command.orderId !== orderId) return { state: 'key_conflict' as const };
    const order = await prisma.agentOrder.findFirst({ where: { id: orderId, organizationId: actor.organizationId } });
    const request = order && await prisma.maintenanceRequest.findFirst({ where: { id: order.requestId, organizationId: actor.organizationId }, select: { technicianId: true, status: true, title: true, description: true } });
    const risk = order && await prisma.agentIntake.findFirst({ where: { organizationId: actor.organizationId, requestId: order.requestId, state: 'escalate' }, select: { id: true } });
    if (selection && (risk || (request && maintenanceAdvice(request.title, request.description).state === 'escalate'))) return { state: 'escalate' as const, nextStep: 'مؤشر خطر؛ مسار التعافي بالنموذج لا ينفذ إسنادًا لهذه الحالة.' };
    if ((risk || (request && maintenanceAdvice(request.title, request.description).state === 'escalate')) && !(order && command.resultState === 'reassigned' && command.safetyReviewId && await safetyAssignmentReceipt(prisma, actor.organizationId, order.requestId, order.id, command.safetyReviewId))) return { state: 'escalate' as const, nextStep: 'ظهر مؤشر خطر؛ راجع المسؤول قبل الإسناد.' };
    if (order && request && reportHash(request.title, request.description) !== order.reportHash) return { state: 'inconsistent' as const };
    if (!order || !request || request.technicianId !== order.technicianId || request.status !== 'قيد التنفيذ' || (command.resultState === 'reassigned' && (order.technicianId !== command.technicianId || order.state !== 'assigned')) || (command.resultState === 'escalate' && order.state !== 'blocked')) return { state: 'inconsistent' as const };
    return { state: command.resultState, order, replay: true };
  }
  const prior = await readResult();
  if (prior) return prior;
  try {
    const result = await prisma.$transaction(async tx => {
      if (selection && !selectionEnabled()) return { state: 'disabled' };
      const currentActor = await tx.user.findFirst({ where: { id: actor.userId, organizationId: actor.organizationId, role: 'manager', isActive: true }, select: { id: true } });
      if (!currentActor) return { state: 'forbidden' };
      const order = await tx.agentOrder.findFirst({ where: { id: orderId, organizationId: actor.organizationId } });
      if (!order) return { state: 'not_found' };
      if (order.revision !== expectedRevision) return { state: 'stale', nextStep: 'أعد قراءة الأمر قبل إعادة التخطيط.' };
      if (requireRecordedAbsence && (order.state !== 'blocked' || order.blocker !== 'technician_absent')) return { state: 'review' };
      if (order.state !== 'assigned' && !(order.state === 'blocked' && order.blocker === 'technician_absent')) return { state: 'review' };
      const ticket = await tx.maintenanceRequest.findFirst({ where: { id: order.requestId, organizationId: actor.organizationId }, select: { title: true, description: true, technicianId: true, status: true } });
      const risk = await tx.agentIntake.findFirst({ where: { organizationId: actor.organizationId, requestId: order.requestId, state: 'escalate' }, select: { id: true } });
      if (!ticket) return { state: 'review' };
      if (ticket.technicianId !== order.technicianId || ticket.status !== 'قيد التنفيذ') return { state: 'review' };
      if (selection && (risk || maintenanceAdvice(ticket.title, ticket.description).state === 'escalate')) return { state: 'review', nextStep: 'مؤشر خطر؛ يلزم مسار مراجعة المسؤول دون إعادة إسناد بالنموذج.' };
      const safetyReview = risk || maintenanceAdvice(ticket.title, ticket.description).state === 'escalate' ? await activeSafetyReview(tx, actor.organizationId, order.requestId) : null;
      if ((risk || maintenanceAdvice(ticket.title, ticket.description).state === 'escalate') && !safetyReview) return { state: 'review', nextStep: 'مؤشر خطر يحتاج تصعيد المسؤول قبل الإسناد.' };
      if (reportHash(ticket.title, ticket.description) !== order.reportHash) return { state: 'review', nextStep: 'تغير البلاغ؛ أعد التقييم قبل الإسناد.' };
      const [policy, availability] = await Promise.all([
        tx.agentDemoPolicy.findUnique({ where: { organizationId: actor.organizationId } }),
        tx.agentAvailability.findMany({ where: { organizationId: actor.organizationId, available: true, updatedAt: { gte: new Date(Date.now() - 8 * 60 * 60 * 1000) }, technicianId: { not: order.technicianId } }, select: { technicianId: true } }),
      ]);
      if (requireRecordedAbsence) {
        let allowed: unknown;
        try { allowed = policy && JSON.parse(policy.issueCodesJson); } catch { return { state: 'review' }; }
        if (!policy?.enabled || !Array.isArray(allowed) || !allowed.includes(order.issueCode)) return { state: 'review' };
      }
      const profiles = policy ? await tx.technicianProfile.findMany({ where: { id: { in: availability.map(a => a.technicianId) }, user: { organizationId: actor.organizationId, isActive: true, role: 'technician' } }, include: { _count: { select: { requests: { where: { organizationId: actor.organizationId, status: { not: 'مكتملة' } } } } } } }) : [];
      const candidates = profiles.filter(t => technicianMatchesIssue(order.issueCode, t.specialty) && t._count.requests < (policy?.maxWorkload ?? 0)).sort((a, b) => a._count.requests - b._count.requests || a.id.localeCompare(b.id));
      const chosen = selection ? candidates.find(t => t.id === selection.technicianId) : candidates[0];
      // A model-proposed choice is exact. Never substitute a different technician silently.
      if (selection && !chosen) return { state: 'review', nextStep: 'الفني المقترح لم يعد مؤهلًا ومتاحًا ضمن حد العبء؛ أعد قراءة السياق.' };
      const nextState = chosen ? 'reassigned' : 'escalate';
      const changed = await tx.agentOrder.updateMany({ where: { id: order.id, organizationId: actor.organizationId, technicianId: order.technicianId, state: order.state, revision: expectedRevision }, data: chosen ? { technicianId: chosen.id, state: 'assigned', revision: { increment: 1 }, deliveryState: 'not_confirmed', blocker: null, nextStep: 'تحقق من استلام الفني البديل ومتابعة العمل.' } : { state: 'blocked', revision: { increment: 1 }, blocker: 'technician_absent', nextStep: 'لا يوجد بديل متاح ومؤهل دون حد العبء؛ صعّد للمسؤول.' } });
      if (changed.count !== 1) throw new Error('concurrent_change');
      if (chosen) {
        const request = await tx.maintenanceRequest.updateMany({ where: { id: order.requestId, organizationId: actor.organizationId, technicianId: order.technicianId, status: 'قيد التنفيذ' }, data: { technicianId: chosen.id } });
        if (request.count !== 1) throw new Error('request_changed');
      }
      if (chosen && safetyReview) {
        const assignedRequest = await tx.maintenanceRequest.findFirstOrThrow({ where: { id: order.requestId, organizationId: actor.organizationId }, select: { updatedAt: true } });
        await tx.agentSafetyReview.update({ where: { id: safetyReview.id }, data: { state: 'assignment_consumed', orderId: order.id, orderRevision: expectedRevision + 1, requestVersion: assignedRequest.updatedAt } });
      }
      await tx.agentEvent.create({ data: { organizationId: actor.organizationId, orderId: order.id, actorId: actor.userId, action: 'replan', reason, outcome: nextState } });
      await tx.agentCommand.create({ data: { organizationId: actor.organizationId, orderId: order.id, idempotencyKey: key, inputHash, resultState: nextState, technicianId: chosen?.id ?? null, safetyReviewId: safetyReview?.id ?? null } });
      return { state: nextState };
    });
    if (result.state !== 'reassigned' && result.state !== 'escalate') return result;
    const saved = await readResult();
    return saved ? { ...saved, replay: false } : { state: 'unknown' };
  } catch {
    const saved = await readResult();
    if (saved) return saved;
    return { state: 'unknown', nextStep: 'افحص حالة المفتاح قبل إعادة المحاولة.' };
  }
}
