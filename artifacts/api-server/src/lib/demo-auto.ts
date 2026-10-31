import { createHash } from 'node:crypto';
import { prisma } from './prisma';
import { rulesInterpret } from './agent-intake';
import { createOrder, inspectPlan, reportHash, type Actor, type PlanInput } from './agent-workflow';

const kinds: Record<string, string> = { hvac_leak: 'hvac', hvac_no_cooling: 'hvac', water_leak: 'plumbing', electrical_fault: 'electrical' };

/** Synthetic demo only. Policy and availability are explicit manager-maintained records. */
export async function executeDemoRoutine(actor: Actor, requestId: string, hooks?: { afterPlan?: () => Promise<void>; prepareOnly?: boolean; readOnly?: boolean }) {
  if (actor.role !== 'manager' || actor.organizationId !== 'org-demo' || process.env.NODE_ENV === 'production' || process.env.MIRFAQ_AUTONOMY_DEMO !== '1') return { state: 'disabled' };
  const active = await prisma.user.findFirst({ where: { id: actor.userId, organizationId: actor.organizationId, role: 'manager', isActive: true }, select: { id: true } });
  if (!active) return { state: 'forbidden' };
  const [policy, request] = await Promise.all([
    prisma.agentDemoPolicy.findUnique({ where: { organizationId: actor.organizationId } }),
    prisma.maintenanceRequest.findFirst({ where: { id: requestId, organizationId: actor.organizationId }, select: { id: true, title: true, description: true, unitId: true, updatedAt: true } }),
  ]);
  if (!policy?.enabled) return { state: 'disabled' };
  if (!request) return { state: 'not_found' };
  const key = `auto_${createHash('sha256').update(`${actor.organizationId}:${requestId}`).digest('hex').slice(0, 32)}`;
  const prior = await prisma.agentOrder.findUnique({ where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: key } } });
  if (prior) {
    if (await prisma.agentIntake.findFirst({ where: { organizationId: actor.organizationId, requestId, state: 'escalate' }, select: { id: true } })) return { state: 'escalate', reason: 'ظهر مؤشر خطر في استيضاح محفوظ؛ راجع المسؤول.', key };
    const saved = await prisma.maintenanceRequest.findFirst({ where: { id: requestId, organizationId: actor.organizationId }, select: { technicianId: true, status: true } });
    return { state: saved?.technicianId === prior.technicianId && saved.status === 'قيد التنفيذ' && reportHash(request.title, request.description) === prior.reportHash ? 'verified' : 'inconsistent', order: prior, replay: true, mode: 'deterministic_demo', key };
  }
  if (hooks?.readOnly) return { state: 'not_found' };
  const text = `${request.title} ${request.description}`;
  const parsed = rulesInterpret(text);
  if (parsed.hazard) return { state: 'escalate', reason: 'مؤشر خطر يتطلب المسؤول.' };
  const fixture = await prisma.agentDemoFixture.findFirst({ where: { requestId, organizationId: actor.organizationId } });
  if (!fixture || fixture.assessedAt.getTime() < Date.now() - 8 * 60 * 60 * 1000 || fixture.requestVersion.getTime() !== request.updatedAt.getTime()) return { state: 'clarify', reason: 'يلزم تثبيت حقائق الحالة الاصطناعية ومخاطرها للنسخة الحالية خلال ثماني ساعات.' };
  if (fixture.riskStatus !== 'verified_safe') return { state: 'escalate', reason: 'تقييم المخاطر الاصطناعي يتطلب التصعيد.' };
  if (parsed.issue === 'unknown') return { state: 'clarify', reason: 'نوع المشكلة غير واضح.' };
  if (parsed.issue !== fixture.issueCode) return { state: 'clarify', reason: 'تفسير النص لا يطابق حقائق الحالة المعتمدة.' };
  const allowed = JSON.parse(policy.issueCodesJson) as string[], urgentWords = JSON.parse(policy.urgentWordsJson) as string[];
  if (!Array.isArray(allowed) || !allowed.includes(parsed.issue)) return { state: 'review', reason: 'المشكلة خارج سياسة demo.' };
  const assets = await prisma.agentAsset.findMany({ where: { id: fixture.assetId, organizationId: actor.organizationId, unitId: request.unitId, kind: kinds[parsed.issue] }, take: 2 });
  if (assets.length !== 1) return { state: 'clarify', reason: 'الأصل المعتمد غير متاح في الوحدة.' };
  const availability = await prisma.agentAvailability.findMany({ where: { organizationId: actor.organizationId, available: true, updatedAt: { gte: new Date(Date.now() - 8 * 60 * 60 * 1000) } }, select: { technicianId: true } });
  const priority = Array.isArray(urgentWords) && urgentWords.some(word => typeof word === 'string' && word && text.includes(word)) ? 'urgent' : 'normal';
  const plan: PlanInput = { requestId, assetId: assets[0].id, issueCode: parsed.issue, priority, riskConfirmedSafe: true, availableTechnicianIds: availability.map(x => x.technicianId) };
  const decision = await inspectPlan(actor, plan);
  if (decision.state !== 'ready') return decision;
  if (decision.workload >= policy.maxWorkload) return { state: 'review', reason: 'وصل الفني إلى الحد المسجل للعبء.' };
  if (hooks?.prepareOnly) return { state: 'ready', technicianName: decision.technicianName, workload: decision.workload, priority, mode: 'delegated_demo' };
  await hooks?.afterPlan?.(); // Test-only fault injection; API and model cannot set it.
  const expectedReportHash = createHash('sha256').update(`${request.title}\n${request.description}`).digest('hex');
  return { ...(await createOrder(actor, plan, key, { demoRefresh: { reportHash: expectedReportHash } })), mode: 'deterministic_demo', prioritySource: 'configured_demo_policy', availabilitySource: 'stored_demo_record', key };
}
