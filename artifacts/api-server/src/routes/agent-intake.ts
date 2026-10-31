import { Router } from 'express';
import { requireRole } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { interpretWithModel, rulesInterpret } from '../lib/agent-intake';
import { openAIResponsesProvider } from '../lib/model-provider';
import { auditAgent, auditForResponse } from '../lib/agent-audit';
import { reconcileLeakIssue } from '../lib/leak-reconciliation';

const router = Router();
const kinds: Record<string, string> = { hvac_leak: 'hvac', hvac_no_cooling: 'hvac', water_leak: 'plumbing', electrical_fault: 'electrical' };
type Facts = { issue: string; assetId: string | null; riskConfirmedSafe: boolean; hazard: boolean };
function assess(facts: Facts) {
  const questions: string[] = [];
  if (facts.hazard) return { state: 'escalate', questions: ['مؤشر خطر: راجع الحالة مع المسؤول وفق إجراءات الجهة.'] };
  if (!Object.hasOwn(kinds, facts.issue)) questions.push('ما نوع المشكلة بالتحديد؟');
  if (!facts.assetId) questions.push('أي أصل مسجل في هذه الوحدة تأثر؟');
  if (!facts.riskConfirmedSafe) questions.push('ما أثر العطل وهل توجد مخاطر تستلزم التصعيد؟');
  if (!questions.length) questions.push('تحقق من توفر الفنيين والأولوية قبل التنفيذ.');
  return { state: questions.length === 1 && facts.assetId && facts.riskConfirmedSafe && Object.hasOwn(kinds, facts.issue) ? 'ready_for_plan' : 'needs_information', questions };
}
function out(row: { id: string; requestId: string; state: string; factsJson: string; questionsJson: string; historyJson: string }) {
  return { id: row.id, requestId: row.requestId, state: row.state, facts: JSON.parse(row.factsJson), questions: JSON.parse(row.questionsJson), history: JSON.parse(row.historyJson), mode: 'rules' };
}
router.post('/agent/intakes', requireRole('manager'), async (req, res) => {
  try {
  if (typeof req.body?.requestId !== 'string') return res.status(400).json({ error: 'اختر البلاغ' });
  const org = req.session.organizationId!;
  const ticket = await prisma.maintenanceRequest.findFirst({ where: { id: req.body.requestId, organizationId: org }, select: { id: true, title: true, description: true } });
  if (!ticket) return res.status(404).json({ error: 'البلاغ غير موجود' });
  const parsed = rulesInterpret(`${ticket.title} ${ticket.description}`);
  const facts: Facts = { issue: parsed.issue, assetId: null, riskConfirmedSafe: false, hazard: parsed.hazard };
  const current = assess(facts);
  const row = await prisma.$transaction(async tx => { const created = await tx.agentIntake.create({ data: { organizationId: org, requestId: ticket.id, createdBy: req.session.userId!, state: current.state, factsJson: JSON.stringify(facts), questionsJson: JSON.stringify(current.questions), historyJson: '[]' } }); await auditAgent(org, req.session.userId!, 'intake', current.state === 'escalate' ? 'escalated' : 'recorded', current.state === 'escalate' ? 'risk_signal' : 'intake_started', tx); return created; });
  return res.status(201).json(out(row));
  } catch { res.setHeader('X-Agent-Audit-Status', 'outcome_unknown'); return res.status(503).json({ state: 'unknown' }); }
});
router.get('/agent/intakes/:id', requireRole('manager'), async (req, res) => {
  const row = await prisma.agentIntake.findFirst({ where: { id: req.params.id, organizationId: req.session.organizationId! } });
  return row ? res.json(out(row)) : res.status(404).json({ error: 'المحادثة غير موجودة' });
});
router.post('/agent/intakes/:id/answers', requireRole('manager'), async (req, res) => {
  try {
  const org = req.session.organizationId!;
  const row = await prisma.agentIntake.findFirst({ where: { id: req.params.id, organizationId: org } });
  if (!row) return res.status(404).json({ error: 'المحادثة غير موجودة' });
  const ticket = await prisma.maintenanceRequest.findFirst({ where: { id: row.requestId, organizationId: org }, select: { title: true, description: true, unitId: true } });
  if (!ticket) return res.status(404).json({ error: 'البلاغ غير موجود' });
  const { text, issueCode, assetId, riskConfirmedSafe } = req.body ?? {};
  if ((text !== undefined && (typeof text !== 'string' || text.length > 800)) || (issueCode !== undefined && (typeof issueCode !== 'string' || !Object.hasOwn(kinds, issueCode))) || (assetId !== undefined && typeof assetId !== 'string') || (riskConfirmedSafe !== undefined && typeof riskConfirmedSafe !== 'boolean')) return res.status(400).json({ error: 'الإجابة غير صالحة' });
  const previous = JSON.parse(row.factsJson) as Facts;
  const history = JSON.parse(row.historyJson) as string[];
  if (history.length >= 10) return res.status(409).json({ error: 'بلغت المحادثة حد الخطوات؛ ابدأ مراجعة جديدة.' });
  const combined = `${ticket.title} ${ticket.description} ${text ?? ''}`;
  const parsed = rulesInterpret(combined);
  const issue = issueCode ?? (previous.issue !== 'unknown' ? previous.issue : parsed.issue);
  let chosen = assetId ?? previous.assetId;
  if (chosen) {
    const asset = await prisma.agentAsset.findFirst({ where: { id: chosen, organizationId: org, unitId: ticket.unitId } });
    if (!asset || !Object.hasOwn(kinds, issue) || asset.kind !== kinds[issue]) return res.status(400).json({ error: 'الأصل لا يطابق الوحدة ونوع المشكلة.' });
    chosen = asset.id;
  }
  const facts: Facts = { issue, assetId: chosen, riskConfirmedSafe: riskConfirmedSafe ?? previous.riskConfirmedSafe, hazard: previous.hazard || parsed.hazard };
  const current = assess(facts);
  history.push(typeof text === 'string' ? text : '[إجابة منظمة من المسؤول]');
  const changed = await prisma.$transaction(async tx => { const result = await tx.agentIntake.updateMany({ where: { id: row.id, organizationId: org, updatedAt: row.updatedAt }, data: { state: current.state, factsJson: JSON.stringify(facts), questionsJson: JSON.stringify(current.questions), historyJson: JSON.stringify(history) } }); if (result.count === 1) await auditAgent(org, req.session.userId!, 'intake', current.state === 'escalate' ? 'escalated' : 'recorded', current.state === 'escalate' ? 'risk_signal' : 'intake_answered', tx); return result; });
  if (changed.count !== 1) return res.status(409).json({ error: 'تغيرت المحادثة؛ أعد قراءتها.' });
  const saved = await prisma.agentIntake.findFirst({ where: { id: row.id, organizationId: org } });
  return saved ? res.json(out(saved)) : res.status(503).json({ error: 'تعذرت قراءة الحالة المحفوظة' });
  } catch { res.setHeader('X-Agent-Audit-Status', 'outcome_unknown'); return res.status(503).json({ state: 'unknown' }); }
});
router.post('/agent/intakes/:id/model', requireRole('manager'), async (req, res) => {
  const org = req.session.organizationId!;
  if (process.env.NODE_ENV === 'production' || process.env.MIRFAQ_AGENT_DEMO_ONLY !== '1' || org !== 'org-demo') return res.status(403).json({ error: 'تجربة النموذج غير مفعلة' });
  const key = process.env.OPENAI_API_KEY, model = process.env.MIRFAQ_AGENT_MODEL;
  if (!key || !model || process.env.MIRFAQ_AGENT_PROVIDER !== 'openai-responses') return res.status(503).json({ error: 'النموذج غير مهيأ' });
  const row = await prisma.agentIntake.findFirst({ where: { id: req.params.id, organizationId: org } });
  if (!row) return res.status(404).json({ error: 'المحادثة غير موجودة' });
  const ticket = await prisma.maintenanceRequest.findFirst({ where: { id: row.requestId, organizationId: org }, select: { title: true, description: true, unitId: true } });
  if (!ticket) return res.status(404).json({ error: 'البلاغ غير موجود' });
  try {
    const history = JSON.parse(row.historyJson) as string[];
    if (!Array.isArray(history) || history.length >= 10) return res.status(409).json({ error: 'سجل الاستيضاح ممتلئ ويحتاج مراجعة.' });
    const facts = JSON.parse(row.factsJson) as Facts;
    const asset = facts.assetId ? await prisma.agentAsset.findFirst({ where: { id: facts.assetId, organizationId: org, unitId: ticket.unitId }, select: { kind: true } }) : null;
    if (facts.assetId && !asset) return res.status(409).json({ error: 'الأصل المرتبط غير متاح للمراجعة.' });
    const text = `${ticket.title}\n${ticket.description}`;
    const parsed = await interpretWithModel(text, openAIResponsesProvider({ key, model }));
    const decision = reconcileLeakIssue(text, parsed.issue, asset?.kind ?? null);
    const questions = [...parsed.questions];
    if (decision.clarificationRequired) questions.push('هل مصدر التسرب المكيف أم أنبوب المياه؟ يرجى تحديد الجزء المتضرر.');
    // Persist only bounded codes: never log the report, model text, or credentials.
    history.push(`model_decision:${JSON.stringify(decision)}`);
    const updated = await prisma.$transaction(async tx => {
      const change = await tx.agentIntake.updateMany({ where: { id: row.id, organizationId: org, updatedAt: row.updatedAt }, data: { historyJson: JSON.stringify(history) } });
      if (change.count === 1) await auditAgent(org, req.session.userId!, 'model', 'recorded', 'model_reconciled', tx);
      return change;
    });
    if (updated.count !== 1) return res.status(409).json({ error: 'تغير البلاغ أثناء التحليل، أعد المراجعة.' });
    return res.json({ ...parsed, issue: decision.finalIssue, questions, decision });
  }
  catch { await auditForResponse(res, org, req.session.userId!, 'model', 'failed', 'model_failed'); return res.status(502).json({ error: 'تعذر التفسير والتحقق من صيغته' }); }
});
export default router;
