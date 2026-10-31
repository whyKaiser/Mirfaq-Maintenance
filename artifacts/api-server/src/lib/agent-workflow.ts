import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { maintenanceAdvice } from './maintenance-advice';
import { activeSafetyReview, safetyReassessed, safetyAssignmentReceipt } from './agent-safety';
import { reconcileLeakIssue } from './leak-reconciliation';

type DB = Prisma.TransactionClient;
export type Actor = { organizationId: string; userId: string; role: string };
export type PlanInput = { requestId: string; assetId: string; issueCode: string; priority: string; riskConfirmedSafe: boolean; availableTechnicianIds: string[]; dueAt?: string | null; planToken?: string };
const issues: Record<string, { kind: string; skill: RegExp }> = {
  hvac_leak: { kind: 'hvac', skill: /تكييف|تبريد|hvac/i },
  hvac_no_cooling: { kind: 'hvac', skill: /تكييف|تبريد|hvac/i },
  water_leak: { kind: 'plumbing', skill: /سباكة|سباك|plumb/i },
  electrical_fault: { kind: 'electrical', skill: /كهرب|electri/i },
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const reportHash = (title: string, description: string) => digest(`${title}\n${description}`);
export const technicianMatchesIssue = (issue: string, specialty: string) => Boolean(issues[issue]?.skill.test(specialty));
const idOk = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 100;
export function inputValid(x: unknown): x is PlanInput {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const p = x as PlanInput;
  const dateValid = p.dueAt == null || (typeof p.dueAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.dueAt) && Number.isFinite(Date.parse(p.dueAt)) && new Date(p.dueAt).toISOString() === p.dueAt);
  return dateValid && (p.planToken === undefined || (typeof p.planToken === 'string' && /^[a-f0-9]{64}$/.test(p.planToken))) && idOk(p.requestId) && idOk(p.assetId) && typeof p.issueCode === 'string' && Object.hasOwn(issues, p.issueCode) && ['normal', 'urgent'].includes(p.priority) && typeof p.riskConfirmedSafe === 'boolean' && Array.isArray(p.availableTechnicianIds) && p.availableTechnicianIds.length <= 20 && p.availableTechnicianIds.every(idOk);
}
export function normalizedInput(p: PlanInput) {
  return { requestId: p.requestId, assetId: p.assetId, issueCode: p.issueCode, priority: p.priority, riskConfirmedSafe: p.riskConfirmedSafe, availableTechnicianIds: [...new Set(p.availableTechnicianIds)].sort(), dueAt: p.dueAt ?? null, planToken: p.planToken ?? null };
}
export function inputHash(p: PlanInput) { return digest(JSON.stringify(normalizedInput(p))); }
export function activeKey(org: string, p: PlanInput) { return digest(JSON.stringify([org, p.assetId, p.issueCode])); }

export async function inspectPlan(actor: Actor, p: PlanInput, db: DB = prisma) {
  if (actor.role !== 'manager') throw new Error('forbidden');
  const request = await db.maintenanceRequest.findFirst({ where: { id: p.requestId, organizationId: actor.organizationId }, select: { id: true, title: true, description: true, unitId: true, technicianId: true, status: true, updatedAt: true } });
  if (!request) return { state: 'not_found' as const };
  const escalated = await db.agentIntake.findFirst({ where: { requestId: p.requestId, organizationId: actor.organizationId, state: 'escalate' }, select: { id: true } });
  const risk = maintenanceAdvice(request.title, request.description);
  if ((escalated || risk.state === 'escalate') && !await safetyReassessed(db, actor.organizationId, p.requestId)) return { state: 'escalate' as const, reason: 'مؤشر خطر يستدعي تدخل المسؤول؛ لا إسناد تلقائي.' };
  const claim = await db.agentClaim.findFirst({ where: { requestId: p.requestId, organizationId: actor.organizationId } });
  if (claim) return { state: 'review' as const, reason: 'البلاغ مرتبط مسبقًا بأمر؛ افحص الأمر قبل إنشاء آخر.' };
  const asset = await db.agentAsset.findFirst({ where: { id: p.assetId, organizationId: actor.organizationId, unitId: request.unitId } });
  if (!asset) return { state: 'clarify' as const, reason: 'تحقق من الأصل المسجل ضمن وحدة البلاغ.' };
  if (p.issueCode === 'hvac_leak' || p.issueCode === 'water_leak') {
    const leak = reconcileLeakIssue(`${request.title}\n${request.description}`, p.issueCode, asset.kind);
    if (leak.clarificationRequired || leak.finalIssue !== p.issueCode) return { state: 'clarify' as const, reason: 'مصدر التسريب غير واضح أو يتعارض مع الأصل. حدد الجزء المتضرر قبل الإسناد.' };
  }
  const issue = issues[p.issueCode];
  if (!issue || asset.kind !== issue.kind) return { state: 'clarify' as const, reason: 'نوع العطل لا يطابق نوع الأصل.' };
  if (!p.riskConfirmedSafe) return { state: 'clarify' as const, reason: 'يجب أن يتحقق المسؤول من المخاطر والأثر قبل الإسناد.' };
  if (request.technicianId || request.status !== 'معلّقة') return { state: 'review' as const, reason: 'البلاغ مسند أو ليس معلقًا؛ يلزم مراجعة المسؤول.' };
  const duplicate = await db.agentOrder.findFirst({ where: { organizationId: actor.organizationId, activeKey: activeKey(actor.organizationId, p) }, select: { id: true, requestId: true } });
  if (duplicate) return { state: 'duplicate_review' as const, duplicate };
  const availability = await db.agentAvailability.findMany({ where: { organizationId: actor.organizationId, available: true, technicianId: { in: p.availableTechnicianIds }, updatedAt: { gte: new Date(Date.now() - 8 * 60 * 60 * 1000) } }, select: { technicianId: true } });
  const technicians = await db.technicianProfile.findMany({ where: { id: { in: availability.map(a => a.technicianId) }, user: { organizationId: actor.organizationId, isActive: true, role: 'technician' } }, include: { user: { select: { name: true } }, _count: { select: { requests: { where: { organizationId: actor.organizationId, status: { not: 'مكتملة' } } } } } } });
  const candidates = technicians.filter(t => issue.skill.test(t.specialty)).sort((a, b) => a._count.requests - b._count.requests || a.id.localeCompare(b.id));
  if (!candidates.length) return { state: 'clarify' as const, reason: 'لا يوجد فني مناسب ضمن من أكد المسؤول توفرهم.' };
  const chosen = candidates[0];
  const intakes = await db.agentIntake.findMany({ where: { requestId: p.requestId, organizationId: actor.organizationId }, orderBy: { id: 'asc' }, select: { id: true, state: true, factsJson: true, updatedAt: true } });
  const inputs = normalizedInput(p);
  const planToken = digest(JSON.stringify({ ...inputs, planToken: null, request, intakes, technicianId: chosen.id, workload: chosen._count.requests }));
  return { state: 'ready' as const, technicianId: chosen.id, technicianName: chosen.user.name, workload: chosen._count.requests, priority: p.priority, assetTag: asset.tag, availabilitySource: 'manager_attestation' as const, planToken };
}

export async function readBoundOrder(actor: Actor, p: PlanInput, key: string) {
  if (actor.role !== 'manager') throw new Error('forbidden');
  const active = await prisma.user.findFirst({ where: { id: actor.userId, organizationId: actor.organizationId, role: 'manager', isActive: true }, select: { id: true } });
  if (!active) return { state: 'forbidden' as const };
  const order = await prisma.agentOrder.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: key } }, include: { events: true } });
  if (!order) return { state: 'not_found' as const };
  if (order.requestId !== p.requestId || order.inputHash !== inputHash(p)) return { state: 'key_conflict' as const };
  const escalated = await prisma.agentIntake.findFirst({ where: { organizationId: actor.organizationId, requestId: order.requestId, state: 'escalate' }, select: { id: true } });
  const saved = await prisma.maintenanceRequest.findFirst({ where: { id: order.requestId, organizationId: actor.organizationId }, select: { technicianId: true, status: true, title: true, description: true } });
  if ((escalated || (saved && maintenanceAdvice(saved.title, saved.description).state === 'escalate')) && !await safetyReassessed(prisma, actor.organizationId, order.requestId) && !await safetyAssignmentReceipt(prisma, actor.organizationId, order.requestId, order.id)) return { state: 'escalate' as const };
  return { state: saved?.technicianId === order.technicianId && saved.status === 'قيد التنفيذ' && reportHash(saved.title, saved.description) === order.reportHash ? 'verified' as const : 'inconsistent' as const, order, request: saved };
}

/** Atomic write + re-read; unknown failures are never blindly retried here. */
export async function createOrder(actor: Actor, p: PlanInput, key: string, hooks?: { afterCommit?: () => Promise<void>; demoRefresh?: { reportHash: string } }) {
  if (actor.role !== 'manager') throw new Error('forbidden');
  const active = await prisma.user.findFirst({ where: { id: actor.userId, organizationId: actor.organizationId, role: 'manager', isActive: true }, select: { id: true } });
  if (!active) return { state: 'forbidden' as const };
  const hash = inputHash(p);
  const existing = await prisma.agentOrder.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: key } } });
  async function verifyReplay(order: NonNullable<typeof existing>, replay = true) {
    if (order.inputHash !== hash) return { state: 'key_conflict' as const };
    const escalated = await prisma.agentIntake.findFirst({ where: { organizationId: actor.organizationId, requestId: order.requestId, state: 'escalate' }, select: { id: true } });
    const durable = await prisma.agentOrder.findFirst({ where: { id: order.id, organizationId: actor.organizationId }, include: { events: true } });
    const saved = await prisma.maintenanceRequest.findFirst({ where: { id: order.requestId, organizationId: actor.organizationId }, select: { technicianId: true, status: true, title: true, description: true } });
    if ((escalated || (saved && maintenanceAdvice(saved.title, saved.description).state === 'escalate')) && !await safetyReassessed(prisma, actor.organizationId, order.requestId) && !await safetyAssignmentReceipt(prisma, actor.organizationId, order.requestId, order.id)) return { state: 'escalate' as const };
    if (!durable || !saved || saved.technicianId !== durable.technicianId || saved.status !== 'قيد التنفيذ' || reportHash(saved.title, saved.description) !== durable.reportHash) return { state: 'inconsistent' as const };
    return { state: 'verified' as const, order: durable, replay };
  }
  if (existing) return verifyReplay(existing);
  try {
    const result = await prisma.$transaction(async tx => {
      const currentActor = await tx.user.findFirst({ where: { id: actor.userId, organizationId: actor.organizationId, role: 'manager', isActive: true }, select: { id: true } });
      if (!currentActor) return { state: 'forbidden' as const };
      let currentInput = p;
      if (hooks?.demoRefresh) {
        const [policy, current, availability, fixture] = await Promise.all([
          tx.agentDemoPolicy.findUnique({ where: { organizationId: actor.organizationId } }),
          tx.maintenanceRequest.findFirst({ where: { id: p.requestId, organizationId: actor.organizationId }, select: { title: true, description: true, updatedAt: true } }),
          tx.agentAvailability.findMany({ where: { organizationId: actor.organizationId, available: true, updatedAt: { gte: new Date(Date.now() - 8 * 60 * 60 * 1000) } }, select: { technicianId: true } }),
          tx.agentDemoFixture.findFirst({ where: { requestId: p.requestId, organizationId: actor.organizationId } }),
        ]);
        if (!policy?.enabled || !current || !fixture || fixture.assessedAt.getTime() < Date.now() - 8 * 60 * 60 * 1000 || fixture.requestVersion.getTime() !== current.updatedAt.getTime() || fixture.riskStatus !== 'verified_safe' || fixture.assetId !== p.assetId || fixture.issueCode !== p.issueCode || digest(`${current.title}\n${current.description}`) !== hooks.demoRefresh.reportHash || !(JSON.parse(policy.issueCodesJson) as string[]).includes(p.issueCode)) return { state: 'review' as const, reason: 'تغير البلاغ أو حقائق demo أو التفويض؛ أعد التخطيط.' };
        currentInput = { ...p, availableTechnicianIds: availability.map(x => x.technicianId) };
        const refreshed = await inspectPlan(actor, currentInput, tx);
        if (refreshed.state !== 'ready') return refreshed;
        if (refreshed.workload >= policy.maxWorkload) return { state: 'review' as const, reason: 'لا يوجد فني دون حد العبء.' };
      }
      const plan = await inspectPlan(actor, currentInput, tx);
      if (plan.state !== 'ready') return plan;
      if (!hooks?.demoRefresh && (!p.planToken || p.planToken !== plan.planToken)) return { state: 'review' as const, reason: 'تغيرت الخطة أو لم تعتمد نسختها الحالية؛ أعد قراءتها.' };
      const report = await tx.maintenanceRequest.findFirst({ where: { id: p.requestId, organizationId: actor.organizationId }, select: { title: true, description: true } });
      if (!report) return { state: 'not_found' as const };
      const safetyReview = await activeSafetyReview(tx, actor.organizationId, p.requestId);
      const changed = await tx.maintenanceRequest.updateMany({ where: { id: p.requestId, organizationId: actor.organizationId, technicianId: null, status: 'معلّقة' }, data: { technicianId: plan.technicianId, status: 'قيد التنفيذ', priority: p.priority === 'urgent' ? 'عاجل' : 'عادي' } });
      if (changed.count !== 1) throw new Error('concurrent_change');
      const order = await tx.agentOrder.create({ data: { organizationId: actor.organizationId, requestId: p.requestId, assetId: p.assetId, issueCode: p.issueCode, priority: p.priority, technicianId: plan.technicianId, idempotencyKey: key, inputHash: hash, reportHash: reportHash(report.title, report.description), activeKey: activeKey(actor.organizationId, p), dueAt: p.dueAt ? new Date(p.dueAt) : null } });
      if (safetyReview) {
        const assignedRequest = await tx.maintenanceRequest.findFirstOrThrow({ where: { id: p.requestId, organizationId: actor.organizationId }, select: { updatedAt: true } });
        await tx.agentSafetyReview.update({ where: { id: safetyReview.id }, data: { state: 'assignment_consumed', orderId: order.id, orderRevision: order.revision, requestVersion: assignedRequest.updatedAt } });
      }
      await tx.agentClaim.create({ data: { requestId: p.requestId, organizationId: actor.organizationId, orderId: order.id, kind: 'primary' } });
      await tx.agentEvent.create({ data: { organizationId: actor.organizationId, orderId: order.id, actorId: actor.userId, action: 'assign', reason: 'تخصص مطابق وأقل عبء بين الفنيين الذين أكد المسؤول توفرهم', outcome: 'assigned_not_delivery_confirmed' } });
      const saved = await tx.agentOrder.findFirst({ where: { id: order.id, organizationId: actor.organizationId }, include: { events: true } });
      const ticket = await tx.maintenanceRequest.findFirst({ where: { id: p.requestId, organizationId: actor.organizationId }, select: { technicianId: true, status: true } });
      if (!saved || ticket?.technicianId !== plan.technicianId || ticket.status !== 'قيد التنفيذ') throw new Error('verification_failed');
      return { state: 'verified' as const, order: saved, replay: false };
    });
    if (result.state === 'verified') {
      // Injectable only by the test harness, never exposed through an API or model tool.
      await hooks?.afterCommit?.();
      return verifyReplay(result.order, false);
    }
    return result;
  } catch (error) {
    const check = await prisma.agentOrder.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: key } } });
    if (check) return verifyReplay(check);
    throw error;
  }
}
