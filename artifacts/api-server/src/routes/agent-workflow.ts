import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createOrder, inputValid, inspectPlan, readBoundOrder, reportHash, type Actor } from '../lib/agent-workflow';
import { modelAdvice } from '../lib/model-advice';
import { openAIResponsesProvider } from '../lib/model-provider';
import { maintenanceAdvice } from '../lib/maintenance-advice';
import { executeDemoRoutine } from '../lib/demo-auto';
import { createHash } from 'node:crypto';
import { replanOrder, type ReplanReason } from '../lib/agent-replan';
import { auditAgent, auditForResponse } from '../lib/agent-audit';
import { safetyReassessed, safetyAssignmentReceipt } from '../lib/agent-safety';

const router = Router();
const actor = (req: Request): Actor => ({ organizationId: req.session.organizationId!, userId: req.session.userId!, role: req.session.userRole! });
const allowedKinds = new Set(['hvac', 'plumbing', 'electrical']);
const demoEnabled = (req: Request) => process.env.NODE_ENV !== 'production' && process.env.MIRFAQ_AUTONOMY_DEMO === '1' && req.session.organizationId === 'org-demo';

router.post('/agent/availability', requireRole('manager'), async (req, res) => {
  const { technicianId, available } = req.body ?? {};
  if (typeof technicianId !== 'string' || typeof available !== 'boolean') return res.status(400).json({ error: 'بيانات التوفر غير صالحة' });
  const orgId = req.session.organizationId!;
  const technician = await prisma.technicianProfile.findFirst({ where: { id: technicianId, user: { organizationId: orgId, isActive: true, role: 'technician' } }, select: { id: true } });
  if (!technician) return res.status(404).json({ error: 'الفني غير موجود' });
  const existing = await prisma.agentAvailability.findUnique({ where: { technicianId } });
  if (existing && existing.organizationId !== orgId) return res.status(409).json({ error: 'تعارض جهة التوفر' });
  const record = await prisma.agentAvailability.upsert({ where: { technicianId }, create: { technicianId, organizationId: orgId, available }, update: { available } });
  return res.json({ state: 'verified', record, expiresAfterHours: 8 });
});

router.post('/agent/demo/policy', requireRole('manager'), async (req, res) => {
  if (!demoEnabled(req)) return res.status(403).json({ error: 'الأتمتة التجريبية غير مفعلة' });
  const { enabled, issueCodes, urgentWords, maxWorkload } = req.body ?? {};
  const valid = ['hvac_leak', 'hvac_no_cooling', 'water_leak', 'electrical_fault'];
  if (typeof enabled !== 'boolean' || !Array.isArray(issueCodes) || issueCodes.length > 4 || issueCodes.some(x => typeof x !== 'string' || !valid.includes(x)) || !Array.isArray(urgentWords) || urgentWords.length > 10 || urgentWords.some(x => typeof x !== 'string' || !x.trim() || x.length > 40) || !Number.isInteger(maxWorkload) || maxWorkload < 1 || maxWorkload > 50) return res.status(400).json({ error: 'السياسة غير صالحة' });
  const data = { enabled, issueCodesJson: JSON.stringify(issueCodes), urgentWordsJson: JSON.stringify(urgentWords), maxWorkload };
  const policy = await prisma.agentDemoPolicy.upsert({ where: { organizationId: req.session.organizationId! }, create: { organizationId: req.session.organizationId!, ...data }, update: data });
  return res.json({ state: 'verified', policy, mode: 'deterministic_demo' });
});
router.post('/agent/demo/availability', requireRole('manager'), async (req, res) => {
  if (!demoEnabled(req)) return res.status(403).json({ error: 'الأتمتة التجريبية غير مفعلة' });
  const { technicianId, available } = req.body ?? {};
  if (typeof technicianId !== 'string' || typeof available !== 'boolean') return res.status(400).json({ error: 'بيانات التوفر غير صالحة' });
  const orgId = req.session.organizationId!;
  const technician = await prisma.technicianProfile.findFirst({ where: { id: technicianId, user: { organizationId: orgId, role: 'technician', isActive: true } }, select: { id: true } });
  if (!technician) return res.status(404).json({ error: 'الفني غير موجود' });
  const availability = await prisma.agentAvailability.upsert({ where: { technicianId }, create: { technicianId, organizationId: orgId, available }, update: { available } });
  if (availability.organizationId !== orgId) return res.status(409).json({ error: 'تعارض بيانات التوفر' });
  return res.json({ state: 'verified', availability });
});
router.post('/agent/demo/fixture', requireRole('manager'), async (req, res) => {
  if (!demoEnabled(req)) return res.status(403).json({ error: 'الأتمتة التجريبية غير مفعلة' });
  const { requestId, assetId, issueCode, riskStatus, confirmedSynthetic } = req.body ?? {};
  if (confirmedSynthetic !== true || typeof requestId !== 'string' || typeof assetId !== 'string' || !['hvac_leak', 'hvac_no_cooling', 'water_leak', 'electrical_fault'].includes(issueCode) || !['verified_safe', 'hazard'].includes(riskStatus)) return res.status(400).json({ error: 'يلزم تحديد حقائق الحالة الاصطناعية ومخاطرها صراحة' });
  const orgId = req.session.organizationId!;
  const ticket = await prisma.maintenanceRequest.findFirst({ where: { id: requestId, organizationId: orgId }, select: { unitId: true, updatedAt: true } });
  const asset = ticket && await prisma.agentAsset.findFirst({ where: { id: assetId, organizationId: orgId, unitId: ticket.unitId } });
  const expectedKind = issueCode.startsWith('hvac_') ? 'hvac' : issueCode === 'water_leak' ? 'plumbing' : 'electrical';
  if (!ticket || !asset || asset.kind !== expectedKind) return res.status(400).json({ error: 'الأصل أو الوحدة لا يطابقان نوع المشكلة' });
  const fixture = await prisma.agentDemoFixture.upsert({ where: { requestId }, create: { requestId, organizationId: orgId, assetId, issueCode, riskStatus, requestVersion: ticket.updatedAt, assessedBy: req.session.userId! }, update: { assetId, issueCode, riskStatus, requestVersion: ticket.updatedAt, assessedAt: new Date(), assessedBy: req.session.userId! } });
  if (fixture.organizationId !== orgId) return res.status(409).json({ error: 'تعارض جهة الحالة' });
  return res.json({ state: 'verified', fixture });
});
router.post('/agent/demo/routine', requireRole('manager'), async (req, res) => {
  if (!demoEnabled(req)) return res.status(403).json({ error: 'الأتمتة التجريبية غير مفعلة' });
  if (typeof req.body?.requestId !== 'string' || !req.body.requestId || req.body.requestId.length > 100) return res.status(400).json({ error: 'اختر البلاغ' });
  const requestId = req.body.requestId as string, orgId = req.session.organizationId!;
  try { const result = await executeDemoRoutine(actor(req), requestId); if (result.state === 'escalate') await auditForResponse(res, orgId, req.session.userId!, 'order', 'escalated', 'risk_signal'); return res.json(result); }
  catch {
    await auditForResponse(res, orgId, req.session.userId!, 'order', 'unknown', 'write_outcome_unknown');
    const key = `auto_${createHash('sha256').update(`${orgId}:${requestId}`).digest('hex').slice(0, 32)}`;
    return res.status(503).json({ state: 'unknown', key, nextStep: 'افحص حالة المفتاح قبل الإعادة.' });
  }
});

// Model chooses from a bounded tool loop; the separately delegated demo policy,
// stored fixture and availability are revalidated by each privileged tool.
router.post('/agent/demo/model-routine', requireRole('manager'), async (req, res) => {
  if (!demoEnabled(req) || process.env.MIRFAQ_AGENT_DEMO_ONLY !== '1') return res.status(403).json({ error:'التفويض التجريبي غير مفعّل' });
  const requestId=req.body?.requestId;
  if(typeof requestId!=='string' || !requestId || requestId.length>100) return res.status(400).json({error:'البلاغ مطلوب'});
  const apiKey=process.env.OPENAI_API_KEY, model=process.env.MIRFAQ_AGENT_MODEL;
  if(process.env.MIRFAQ_AGENT_PROVIDER!=='openai-responses' || !apiKey || !model) return res.status(503).json({error:'النموذج غير مهيأ'});
  const currentActor=actor(req), org=currentActor.organizationId;
  const trace: Array<{tool:string;outcome:string}> = [];
  try {
    const ticket=await prisma.maintenanceRequest.findFirst({where:{id:requestId,organizationId:org},select:{title:true,description:true}});
    if(!ticket) return res.status(404).json({error:'البلاغ غير موجود'});
    const existing=await executeDemoRoutine(currentActor,requestId,{readOnly:true});
    if(existing.state==='verified') return res.json({state:'verified',mode:'saved_demo_replay',trace:[{tool:'read_order',outcome:'verified'}],execution:existing});
    if(existing.state!=='not_found') return res.json({state:existing.state,mode:'demo_policy',trace:[],nextStep:'راجع التفويض والسلامة قبل المتابعة.'});
    const preflight=await executeDemoRoutine(currentActor,requestId,{prepareOnly:true});
    if(preflight.state!=='ready') return res.json({state:preflight.state,mode:'demo_policy',trace:[],nextStep:'راجع المعلومات أو سياسة التجربة قبل التنفيذ.'});
    const workflow={
      delegated:true,
      inspect:()=>executeDemoRoutine(currentActor,requestId,{prepareOnly:true}),
      create:()=>executeDemoRoutine(currentActor,requestId),
      read:()=>executeDemoRoutine(currentActor,requestId,{readOnly:true}),
    };
    const outcome=await modelAdvice(ticket,openAIResponsesProvider({key:apiKey,model,budgetScope:'delegated-ui',budgetCaseId:requestId}),workflow,{onToolOutput(name,result){
      const state=(result && typeof result==='object' && 'state' in result && typeof result.state==='string')?result.state:'read';
      trace.push({tool:name,outcome:/^[a-z_]{2,32}$/.test(state)?state:'unknown'});
    }});
    trace.push({tool:'finish',outcome:'completed'});
    await auditForResponse(res,org,currentActor.userId,'model','recorded','demo_model_workflow');
    return res.json({state:outcome.execution?.state ?? 'review',mode:outcome.mode,trace,execution:outcome.execution,usage:outcome.usage,nextStep:'راجع حالة الاستلام؛ الإسناد لا يثبت استلام الفني.'});
  } catch {
    await auditForResponse(res,org,currentActor.userId,'model','unknown','model_outcome_unknown');
    // No model retry: inspect saved state before any future execution.
    const saved=await executeDemoRoutine(currentActor,requestId,{readOnly:true}).catch(()=>({state:'unknown'}));
    return res.status(503).json({state:'unknown',mode:'real_model',trace,savedState:saved.state,nextStep:'توقف وتحقق من الحالة المحفوظة قبل إعادة المحاولة.'});
  }
});

router.get('/agent/audit', requireRole('manager'), async (req, res) => {
  const entries = await prisma.agentAudit.findMany({ where: { organizationId: req.session.organizationId! }, orderBy: { createdAt: 'desc' }, take: 200 });
  return res.json(entries);
});

router.get('/agent/assets', requireRole('manager'), async (req, res) => {
  const assets = await prisma.agentAsset.findMany({ where: { organizationId: req.session.organizationId! }, orderBy: { createdAt: 'desc' } });
  res.json(assets);
});

router.post('/agent/assets', requireRole('manager'), async (req, res) => {
  try {
    const { unitId, tag, kind } = req.body ?? {};
    if (typeof unitId !== 'string' || !unitId || typeof tag !== 'string' || !tag.trim() || tag.length > 100 || typeof kind !== 'string' || !allowedKinds.has(kind)) return res.status(400).json({ error: 'بيانات الأصل غير مكتملة' });
    const organizationId = req.session.organizationId!;
    const unit = await prisma.unit.findFirst({ where: { id: unitId, property: { organizationId } }, select: { id: true } });
    if (!unit) return res.status(404).json({ error: 'الوحدة غير موجودة' });
    const asset = await prisma.agentAsset.upsert({ where: { organizationId_unitId_tag: { organizationId, unitId, tag: tag.trim() } }, update: {}, create: { organizationId, unitId, tag: tag.trim(), kind } });
    if (asset.kind !== kind) return res.status(409).json({ error: 'رمز الأصل مسجل بنوع آخر' });
    return res.json({ state: 'verified', asset });
  } catch { return res.status(500).json({ error: 'تعذر حفظ الأصل' }); }
});

router.post('/agent/plan', requireRole('manager'), async (req, res) => {
  if (!inputValid(req.body)) { await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'plan', 'denied', 'invalid_input'); return res.status(400).json({ state: 'clarify', reason: 'يلزم البلاغ والأصل ونوع العطل والأولوية والمخاطر وتوفر الفنيين.' }); }
  try { const result = await inspectPlan(actor(req), req.body); if (result.state === 'escalate') await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'plan', 'escalated', 'risk_signal'); return res.json(result); }
  catch { await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'plan', 'failed', 'plan_failed'); return res.status(500).json({ error: 'تعذر إعداد الخطة' }); }
});

router.post('/agent/orders', requireRole('manager'), async (req, res) => {
  const key = req.header('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9_-]{16,80}$/.test(key) || !inputValid(req.body)) { await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'order', 'denied', 'invalid_input'); return res.status(400).json({ error: 'المعلومات أو مفتاح المحاولة غير صالح' }); }
  try {
    const result = await createOrder(actor(req), req.body, key);
    if (result.state === 'escalate') await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'order', 'escalated', 'risk_signal');
    return res.status(result.state === 'verified' ? 200 : 409).json(result);
  } catch {
    await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'order', 'unknown', 'write_outcome_unknown');
    return res.status(503).json({ state: 'unknown', nextStep: 'افحص حالة مفتاح المحاولة قبل تكرار الإرسال.' });
  }
});

// The manager explicitly approves these exact fixed inputs. The model cannot
// choose a tenant, substitute identifiers, alter approval, or invoke free-form tools.
router.post('/agent/model-orders', requireRole('manager'), async (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.MIRFAQ_AGENT_DEMO_ONLY !== '1' || req.session.organizationId !== 'org-demo') return res.status(403).json({ error: 'تجربة النموذج غير مفعلة لهذه الجهة' });
  const key = req.header('Idempotency-Key');
  if (!key || !/^[A-Za-z0-9_-]{16,80}$/.test(key) || req.body?.confirmExecution !== true || !inputValid(req.body?.plan)) return res.status(400).json({ error: 'يلزم اعتماد المدير للخطة ومفتاح محاولة صالح' });
  const apiKey = process.env.OPENAI_API_KEY, model = process.env.MIRFAQ_AGENT_MODEL;
  if (process.env.MIRFAQ_AGENT_PROVIDER !== 'openai-responses' || !apiKey || !model) { await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'model', 'failed', 'model_not_configured'); return res.status(503).json({ error: 'النموذج غير مهيأ' }); }
  const selected = req.body.plan;
  const currentActor = actor(req);
  try {
    const ticket = await prisma.maintenanceRequest.findFirst({ where: { id: selected.requestId, organizationId: currentActor.organizationId }, select: { title: true, description: true } });
    if (!ticket) return res.status(404).json({ error: 'البلاغ غير موجود' });
    const workflow = {
      inspect: () => inspectPlan(currentActor, selected),
      create: () => createOrder(currentActor, selected, key),
      read: () => readBoundOrder(currentActor, selected, key),
    };
    return res.json(await modelAdvice(ticket, openAIResponsesProvider({ key: apiKey, model }), workflow));
  } catch {
    await auditForResponse(res, currentActor.organizationId, currentActor.userId, 'model', 'unknown', 'model_outcome_unknown');
    return res.status(503).json({ state: 'unknown', nextStep: 'قد تكون الكتابة تمت؛ افحص حالة مفتاح المحاولة قبل الإعادة.' });
  }
});

router.get('/agent/orders/by-key/:key', requireRole('manager'), async (req, res) => {
  const order = await prisma.agentOrder.findUnique({ where: { organizationId_idempotencyKey: { organizationId: req.session.organizationId!, idempotencyKey: req.params.key } }, include: { events: { orderBy: { createdAt: 'asc' } } } });
  if (!order) return res.status(404).json({ state: 'not_found' });
  const risk = await prisma.agentIntake.findFirst({ where: { organizationId: req.session.organizationId!, requestId: order.requestId, state: 'escalate' }, select: { id: true } });
  const request = await prisma.maintenanceRequest.findFirst({ where: { id: order.requestId, organizationId: req.session.organizationId! }, select: { technicianId: true, status: true, title: true, description: true } });
  if ((risk || (request && maintenanceAdvice(request.title, request.description).state === 'escalate')) && !await safetyReassessed(prisma, req.session.organizationId!, order.requestId) && !await safetyAssignmentReceipt(prisma, req.session.organizationId!, order.requestId, order.id)) return res.json({ state: 'escalate', order });
  return res.json({ state: request?.technicianId === order.technicianId && request.status === 'قيد التنفيذ' && reportHash(request.title, request.description) === order.reportHash ? 'verified' : 'inconsistent', order, request });
});

router.post('/agent/orders/:id/replan', requireRole('manager'), async (req, res) => {
  const key = req.header('Idempotency-Key'), reason = req.body?.reason, expectedRevision = req.body?.expectedRevision;
  if (!key || !/^[A-Za-z0-9_-]{16,80}$/.test(key) || !['technician_absent', 'availability_changed', 'workload_limit'].includes(reason) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ error: 'المفتاح أو السبب أو نسخة الأمر غير صالحة' });
  const result = await replanOrder(actor(req), req.params.id, reason as ReplanReason, expectedRevision, key);
  if (result.state === 'escalate') await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'replan', 'escalated', 'no_safe_candidate');
  if (result.state === 'unknown') await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'replan', 'unknown', 'write_outcome_unknown');
  return res.status(result.state === 'reassigned' || result.state === 'escalate' ? 200 : result.state === 'unknown' ? 503 : 409).json(result);
});
router.get('/agent/commands/by-key/:key', requireRole('manager'), async (req, res) => {
  const command = await prisma.agentCommand.findUnique({ where: { organizationId_idempotencyKey: { organizationId: req.session.organizationId!, idempotencyKey: req.params.key } } });
  if (!command) return res.status(404).json({ state: 'not_found' });
  const order = await prisma.agentOrder.findFirst({ where: { id: command.orderId, organizationId: req.session.organizationId! } });
  const ticket = order && await prisma.maintenanceRequest.findFirst({ where: { id: order.requestId, organizationId: req.session.organizationId! }, select: { technicianId: true, status: true, title: true, description: true } });
  const risk = order && await prisma.agentIntake.findFirst({ where: { organizationId: req.session.organizationId!, requestId: order.requestId, state: 'escalate' }, select: { id: true } });
  if ((risk || (ticket && maintenanceAdvice(ticket.title, ticket.description).state === 'escalate')) && !(order && command.resultState === 'reassigned' && command.safetyReviewId && await safetyAssignmentReceipt(prisma, req.session.organizationId!, order.requestId, order.id, command.safetyReviewId))) return res.json({ state: 'escalate', nextStep: 'ظهر مؤشر خطر؛ راجع المسؤول.' });
  if (order && ticket && reportHash(ticket.title, ticket.description) !== order.reportHash) return res.json({ state: 'inconsistent' });
  const consistent = !!order && !!ticket && ticket.technicianId === order.technicianId && ticket.status === 'قيد التنفيذ' && (command.resultState === 'reassigned' ? order.technicianId === command.technicianId && order.state === 'assigned' : order.state === 'blocked');
  return res.json({ state: consistent ? command.resultState : 'inconsistent', command, order });
});

// Explicit, bounded demo follow-up: only a recorded absence can trigger a replan.
// Parts, hazardous cases and closure stay with the manager. No model call is made.
router.post('/agent/demo/follow-up', requireRole('manager'), async (req, res) => {
  if (!demoEnabled(req)) return res.status(403).json({ state: 'forbidden' });
  try {
    const org = req.session.organizationId!;
    const candidates = await prisma.agentOrder.findMany({
      where: { organizationId: org, state: 'blocked', blocker: 'technician_absent' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 50,
      include: { events: { where: { action: { in: ['block', 'replan'] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } },
    });
    const actionable = candidates.filter(order => !(order.events[0]?.action === 'replan' && order.events[0]?.outcome === 'escalate'));
    const outcomes: Array<{ orderId: string; state: string; replay?: boolean }> = [];
    let stateChanges = 0;
    for (const order of actionable) {
      if (stateChanges >= 5) break;
      const key = 'followup_' + createHash('sha256').update(`${org}:${order.id}:${order.revision}`).digest('hex').slice(0, 48);
      const result = await replanOrder(actor(req), order.id, 'technician_absent', order.revision, key, true);
      outcomes.push({ orderId: order.id, state: result.state, ...('replay' in result ? { replay: result.replay } : {}) });
      if (result.state === 'reassigned' || result.state === 'escalate') stateChanges++;
      if (result.state === 'unknown' || result.state === 'inconsistent') {
        await auditForResponse(res, org, req.session.userId!, 'followup', 'unknown', 'write_outcome_unknown');
        return res.status(503).json({ state: 'unknown', mode: 'deterministic_demo', outcomes, nextStep: 'Inspect saved state before retrying.' });
      }
      if (result.state === 'escalate') await auditForResponse(res, org, req.session.userId!, 'followup', 'escalated', 'no_safe_candidate');
      if (result.state !== 'reassigned' && result.state !== 'escalate') await auditForResponse(res, org, req.session.userId!, 'followup', 'recorded', 'followup_review_required');
    }
    return res.json({ state: 'completed', mode: 'deterministic_demo', outcomes, awaitingManager: candidates.length - actionable.length + outcomes.filter(item => item.state !== 'reassigned').length, remaining: Math.max(0, actionable.length - outcomes.length), scanLimitReached: candidates.length === 50, receiptConfirmed: false });
  } catch {
    await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'followup', 'unknown', 'followup_outcome_unknown');
    return res.status(503).json({ state: 'unknown', mode: 'deterministic_demo', nextStep: 'Inspect saved state before retrying.' });
  }
});

router.get('/agent/orders', requireRole('manager'), async (req, res) => {
  const orders = await prisma.agentOrder.findMany({ where: { organizationId: req.session.organizationId! }, include: { events: { orderBy: { createdAt: 'asc' } }, drafts: true, links: true, closureReports: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' } });
  return res.json(orders);
});

router.get('/agent/my-orders', requireRole('technician'), async (req, res) => {
  const orgId = req.session.organizationId!;
  const profile = await prisma.technicianProfile.findFirst({ where: { userId: req.session.userId!, user: { organizationId: orgId, isActive: true } }, select: { id: true } });
  if (!profile) return res.json([]);
  const orders = await prisma.agentOrder.findMany({ where: { organizationId: orgId, technicianId: profile.id }, select: { id: true, requestId: true, assetId: true, issueCode: true, state: true } });
  return res.json(orders);
});

// Capture all related rows in the same SQLite read transaction.
async function buildCurrentReport(db: Prisma.TransactionClient, orgId: string, now: Date) {
    const [orders, total] = await Promise.all([
      db.agentOrder.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, take: 200, include: { drafts: true } }),
      db.agentOrder.count({ where: { organizationId: orgId } }),
    ]);
    const [tickets, assets, technicians] = await Promise.all([
      db.maintenanceRequest.findMany({ where: { organizationId: orgId, id: { in: orders.map(o => o.requestId) } }, select: { id: true, title: true, status: true } }),
      db.agentAsset.findMany({ where: { organizationId: orgId, id: { in: orders.map(o => o.assetId) } }, select: { id: true, tag: true } }),
      db.technicianProfile.findMany({ where: { id: { in: orders.map(o => o.technicianId) }, user: { organizationId: orgId } }, select: { id: true, user: { select: { name: true } } } }),
    ]);
    return { generatedAt: now.toISOString(), total, truncated: total > orders.length, items: orders.map(order => ({
      id: order.id, requestTitle: tickets.find(t => t.id === order.requestId)?.title ?? null,
      asset: assets.find(a => a.id === order.assetId)?.tag ?? null, technician: technicians.find(t => t.id === order.technicianId)?.user.name ?? null,
      priority: order.priority, state: order.state, deliveryState: order.deliveryState, blocker: order.blocker,
      dueAt: order.dueAt, overdue: order.dueAt ? order.dueAt < now && order.state !== 'closed' : null,
      nextStep: order.nextStep ?? (order.dueAt ? 'تحقق من استلام الفني وتقدم العمل' : 'حدد موعدًا مستهدفًا وتحقق من استلام الفني'),
      nextOwner: order.state === 'blocked' || !order.dueAt ? 'manager' : 'manager_and_technician',
      pendingApprovals: order.drafts.filter(d => d.status === 'pending_approval').length,
    })) };
}
// On-demand report. Overdue uses only a deadline explicitly supplied by a manager.
router.get('/agent/report', requireRole('manager'), async (req, res) => {
  try {
    if (req.query.cutoff !== undefined) return res.status(400).json({ error: 'التقرير التاريخي عند وقت قطع غير مدعوم؛ التقرير الحالي فقط.' });
    return res.json(await prisma.$transaction(tx => buildCurrentReport(tx, req.session.organizationId!, new Date())));
  } catch { return res.status(500).json({ error: 'تعذر إعداد تقرير المتابعة' }); }
});
router.post('/agent/report/snapshots', requireRole('manager'), async (req, res) => {
  try {
    const result = await prisma.$transaction(async tx => {
      const now = new Date(), current = await buildCurrentReport(tx, req.session.organizationId!, now);
      // Snapshots exclude all free text, names, and asset tags; identifiers remain tenant-scoped.
      const data = { ...current, items: current.items.map(({ requestTitle, asset, technician, nextStep, ...safe }) => safe) };
      const snapshot = await tx.agentReportSnapshot.create({ data: { organizationId: req.session.organizationId!, actorId: req.session.userId!, generatedAt: now, dataJson: JSON.stringify(data) } });
      await auditAgent(req.session.organizationId!, req.session.userId!, 'snapshot', 'recorded', 'snapshot_created', tx);
      return { id: snapshot.id, ...data };
    });
    return res.status(201).json(result);
  } catch { await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'snapshot', 'unknown', 'snapshot_outcome_unknown'); return res.status(503).json({ state: 'unknown' }); }
});
router.get('/agent/report/snapshots/:id', requireRole('manager'), async (req, res) => {
  const snapshot = await prisma.agentReportSnapshot.findFirst({ where: { id: req.params.id, organizationId: req.session.organizationId! } });
  return snapshot ? res.json({ id: snapshot.id, ...JSON.parse(snapshot.dataJson) }) : res.status(404).json({ error: 'اللقطة غير موجودة' });
});

router.post('/agent/orders/:id/link', requireRole('manager'), async (req, res) => {
  const { requestId, assetId, issueCode, confirmed } = req.body ?? {};
  if (confirmed !== true || typeof requestId !== 'string' || typeof assetId !== 'string' || typeof issueCode !== 'string') return res.status(400).json({ error: 'يلزم تأكيد المسؤول للأصل والمشكلة' });
  try {
    const result = await prisma.$transaction(async tx => {
      const orgId = req.session.organizationId!;
      const order = await tx.agentOrder.findFirst({ where: { id: req.params.id, organizationId: orgId } });
      const ticket = await tx.maintenanceRequest.findFirst({ where: { id: requestId, organizationId: orgId }, select: { id: true, unitId: true, technicianId: true, status: true, title: true, description: true } });
      if (!order || !ticket) return { state: 'not_found' };
      const asset = await tx.agentAsset.findFirst({ where: { id: assetId, organizationId: orgId, unitId: ticket.unitId } });
      if (!asset || order.assetId !== assetId || order.issueCode !== issueCode || order.requestId === requestId || ticket.technicianId || ticket.status !== 'معلّقة' || maintenanceAdvice(ticket.title, ticket.description).state === 'escalate') return { state: 'review' };
      const existing = await tx.agentLink.findUnique({ where: { requestId } });
      if (existing) return { state: existing.organizationId === orgId && existing.orderId === order.id ? 'verified' : 'review', link: existing.organizationId === orgId ? existing : undefined };
      if (await tx.agentOrder.findFirst({ where: { requestId, organizationId: orgId } })) return { state: 'review' };
      await tx.agentClaim.create({ data: { requestId, organizationId: orgId, orderId: order.id, kind: 'linked' } });
      const link = await tx.agentLink.create({ data: { organizationId: orgId, orderId: order.id, requestId } });
      await tx.agentEvent.create({ data: { organizationId: orgId, orderId: order.id, actorId: req.session.userId!, action: 'link_report', reason: 'أكد المسؤول تطابق الأصل ونوع المشكلة', outcome: 'linked_not_merged' } });
      const saved = await tx.agentLink.findFirst({ where: { id: link.id, organizationId: orgId, orderId: order.id, requestId } });
      if (!saved) throw new Error('verification_failed');
      return { state: 'verified', link: saved };
    });
    return res.status(result.state === 'verified' ? 200 : 409).json(result);
  } catch { return res.status(503).json({ state: 'unknown', nextStep: 'افحص الأمر والروابط قبل إعادة المحاولة.' }); }
});

router.post('/agent/orders/:id/block', requireRole('manager'), async (req, res) => {
  const { blocker } = req.body ?? {};
  const steps: Record<string, string> = { part_unavailable: 'مسودة طلب قطعة للمراجعة؛ لا شراء أو التزام مالي', technician_absent: 'راجع توفر الفنيين وأعد التخطيط أو صعّد للمسؤول', other: 'راجع العائق مع المسؤول وحدد الإجراء التالي' };
  if (typeof blocker !== 'string' || !Object.hasOwn(steps, blocker)) return res.status(400).json({ error: 'نوع العائق غير صالح' });
  try {
    const result = await prisma.$transaction(async tx => {
      const existing = await tx.agentOrder.findFirst({ where: { id: req.params.id, organizationId: req.session.organizationId! } });
      if (!existing) return null;
      if (existing.state === 'blocked' && existing.blocker === blocker) return existing;
      if (existing.state !== 'assigned') throw new Error('invalid_transition');
      const changed = await tx.agentOrder.updateMany({ where: { id: existing.id, organizationId: req.session.organizationId!, state: 'assigned' }, data: { state: 'blocked', revision: { increment: 1 }, blocker, nextStep: steps[blocker] } });
      if (changed.count !== 1) throw new Error('concurrent_change');
      if (blocker === 'part_unavailable') await tx.agentDraft.create({ data: { organizationId: req.session.organizationId!, orderId: existing.id, kind: 'part_request', description: 'مسودة داخلية: يلزم تحديد القطعة والكمية والتحقق من الحاجة قبل أي إجراء شراء.' } });
      await tx.agentEvent.create({ data: { organizationId: req.session.organizationId!, orderId: existing.id, actorId: req.session.userId!, action: 'block', reason: blocker, outcome: 'pending_manager_review' } });
      return tx.agentOrder.findFirst({ where: { id: existing.id, organizationId: req.session.organizationId! }, include: { events: true, drafts: true } });
    });
    if (!result) return res.status(404).json({ error: 'الأمر غير موجود' });
    return res.json({ state: 'verified', order: result });
  } catch { return res.status(409).json({ state: 'review', error: 'تعذر تغيير الحالة؛ افحص الأمر قبل المحاولة.' }); }
});

router.post('/agent/drafts/:id/decision', requireRole('manager'), async (req, res) => {
  const decision = req.body?.decision, expectedRevision = req.body?.expectedRevision;
  if (decision !== 'approved_for_followup' && decision !== 'rejected') return res.status(400).json({ error: 'القرار غير صالح' });
  try {
    const draft = await prisma.$transaction(async tx => {
      const existing = await tx.agentDraft.findFirst({ where: { id: req.params.id, organizationId: req.session.organizationId! } });
      if (!existing) return null;
      if (existing.kind === 'part_request' && (!Number.isSafeInteger(expectedRevision) || expectedRevision !== existing.revision || (decision === 'approved_for_followup' && (!existing.partSpecification || !existing.quantity)))) throw new Error('stale_or_incomplete');
      if (existing.status === decision) return existing;
      if (existing.status !== 'pending_approval') throw new Error('invalid_transition');
      const changed = await tx.agentDraft.updateMany({ where: { id: existing.id, organizationId: req.session.organizationId!, status: 'pending_approval', revision: existing.revision }, data: { status: decision, approvalVersion: decision === 'approved_for_followup' ? existing.revision : null } });
      if (changed.count !== 1) throw new Error('concurrent_change');
      await tx.agentEvent.create({ data: { organizationId: req.session.organizationId!, orderId: existing.orderId, actorId: req.session.userId!, action: 'draft_decision', reason: existing.kind === 'part_request' ? JSON.stringify({ message: 'مراجعة داخلية دون شراء', specificationHash: createHash('sha256').update(existing.partSpecification ?? '').digest('hex'), quantity: existing.quantity, revision: existing.revision }) : 'مراجعة مسودة داخلية؛ لا شراء أو التزام مالي', outcome: decision } });
      return tx.agentDraft.findFirst({ where: { id: existing.id, organizationId: req.session.organizationId! } });
    });
    if (!draft) return res.status(404).json({ error: 'المسودة غير موجودة' });
    return res.json({ state: 'verified', draft });
  } catch { return res.status(409).json({ state: 'review', error: 'تعذر تسجيل القرار؛ افحص الحالة.' }); }
});

router.post('/agent/drafts/:id/parts-spec', requireRole('manager'), async (req, res) => {
  const { specification, quantity, expectedRevision } = req.body ?? {};
  if (typeof specification !== 'string' || specification.trim().length < 2 || specification.length > 100 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ error: 'المواصفات أو الكمية أو نسخة المسودة غير صالحة' });
  try {
    const updated = await prisma.$transaction(async tx => {
      const draft = await tx.agentDraft.findFirst({ where: { id: req.params.id, organizationId: req.session.organizationId!, kind: 'part_request' } });
      if (!draft) return null;
      if (!['pending_approval', 'approved_for_followup'].includes(draft.status) || draft.revision !== expectedRevision) return { state: 'stale' };
      const changed = await tx.agentDraft.updateMany({ where: { id: draft.id, organizationId: req.session.organizationId!, revision: expectedRevision }, data: { partSpecification: specification.trim(), quantity, revision: { increment: 1 }, status: 'pending_approval', approvalVersion: null } });
      if (changed.count !== 1) throw new Error('concurrent_change');
      await tx.agentEvent.create({ data: { organizationId: req.session.organizationId!, orderId: draft.orderId, actorId: req.session.userId!, action: 'part_spec_change', reason: JSON.stringify({ specificationHash: createHash('sha256').update(specification.trim()).digest('hex'), quantity, previousRevision: expectedRevision }), outcome: 'pending_approval' } });
      return { state: 'verified', draft: await tx.agentDraft.findFirst({ where: { id: draft.id, organizationId: req.session.organizationId! } }) };
    });
    return updated ? res.status(updated.state === 'verified' ? 200 : 409).json(updated) : res.status(404).json({ state: 'not_found' });
  } catch { return res.status(503).json({ state: 'unknown', nextStep: 'افحص المسودة قبل إعادة المحاولة.' }); }
});

// A technician can submit only for their own assignment. The text is evidence
// to review, not a finding that repair occurred. This never closes a request.
router.post('/agent/orders/:id/closure-report', requireRole('technician'), async (req, res) => {
  const { assetId, issueCode, workPerformed, verificationResult, verificationNote, verificationPerformed, observedIssueMatches } = req.body ?? {};
  if (typeof assetId !== 'string' || typeof issueCode !== 'string' || typeof workPerformed !== 'string' || workPerformed.length > 2000 || !['resolved', 'unresolved', 'unknown'].includes(verificationResult) || typeof verificationNote !== 'string' || verificationNote.length > 2000 || typeof verificationPerformed !== 'boolean' || typeof observedIssueMatches !== 'boolean') return res.status(400).json({ error: 'بيانات التقرير غير صالحة' });
  try {
    const orgId = req.session.organizationId!, userId = req.session.userId!;
    const profile = await prisma.technicianProfile.findFirst({ where: { userId, user: { organizationId: orgId, isActive: true, role: 'technician' } }, select: { id: true } });
    const order = profile && await prisma.agentOrder.findFirst({ where: { id: req.params.id, organizationId: orgId, technicianId: profile.id } });
    if (!order) return res.status(404).json({ error: 'الأمر غير موجود' });
    const matches = assetId === order.assetId && issueCode === order.issueCode;
    const detailed = workPerformed.trim().length >= 20 && !/^تمت الزيارة[.\s]*$/.test(workPerformed.trim());
    const contradiction = verificationResult === 'resolved' && /لم يتم|لم يحل|لا يزال|ما زال|مستمر|لم يعمل|لم أختبر|لم اختبر|لم يُختبر/.test(verificationNote);
    const state = matches && detailed && verificationPerformed && observedIssueMatches && verificationResult === 'resolved' && verificationNote.trim().length >= 10 && !contradiction ? 'manager_review' : 'needs_completion';
    const report = await prisma.$transaction(async tx => {
      const active = await tx.user.findFirst({ where: { id: userId, organizationId: orgId, role: 'technician', isActive: true }, select: { id: true } });
      if (!active) throw new Error('forbidden');
      const current = await tx.agentOrder.findFirst({ where: { id: order.id, organizationId: orgId, technicianId: profile!.id } });
      const ticket = current && await tx.maintenanceRequest.findFirst({ where: { id: current.requestId, organizationId: orgId, technicianId: profile!.id, status: 'قيد التنفيذ' }, select: { updatedAt: true } });
      if (!current || !ticket || current.assetId !== order.assetId || current.issueCode !== order.issueCode) throw new Error('assignment_changed');
      const created = await tx.agentClosure.create({ data: { organizationId: orgId, orderId: order.id, authorId: userId, technicianId: profile!.id, requestVersion: ticket.updatedAt, assetId, issueCode, workPerformed: workPerformed.trim(), verificationResult, verificationNote: verificationNote.trim(), verificationPerformed, observedIssueMatches, state } });
      await tx.agentEvent.create({ data: { organizationId: orgId, orderId: order.id, actorId: userId, action: 'closure_report', reason: 'تقرير منظم يحتاج مراجعة المسؤول', outcome: state } });
      return created;
    });
    return res.status(201).json({ state, report, matches, contradiction, attachmentContentReviewed: false, proofOfRepair: false, closed: false });
  } catch { return res.status(500).json({ error: 'تعذر حفظ التقرير' }); }
});

router.get('/agent/orders/:id/closure-reports', requireAuth, async (req, res) => {
  const orgId = req.session.organizationId!;
  const order = await prisma.agentOrder.findFirst({ where: { id: req.params.id, organizationId: orgId }, select: { technicianId: true } });
  if (!order) return res.status(404).json({ error: 'الأمر غير موجود' });
  if (req.session.userRole !== 'manager') {
    const profile = await prisma.technicianProfile.findFirst({ where: { id: order.technicianId, userId: req.session.userId!, user: { organizationId: orgId } } });
    if (req.session.userRole !== 'technician' || !profile) return res.status(403).json({ error: 'غير مصرح' });
  }
  const reports = await prisma.agentClosure.findMany({ where: { orderId: req.params.id, organizationId: orgId }, orderBy: { createdAt: 'desc' } });
  return res.json({ reports, attachmentContentReviewed: false, proofOfRepair: false });
});

router.post('/agent/orders/:id/root-cause-draft', requireRole('manager'), async (req, res) => {
  try {
    const orgId = req.session.organizationId!;
    const order = await prisma.agentOrder.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!order) return res.status(404).json({ error: 'الأمر غير موجود' });
    if (order.state === 'closed') return res.status(409).json({ state: 'review', reason: 'لا يمكن إضافة التزام فحص لأمر مغلق.' });
    // Prior administrative closures are signals supported by reports, not proof of field repairs.
    const historical = await prisma.agentOrder.findMany({ where: { organizationId: orgId, assetId: order.assetId, issueCode: order.issueCode, state: 'closed', id: { not: order.id } }, include: { closureReports: { orderBy: { createdAt: 'desc' }, take: 1 }, events: { where: { action: 'manager_close' }, take: 1 } } });
    const evidence = historical.flatMap(item => { const report = item.closureReports[0]; return report && item.events.length && report.technicianId === item.technicianId && report.assetId === item.assetId && report.issueCode === item.issueCode && report.state === 'manager_review' && report.verificationPerformed && report.observedIssueMatches ? [{ orderId: item.id, reportId: report.id, closureEventId: item.events[0].id }] : []; });
    if (evidence.length < 2) return res.status(409).json({ state: 'insufficient_evidence', priorAdministrativeRepairs: evidence.length });
    const draft = await prisma.$transaction(async tx => {
      const existing = await tx.agentDraft.findUnique({ where: { orderId_kind: { orderId: order.id, kind: 'root_cause_inspection' } } });
      if (existing) return existing;
      const created = await tx.agentDraft.create({ data: { organizationId: orgId, orderId: order.id, kind: 'root_cause_inspection', evidenceJson: JSON.stringify(evidence), description: `مسودة طلب فحص للأصل: ${evidence.length} إغلاقات إدارية سابقة مدعومة بتقارير. لا يثبت ذلك إصلاحًا ميدانيًا أو تشخيصًا.` } });
      await tx.agentEvent.create({ data: { organizationId: orgId, orderId: order.id, actorId: req.session.userId!, action: 'root_cause_draft', reason: 'إغلاقات سابقة مدعومة بتقارير تحتاج فحصًا', outcome: 'pending_approval' } });
      return created;
    });
    return res.json({ state: 'pending_approval', draft, priorAdministrativeRepairs: evidence.length, evidence, diagnosis: null, proofOfRepair: false });
  } catch { return res.status(503).json({ state: 'unknown', nextStep: 'افحص المسودات قبل إعادة المحاولة.' }); }
});

router.post('/agent/drafts/:id/inspection-result', requireRole('manager'), async (req, res) => {
  const { findings, evidenceSummary } = req.body ?? {};
  if (typeof findings !== 'string' || findings.trim().length < 10 || findings.length > 2000 || typeof evidenceSummary !== 'string' || evidenceSummary.trim().length < 10 || evidenceSummary.length > 2000) return res.status(400).json({ error: 'يلزم وصف الفحص والأدلة' });
  try {
    const result = await prisma.$transaction(async tx => {
      const draft = await tx.agentDraft.findFirst({ where: { id: req.params.id, organizationId: req.session.organizationId!, kind: 'root_cause_inspection' } });
      if (!draft) return null;
      if (draft.status !== 'approved_for_followup') return { state: 'review' };
      const changed = await tx.agentDraft.updateMany({ where: { id: draft.id, organizationId: req.session.organizationId!, status: 'approved_for_followup' }, data: { status: 'inspection_completed', resolutionJson: JSON.stringify({ findings: findings.trim(), evidenceSummary: evidenceSummary.trim() }) } });
      if (changed.count !== 1) throw new Error('concurrent_change');
      await tx.agentEvent.create({ data: { organizationId: req.session.organizationId!, orderId: draft.orderId, actorId: req.session.userId!, action: 'inspection_result', reason: 'تقرير فحص من المسؤول؛ لم يُتحقق ميدانيًا', outcome: 'inspection_completed' } });
      return { state: 'inspection_completed' };
    });
    return result ? res.status(result.state === 'inspection_completed' ? 200 : 409).json({ ...result, proofOfRepair: false }) : res.status(404).json({ state: 'not_found' });
  } catch { return res.status(503).json({ state: 'unknown' }); }
});

router.post('/agent/orders/:id/close', requireRole('manager'), async (req, res) => {
  if (req.body?.confirmReview !== true) return res.status(400).json({ error: 'يلزم تأكيد مراجعة المسؤول' });
  try {
    const outcome = await prisma.$transaction(async tx => {
      const orgId = req.session.organizationId!;
      const active = await tx.user.findFirst({ where: { id: req.session.userId!, organizationId: orgId, role: 'manager', isActive: true }, select: { id: true } });
      if (!active) return { state: 'forbidden' };
      const order = await tx.agentOrder.findFirst({ where: { id: req.params.id, organizationId: orgId }, include: { closureReports: { orderBy: { createdAt: 'desc' }, take: 1 } } });
      if (!order) return { state: 'not_found' };
      if (order.state === 'closed') return { state: 'closed' };
      const report = order.closureReports[0];
      const pending = await tx.agentDraft.count({ where: { organizationId: orgId, orderId: order.id, OR: [{ status: 'pending_approval' }, { kind: 'root_cause_inspection', status: { not: 'inspection_completed' } }] } });
      const ticket = await tx.maintenanceRequest.findFirst({ where: { id: order.requestId, organizationId: orgId }, select: { updatedAt: true, title: true, description: true } });
      const technician = await tx.technicianProfile.findFirst({ where: { id: order.technicianId, user: { organizationId: orgId } }, select: { userId: true } });
      const risk = await tx.agentIntake.findFirst({ where: { organizationId: orgId, requestId: order.requestId, state: 'escalate' }, select: { id: true } });
      if ((risk || (ticket && maintenanceAdvice(ticket.title, ticket.description).state === 'escalate')) && !await safetyReassessed(tx, orgId, order.requestId)) return { state: 'escalate' };
      if (order.state !== 'assigned' || pending > 0 || !report || !ticket || !technician || report.authorId !== technician.userId || report.technicianId !== order.technicianId || report.requestVersion.getTime() !== ticket.updatedAt.getTime() || reportHash(ticket.title, ticket.description) !== order.reportHash || report.state !== 'manager_review' || !report.verificationPerformed || !report.observedIssueMatches || report.assetId !== order.assetId || report.issueCode !== order.issueCode) return { state: 'needs_completion' };
      const changed = await tx.maintenanceRequest.updateMany({ where: { id: order.requestId, organizationId: orgId, technicianId: order.technicianId, status: 'قيد التنفيذ' }, data: { status: 'مكتملة' } });
      if (changed.count !== 1) throw new Error('request_changed');
      await tx.agentOrder.update({ where: { id: order.id }, data: { state: 'closed', revision: { increment: 1 }, activeKey: null, nextStep: 'أغلق إداريًا بعد تأكيد المسؤول؛ لم يثبت التطبيق الإصلاح ميدانيًا.' } });
      await tx.agentEvent.create({ data: { organizationId: orgId, orderId: order.id, actorId: req.session.userId!, action: 'manager_close', reason: 'تأكيد مراجعة تقرير فني منظم', outcome: 'administratively_closed' } });
      const saved = await tx.maintenanceRequest.findFirst({ where: { id: order.requestId, organizationId: orgId }, select: { status: true } });
      if (saved?.status !== 'مكتملة') throw new Error('verification_failed');
      return { state: 'closed' };
    });
    if (outcome.state === 'closed') {
      const savedOrder = await prisma.agentOrder.findFirst({ where: { id: req.params.id, organizationId: req.session.organizationId! }, select: { requestId: true, state: true } });
      const savedRequest = savedOrder && await prisma.maintenanceRequest.findFirst({ where: { id: savedOrder.requestId, organizationId: req.session.organizationId! }, select: { status: true } });
      if (savedOrder?.state !== 'closed' || savedRequest?.status !== 'مكتملة') return res.status(409).json({ state: 'inconsistent', proofOfRepair: false });
    }
    if (outcome.state === 'escalate') await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'order', 'escalated', 'risk_signal');
    return res.status(outcome.state === 'closed' ? 200 : 409).json({ ...outcome, proofOfRepair: false, attachmentContentReviewed: false });
  } catch { await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'order', 'unknown', 'write_outcome_unknown'); return res.status(503).json({ state: 'unknown', nextStep: 'افحص الأمر قبل إعادة المحاولة.' }); }
});

export default router;
