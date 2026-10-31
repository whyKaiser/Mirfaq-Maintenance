import { Router, type Request } from 'express';
import { requireRole } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { auditAgent, auditForResponse } from '../lib/agent-audit';
import { safetyContext } from '../lib/agent-safety';

const router = Router();
const enabled = (req: Request) => process.env.NODE_ENV !== 'production' && process.env.MIRFAQ_AUTONOMY_DEMO === '1' && req.session.organizationId === 'org-demo';
router.get('/agent/safety/:requestId', requireRole('manager'), async (req, res) => {
  if (!enabled(req)) return res.status(403).json({ error: 'سياسة الاحتواء التجريبية غير مفعلة' });
  const context = await prisma.$transaction(tx => safetyContext(tx, req.session.organizationId!, req.params.requestId));
  if (!context) return res.status(404).json({ error: 'البلاغ غير موجود' });
  return res.json({ fingerprint: context.fingerprint, risk: context.risk, orderRevision: context.orderRevision, requestVersion: context.requestVersion, mode: 'demo', proofOfContainment: false });
});
router.post('/agent/safety/:requestId/containment', requireRole('manager'), async (req, res) => {
  if (!enabled(req)) return res.status(403).json({ error: 'سياسة الاحتواء التجريبية غير مفعلة' });
  const { fingerprint, expectedOrderRevision, expectedRequestVersion, reasonCode, evidenceRef, confirmedSynthetic } = req.body ?? {};
  if (confirmedSynthetic !== true || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint) || typeof expectedRequestVersion !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expectedRequestVersion) || !(expectedOrderRevision === null || (Number.isSafeInteger(expectedOrderRevision) && expectedOrderRevision >= 0)) || !['demo_isolation', 'demo_inspection', 'demo_other'].includes(reasonCode) || typeof evidenceRef !== 'string' || !/^DEMO-[A-Z0-9-]{3,40}$/.test(evidenceRef)) {
    await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'safety', 'denied', 'invalid_containment');
    return res.status(400).json({ error: 'يلزم سبب ومرجع دليل demo ونسخة أمر وتأكيد الحالة الاصطناعية' });
  }
  try {
    const result = await prisma.$transaction(async tx => {
      const orgId = req.session.organizationId!, actorId = req.session.userId!;
      const active = await tx.user.findFirst({ where: { id: actorId, organizationId: orgId, role: 'manager', isActive: true }, select: { id: true } });
      if (!active) return { state: 'denied' };
      const context = await safetyContext(tx, orgId, req.params.requestId);
      if (!context) return { state: 'not_found' };
      if (!context.risk || context.fingerprint !== fingerprint || context.orderRevision !== expectedOrderRevision || context.requestVersion.toISOString() !== expectedRequestVersion) return { state: 'stale' };
      const review = await tx.agentSafetyReview.create({ data: { organizationId: orgId, requestId: req.params.requestId, actorId, fingerprint, evidenceRef, reasonCode, state: 'pending_reassessment', requestVersion: context.requestVersion, orderId: context.order?.id ?? null, orderRevision: context.orderRevision, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) } });
      await auditAgent(orgId, actorId, 'safety', 'recorded', 'containment_claim', tx);
      return { state: 'pending_reassessment', reviewId: review.id };
    });
    return res.status(result.state === 'pending_reassessment' ? 201 : 409).json({ ...result, proofOfContainment: false });
  } catch { await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'safety', 'unknown', 'containment_unknown'); return res.status(503).json({ state: 'unknown' }); }
});
router.post('/agent/safety/:requestId/reassess', requireRole('manager'), async (req, res) => {
  if (!enabled(req)) return res.status(403).json({ error: 'سياسة الاحتواء التجريبية غير مفعلة' });
  const { reviewId, confirmedReassessment } = req.body ?? {};
  if (typeof reviewId !== 'string' || confirmedReassessment !== true) return res.status(400).json({ error: 'يلزم تأكيد إعادة التقييم التجريبية' });
  try {
    const result = await prisma.$transaction(async tx => {
      const orgId = req.session.organizationId!, actorId = req.session.userId!;
      const active = await tx.user.findFirst({ where: { id: actorId, organizationId: orgId, role: 'manager', isActive: true }, select: { id: true } });
      if (!active) return { state: 'denied' };
      const review = await tx.agentSafetyReview.findFirst({ where: { id: reviewId, organizationId: orgId, requestId: req.params.requestId } });
      const context = await safetyContext(tx, orgId, req.params.requestId);
      if (!review || !context) return { state: 'not_found' };
      if (!context.risk || review.fingerprint !== context.fingerprint || review.requestVersion.getTime() !== context.requestVersion.getTime() || review.orderRevision !== context.orderRevision || review.orderId !== (context.order?.id ?? null) || review.expiresAt <= new Date()) return { state: 'stale' };
      if (review.state === 'reassessed') return { state: 'reassessed', replay: true };
      if (review.state !== 'pending_reassessment') return { state: 'stale' };
      const changed = await tx.agentSafetyReview.updateMany({ where: { id: review.id, organizationId: orgId, state: 'pending_reassessment' }, data: { state: 'reassessed' } });
      if (changed.count !== 1) throw new Error('concurrent_change');
      await auditAgent(orgId, actorId, 'safety', 'recorded', 'demo_reassessed', tx);
      return { state: 'reassessed', replay: false };
    });
    return res.status(result.state === 'reassessed' ? 200 : 409).json({ ...result, proofOfContainment: false, automaticAssignment: false });
  } catch { await auditForResponse(res, req.session.organizationId!, req.session.userId!, 'safety', 'unknown', 'reassessment_unknown'); return res.status(503).json({ state: 'unknown' }); }
});
export default router;
