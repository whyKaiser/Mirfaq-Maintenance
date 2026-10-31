import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { loginAs, resetDatabase, seedFixture, type Fixture } from './helpers';
import { createOrder, inspectPlan } from '../src/lib/agent-workflow';
import { modelAdvice } from '../src/lib/model-advice';
import type { ModelProvider } from '../src/lib/model-provider';

describe('synthetic manager workflow', () => {
  let fx: Fixture;
  beforeEach(async () => { await resetDatabase(); fx = await seedFixture(); await prisma.technicianProfile.update({ where: { id: fx.technicianProfileId }, data: { specialty: 'تكييف' } }); await prisma.agentAvailability.create({ data: { organizationId: fx.organizationId, technicianId: fx.technicianProfileId, available: true } }); });
  afterAll(async () => { await prisma.$disconnect(); });

  async function setup(description = 'المكيف يقطر ماء داخل الغرفة') {
    const ticket = await prisma.maintenanceRequest.create({ data: { title: 'عطل مكيف', description, category: 'تكييف', priority: 'عادي', status: 'معلّقة', propertyId: fx.propertyId, unitId: fx.unitId, residentId: fx.residentId, organizationId: fx.organizationId } });
    const manager = await loginAs(fx.managerEmail);
    const asset = await manager.post('/api/agent/assets').send({ unitId: fx.unitId, tag: 'AC-DEMO-1', kind: 'hvac' });
    expect(asset.status).toBe(200);
    const draft = { requestId: ticket.id, assetId: asset.body.asset.id, issueCode: 'hvac_leak', priority: 'normal', riskConfirmedSafe: true, availableTechnicianIds: [fx.technicianProfileId] };
    const proposed = await manager.post('/api/agent/plan').send(draft);
    const input = { ...draft, ...(proposed.body.planToken ? { planToken: proposed.body.planToken as string } : {}) };
    return { manager, ticket, input };
  }
  it('plans, assigns, verifies persisted state, replays once, and records a parts blocker without purchase', async () => {
    const { manager, ticket, input } = await setup();
    const candidate = { ...input, dueAt: '2020-01-01T00:00:00.000Z' };
    const plan = await manager.post('/api/agent/plan').send(candidate);
    const planned = { ...candidate, planToken: plan.body.planToken as string };
    expect(plan.body).toMatchObject({ state: 'ready', technicianId: fx.technicianProfileId, availabilitySource: 'manager_attestation' });
    const key = 'demo_key_00000000001';
    const first = await manager.post('/api/agent/orders').set('Idempotency-Key', key).send(planned);
    expect(first.body).toMatchObject({ state: 'verified', replay: false, order: { deliveryState: 'not_confirmed', state: 'assigned' } });
    const reread = await manager.get(`/api/agent/orders/by-key/${key}`);
    expect(reread.body).toMatchObject({ state: 'verified', request: { technicianId: fx.technicianProfileId, status: 'قيد التنفيذ' } });
    const again = await manager.post('/api/agent/orders').set('Idempotency-Key', key).send(planned);
    expect(again.body).toMatchObject({ state: 'verified', replay: true });
    expect(await prisma.agentOrder.count()).toBe(1);
    expect((await manager.post('/api/agent/orders').set('Idempotency-Key', key).send({ ...planned, priority: 'urgent' })).body.state).toBe('key_conflict');
    const blocked = await manager.post(`/api/agent/orders/${first.body.order.id}/block`).send({ blocker: 'part_unavailable' });
    expect(blocked.body.order).toMatchObject({ state: 'blocked', blocker: 'part_unavailable' });
    expect(blocked.body.order.nextStep).toContain('لا شراء');
    expect(blocked.body.order.drafts[0]).toMatchObject({ kind: 'part_request', status: 'pending_approval' });
    const draftId = blocked.body.order.drafts[0].id;
    expect((await manager.post(`/api/agent/drafts/${draftId}/decision`).send({ decision: 'approved_for_followup', expectedRevision: 0 })).status).toBe(409);
    const specification = await manager.post(`/api/agent/drafts/${draftId}/parts-spec`).send({ specification: 'قطعة اصطناعية', quantity: 1, expectedRevision: 0 });
    expect(specification.body.draft.revision).toBe(1);
    const decision = await manager.post(`/api/agent/drafts/${draftId}/decision`).send({ decision: 'approved_for_followup', expectedRevision: 1 });
    expect(decision.body.draft.status).toBe('approved_for_followup');
    const revised = await manager.post(`/api/agent/drafts/${draftId}/parts-spec`).send({ specification: 'قطعة اصطناعية', quantity: 2, expectedRevision: 1 });
    expect(revised.body.draft).toMatchObject({ status: 'pending_approval', revision: 2, approvalVersion: null });
    expect((await manager.post(`/api/agent/drafts/${draftId}/decision`).send({ decision: 'approved_for_followup', expectedRevision: 1 })).status).toBe(409);
    expect((await manager.post(`/api/agent/drafts/${draftId}/decision`).send({ decision: 'approved_for_followup', expectedRevision: 2 })).body.draft.status).toBe('approved_for_followup');
    expect(await prisma.agentDraft.count()).toBe(1);
    const report = await manager.get('/api/agent/report');
    expect(report.body.items[0]).toMatchObject({ state: 'blocked', overdue: true, blocker: 'part_unavailable', nextOwner: 'manager', pendingApprovals: 0 });
    expect((await prisma.maintenanceRequest.findUnique({ where: { id: ticket.id } }))?.technicianId).toBe(fx.technicianProfileId);
    await prisma.maintenanceRequest.update({ where: { id: ticket.id }, data: { status: 'مكتملة' } });
    expect((await manager.get(`/api/agent/orders/by-key/${key}`)).body.state).toBe('inconsistent');
    expect((await manager.post('/api/agent/orders').set('Idempotency-Key', key).send(planned)).body.state).toBe('inconsistent');
  });
  it('requests risk confirmation, escalates water near electricity, and does not write', async () => {
    const { manager, input } = await setup('تسريب ماء قرب لوحة الكهرباء');
    expect((await manager.post('/api/agent/plan').send(input)).body.state).toBe('escalate');
    expect((await manager.post('/api/agent/orders').set('Idempotency-Key', 'danger_key_000000001').send(input)).body.state).toBe('escalate');
    expect(await prisma.agentOrder.count()).toBe(0);
  });
  it('detects exact asset and issue as a possible duplicate, but distinguishes another issue', async () => {
    const { manager, input } = await setup();
    const first = await manager.post('/api/agent/orders').set('Idempotency-Key', 'first_key_0000000001').send(input);
    const second = await prisma.maintenanceRequest.create({ data: { title: 'مكيف', description: 'المكيف يقطر ماء في الغرفة', category: 'تكييف', priority: 'عادي', status: 'معلّقة', propertyId: fx.propertyId, unitId: fx.unitId, residentId: fx.residentId, organizationId: fx.organizationId } });
    expect((await manager.post('/api/agent/plan').send({ ...input, requestId: second.id })).body.state).toBe('duplicate_review');
    expect((await manager.post('/api/agent/plan').send({ ...input, requestId: second.id, issueCode: 'hvac_no_cooling' })).body.state).toBe('ready');
    const url = `/api/agent/orders/${first.body.order.id}/link`;
    expect((await manager.post(url).send({ requestId: second.id, assetId: input.assetId, issueCode: 'hvac_no_cooling', confirmed: true })).body.state).toBe('review');
    const link = await manager.post(url).send({ requestId: second.id, assetId: input.assetId, issueCode: input.issueCode, confirmed: true });
    expect(link.body.state).toBe('verified');
    expect(await prisma.agentLink.count()).toBe(1);
    expect((await prisma.maintenanceRequest.findUnique({ where: { id: second.id } }))?.technicianId).toBeNull();
    expect((await manager.post('/api/agent/plan').send({ ...input, requestId: second.id, issueCode: 'hvac_no_cooling' })).body.state).toBe('review');
  });
  it('refuses access across organizations and rejects unavailable, unqualified or unconfirmed input', async () => {
    const { manager, input } = await setup();
    const other = await seedFixture('aamal', 'b');
    const outsider = await loginAs(other.managerEmail);
    const resident = await loginAs(fx.residentEmail);
    expect((await resident.post('/api/agent/plan').send(input)).status).toBe(403);
    expect((await outsider.post('/api/agent/plan').send(input)).body.state).toBe('not_found');
    expect((await manager.post('/api/agent/plan').send({ ...input, riskConfirmedSafe: false })).body.state).toBe('clarify');
    expect((await manager.post('/api/agent/plan').send({ ...input, availableTechnicianIds: [other.technicianProfileId] })).body.state).toBe('clarify');
  });
  it('serializes repeated concurrent submissions to at most one order', async () => {
    const { manager, input } = await setup();
    const key = 'repeat_key_000000001';
    await Promise.all([manager.post('/api/agent/orders').set('Idempotency-Key', key).send(input), manager.post('/api/agent/orders').set('Idempotency-Key', key).send(input)]);
    expect(await prisma.agentOrder.count()).toBe(1);
    expect((await manager.get(`/api/agent/orders/by-key/${key}`)).body.state).toBe('verified');
  });
  it('recovers an injected timeout after commit by reading before retrying', async () => {
    const { input } = await setup();
    const actor = { organizationId: fx.organizationId, userId: fx.managerId, role: 'manager' };
    const key = 'timeout_recovery_key01';
    const result = await createOrder(actor, input, key, { afterCommit: async () => { throw new Error('synthetic timeout after commit'); } });
    expect(result).toMatchObject({ state: 'verified', replay: true });
    expect(await prisma.agentOrder.count()).toBe(1);
    expect(await prisma.agentEvent.count()).toBe(1);
    expect((await createOrder(actor, input, key)).state).toBe('verified');
    expect(await prisma.agentOrder.count()).toBe(1);
  });
  it('rejects stale plans and rechecks a revoked manager session', async () => {
    const { manager, ticket, input } = await setup();
    await prisma.maintenanceRequest.update({ where: { id: ticket.id }, data: { description: 'المكيف لا يبرد في الغرفة' } });
    const stale = await manager.post('/api/agent/orders').set('Idempotency-Key', 'stale_test_key_00001').send(input);
    expect(stale.body.state).toBe('review');
    expect(await prisma.agentOrder.count()).toBe(0);
    await prisma.user.update({ where: { id: fx.managerId }, data: { isActive: false } });
    expect((await manager.post('/api/agent/orders').set('Idempotency-Key', 'revoked_test_key_001').send(input)).status).toBe(401);
    expect(await prisma.agentOrder.count()).toBe(0);
  });
  it('refreshes availability and does not execute a stale technician choice', async () => {
    const { manager, input } = await setup();
    await prisma.agentAvailability.update({ where: { technicianId: fx.technicianProfileId }, data: { available: false } });
    const result = await manager.post('/api/agent/orders').set('Idempotency-Key', 'availability_stale_01').send(input);
    expect(result.body.state).toBe('clarify');
    expect(await prisma.agentOrder.count()).toBe(0);
  });
  it('never displays an old keyed order as the result of a changed model plan', async () => {
    const { manager, input } = await setup();
    const key = 'bound_read_key_000001';
    await manager.post('/api/agent/orders').set('Idempotency-Key', key).send(input);
    const { readBoundOrder } = await import('../src/lib/agent-workflow');
    const result = await readBoundOrder({ organizationId: fx.organizationId, userId: fx.managerId, role: 'manager' }, { ...input, issueCode: 'hvac_no_cooling' }, key);
    expect(result.state).toBe('key_conflict');
  });
  it('mock model selects the same bound plan, write and read tools after manager approval', async () => {
    const { ticket, input } = await setup();
    const actor = { organizationId: fx.organizationId, userId: fx.managerId, role: 'manager' };
    const key = 'model_mock_key_000001';
    const calls = ['read_case', 'read_policy', 'inspect_order_plan', 'create_order', 'read_order', 'finish'];
    let index = 0;
    const mock: ModelProvider = { kind: 'mock', model: 'mock-only', async next() {
      const name = calls[index++];
      return { output: [{ type: 'function_call', name, call_id: `call-${index}`, arguments: name === 'finish' ? '{"summary":"تمت مراجعة الحالة","questions":[]}' : '{}' }] };
    } };
    const result = await modelAdvice({ title: ticket.title, description: ticket.description }, mock, {
      inspect: () => inspectPlan(actor, input),
      create: () => createOrder(actor, input, key),
      read: async () => ({ state: await prisma.agentOrder.count({ where: { organizationId: fx.organizationId, idempotencyKey: key } }) === 1 ? 'verified' : 'not_found' }),
    });
    expect(result.mode).toBe('mock');
    expect(result.execution?.state).toBe('verified');
    expect(result.trace).toEqual(calls);
    expect(await prisma.agentOrder.count()).toBe(1);
  });
  it('stores structured technician evidence without closing or claiming attachment inspection', async () => {
    const { manager, input } = await setup();
    const created = await manager.post('/api/agent/orders').set('Idempotency-Key', 'closure_test_key_0001').send(input);
    const orderId = created.body.order.id;
    const tech = await loginAs(fx.technicianEmail);
    expect((await tech.patch(`/api/requests/${input.requestId}`).send({ status: 'مكتملة' })).status).toBe(409);
    expect((await manager.post(`/api/agent/orders/${orderId}/close`).send({ confirmReview: true })).body.state).toBe('needs_completion');
    const report = { assetId: input.assetId, issueCode: input.issueCode, workPerformed: 'تمت الزيارة', verificationResult: 'unknown', verificationNote: 'لم يكتمل الاختبار بعد', verificationPerformed: false, observedIssueMatches: false };
    const missing = await tech.post(`/api/agent/orders/${orderId}/closure-report`).send(report);
    expect(missing.body).toMatchObject({ state: 'needs_completion', closed: false, attachmentContentReviewed: false, proofOfRepair: false });
    const mismatch = await tech.post(`/api/agent/orders/${orderId}/closure-report`).send({ ...report, assetId: 'wrong-asset', workPerformed: 'نظفت مجرى التصريف واختبرت المكيف', verificationResult: 'resolved', verificationNote: 'التسرب توقف بعد الاختبار' });
    expect(mismatch.body).toMatchObject({ state: 'needs_completion', matches: false });
    const conflict = await tech.post(`/api/agent/orders/${orderId}/closure-report`).send({ ...report, workPerformed: 'نظفت مجرى التصريف واختبرت المكيف', verificationResult: 'resolved', verificationNote: 'ما زال التسرب مستمرًا' });
    expect(conflict.body).toMatchObject({ state: 'needs_completion', contradiction: true });
    const ready = await tech.post(`/api/agent/orders/${orderId}/closure-report`).send({ ...report, workPerformed: 'نظفت مجرى التصريف واختبرت المكيف', verificationResult: 'resolved', verificationNote: 'التسرب توقف بعد الاختبار', verificationPerformed: true, observedIssueMatches: true });
    expect(ready.body).toMatchObject({ state: 'manager_review', closed: false, proofOfRepair: false });
    expect((await prisma.maintenanceRequest.findUnique({ where: { id: input.requestId } }))?.status).toBe('قيد التنفيذ');
    expect((await manager.post(`/api/agent/orders/${orderId}/close`).send({})).status).toBe(400);
    expect((await manager.post(`/api/agent/orders/${orderId}/close`).send({ confirmReview: true })).body).toMatchObject({ state: 'closed', proofOfRepair: false });
    expect((await prisma.maintenanceRequest.findUnique({ where: { id: input.requestId } }))?.status).toBe('مكتملة');
    expect((await manager.post(`/api/agent/orders/${orderId}/close`).send({ confirmReview: true })).body.state).toBe('closed');
    const other = await seedFixture('aamal', 'b');
    expect((await (await loginAs(other.technicianEmail)).post(`/api/agent/orders/${orderId}/closure-report`).send(report)).status).toBe(404);
  });
  it('rejects closure evidence after the original report changes', async () => {
    const { manager, input } = await setup();
    const created = await manager.post('/api/agent/orders').set('Idempotency-Key', 'closure_stale_key_0001').send(input);
    const tech = await loginAs(fx.technicianEmail);
    await tech.post(`/api/agent/orders/${created.body.order.id}/closure-report`).send({ assetId: input.assetId, issueCode: input.issueCode, workPerformed: 'نظفت مجرى التصريف واختبرت المكيف', verificationResult: 'resolved', verificationNote: 'التسرب توقف بعد الاختبار', verificationPerformed: true, observedIssueMatches: true });
    await prisma.maintenanceRequest.update({ where: { id: input.requestId }, data: { description: 'تغير البلاغ بعد التقرير' } });
    expect((await manager.post(`/api/agent/orders/${created.body.order.id}/close`).send({ confirmReview: true })).body.state).toBe('needs_completion');
    expect((await prisma.maintenanceRequest.findUnique({ where: { id: input.requestId } }))?.status).toBe('قيد التنفيذ');
  });
  it('blocks closure if a later clarification reveals danger', async () => {
    const { manager, input } = await setup();
    const created = await manager.post('/api/agent/orders').set('Idempotency-Key', 'closure_hazard_key_01').send(input);
    const tech = await loginAs(fx.technicianEmail);
    await tech.post(`/api/agent/orders/${created.body.order.id}/closure-report`).send({ assetId: input.assetId, issueCode: input.issueCode, workPerformed: 'نظفت مجرى التصريف واختبرت المكيف', verificationResult: 'resolved', verificationNote: 'التسرب توقف بعد الاختبار', verificationPerformed: true, observedIssueMatches: true });
    const intake = await manager.post('/api/agent/intakes').send({ requestId: input.requestId });
    await manager.post(`/api/agent/intakes/${intake.body.id}/answers`).send({ text: 'التسريب قرب لوحة الكهرباء' });
    expect((await manager.post(`/api/agent/orders/${created.body.order.id}/close`).send({ confirmReview: true })).body.state).toBe('escalate');
    expect((await prisma.maintenanceRequest.findUnique({ where: { id: input.requestId } }))?.status).toBe('قيد التنفيذ');
  });
  it('does not treat linked reports alone as independent completed repairs', async () => {
    const { manager, input } = await setup();
    const created = await manager.post('/api/agent/orders').set('Idempotency-Key', 'repeat_fault_key_0001').send(input);
    const orderId = created.body.order.id;
    expect((await manager.post(`/api/agent/orders/${orderId}/root-cause-draft`).send({})).body.state).toBe('insufficient_evidence');
    for (let i = 0; i < 2; i++) {
      const ticket = await prisma.maintenanceRequest.create({ data: { title: 'تسرب مكيف', description: `المكيف يقطر ماء في الغرفة ${i}`, category: 'تكييف', priority: 'عادي', status: 'معلّقة', propertyId: fx.propertyId, unitId: fx.unitId, residentId: fx.residentId, organizationId: fx.organizationId } });
      expect((await manager.post(`/api/agent/orders/${orderId}/link`).send({ requestId: ticket.id, assetId: input.assetId, issueCode: input.issueCode, confirmed: true })).body.state).toBe('verified');
    }
    const draft = await manager.post(`/api/agent/orders/${orderId}/root-cause-draft`).send({});
    expect(draft.body).toMatchObject({ state: 'insufficient_evidence', priorAdministrativeRepairs: 0 });
    expect(await prisma.agentDraft.count({ where: { kind: 'root_cause_inspection' } })).toBe(0);
  });
  it('links historical administrative reports to an inspection obligation without asserting physical repair', async () => {
    const { manager, input } = await setup();
    const tech = await loginAs(fx.technicianEmail);
    for (let i = 0; i < 2; i++) {
      const ticket = await prisma.maintenanceRequest.create({ data: { title: 'مكيف', description: 'المكيف يقطر ماء في الغرفة', category: 'تكييف', priority: 'عادي', status: 'معلّقة', propertyId: fx.propertyId, unitId: fx.unitId, residentId: fx.residentId, organizationId: fx.organizationId } });
      const p = { ...input, requestId: ticket.id, planToken: undefined };
      const plan = await manager.post('/api/agent/plan').send(p);
      const created = await manager.post('/api/agent/orders').set('Idempotency-Key', `historical_repair_000${i}`).send({ ...p, planToken: plan.body.planToken });
      expect(created.body.state).toBe('verified');
      const id = created.body.order.id;
      const report = await tech.post(`/api/agent/orders/${id}/closure-report`).send({ assetId: input.assetId, issueCode: input.issueCode, workPerformed: 'نظفت مجرى التصريف واختبرت المكيف', verificationResult: 'resolved', verificationNote: 'التسرب توقف بعد الاختبار', verificationPerformed: true, observedIssueMatches: true });
      expect(report.body.state).toBe('manager_review');
      expect((await manager.post(`/api/agent/orders/${id}/close`).send({ confirmReview: true })).body.state).toBe('closed');
    }
    const updatedPlan = await manager.post('/api/agent/plan').send({ ...input, planToken: undefined });
    const current = await manager.post('/api/agent/orders').set('Idempotency-Key', 'historical_current_001').send({ ...input, planToken: updatedPlan.body.planToken });
    const draft = await manager.post(`/api/agent/orders/${current.body.order.id}/root-cause-draft`).send({});
    expect(draft.body).toMatchObject({ state: 'pending_approval', priorAdministrativeRepairs: 2, diagnosis: null, proofOfRepair: false });
    expect(draft.body.evidence).toHaveLength(2);
    expect((await manager.post(`/api/agent/orders/${current.body.order.id}/root-cause-draft`).send({})).body.draft.id).toBe(draft.body.draft.id);
  });
});
