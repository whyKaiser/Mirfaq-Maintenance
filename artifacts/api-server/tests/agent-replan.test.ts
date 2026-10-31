import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { loginAs, resetDatabase, seedFixture, type Fixture } from './helpers';

describe('bounded replanning', () => {
  let fx: Fixture;
  beforeEach(async () => { await resetDatabase(); fx = await seedFixture(); await prisma.technicianProfile.update({ where: { id: fx.technicianProfileId }, data: { specialty: 'تكييف' } }); await prisma.agentAvailability.create({ data: { technicianId: fx.technicianProfileId, organizationId: fx.organizationId, available: true } }); await prisma.agentDemoPolicy.create({ data: { organizationId: fx.organizationId, enabled: false, issueCodesJson: '["hvac_leak"]', urgentWordsJson: '[]', maxWorkload: 4 } }); });
  afterAll(async () => { await prisma.$disconnect(); });
  async function setup() {
    const ticket = await prisma.maintenanceRequest.create({ data: { title: 'مكيف', description: 'المكيف يقطر ماء في الغرفة', category: 'تكييف', priority: 'عادي', status: 'معلّقة', propertyId: fx.propertyId, unitId: fx.unitId, residentId: fx.residentId, organizationId: fx.organizationId } });
    const asset = await prisma.agentAsset.create({ data: { organizationId: fx.organizationId, unitId: fx.unitId, tag: 'AC-TEST', kind: 'hvac' } });
    const manager = await loginAs(fx.managerEmail);
    const input = { requestId: ticket.id, assetId: asset.id, issueCode: 'hvac_leak', priority: 'normal', riskConfirmedSafe: true, availableTechnicianIds: [fx.technicianProfileId] };
    const plan = await manager.post('/api/agent/plan').send(input);
    const created = await manager.post('/api/agent/orders').set('Idempotency-Key', 'replan_create_key_001').send({ ...input, planToken: plan.body.planToken });
    expect(created.body.state).toBe('verified');
    return { manager, ticket, order: created.body.order as { id: string; revision: number } };
  }
  async function addTech(name: string) {
    const source = await prisma.user.findUniqueOrThrow({ where: { id: fx.technicianUserId } });
    const user = await prisma.user.create({ data: { name, email: `${name}@test.invalid`, passwordHash: source.passwordHash, role: 'technician', organizationId: fx.organizationId } });
    const profile = await prisma.technicianProfile.create({ data: { userId: user.id, specialty: 'تكييف' } });
    await prisma.agentAvailability.create({ data: { organizationId: fx.organizationId, technicianId: profile.id, available: true } });
    return profile;
  }
  it('escalates without a candidate, then reselects a newly available qualified technician without another order', async () => {
    const { manager, ticket, order } = await setup();
    const first = await manager.post(`/api/agent/orders/${order.id}/replan`).set('Idempotency-Key', 'replan_empty_key_0001').send({ reason: 'technician_absent', expectedRevision: order.revision });
    expect(first.body.state).toBe('escalate');
    expect(first.body.order.nextStep).toContain('صعّد');
    const replacement = await addTech('replan-second');
    const revision = first.body.order.revision;
    const second = await manager.post(`/api/agent/orders/${order.id}/replan`).set('Idempotency-Key', 'replan_next_key_00001').send({ reason: 'technician_absent', expectedRevision: revision });
    expect(second.body).toMatchObject({ state: 'reassigned', order: { id: order.id, technicianId: replacement.id, deliveryState: 'not_confirmed' } });
    expect((await prisma.maintenanceRequest.findUnique({ where: { id: ticket.id } }))?.technicianId).toBe(replacement.id);
    expect(await prisma.agentOrder.count()).toBe(1);
    expect((await manager.post(`/api/agent/orders/${order.id}/replan`).set('Idempotency-Key', 'replan_next_key_00001').send({ reason: 'technician_absent', expectedRevision: revision })).body.replay).toBe(true);
    expect((await manager.post(`/api/agent/orders/${order.id}/replan`).set('Idempotency-Key', 'replan_next_key_00001').send({ reason: 'workload_limit', expectedRevision: revision })).body.state).toBe('key_conflict');
    const intake = await manager.post('/api/agent/intakes').send({ requestId: ticket.id });
    await manager.post(`/api/agent/intakes/${intake.body.id}/answers`).send({ text: 'التسرب قرب لوحة الكهرباء' });
    expect((await manager.post(`/api/agent/orders/${order.id}/replan`).set('Idempotency-Key', 'replan_next_key_00001').send({ reason: 'technician_absent', expectedRevision: revision })).body.state).toBe('escalate');
    expect((await manager.get('/api/agent/commands/by-key/replan_next_key_00001')).body.state).toBe('escalate');
  });
  it('accepts at most one of two concurrent replans from the same revision', async () => {
    const { manager, order } = await setup();
    await addTech('candidate-one'); await addTech('candidate-two');
    const body = { reason: 'technician_absent', expectedRevision: order.revision };
    const results = await Promise.all([manager.post(`/api/agent/orders/${order.id}/replan`).set('Idempotency-Key', 'concurrent_replan_001').send(body), manager.post(`/api/agent/orders/${order.id}/replan`).set('Idempotency-Key', 'concurrent_replan_002').send(body)]);
    expect(results.filter(x => x.body.state === 'reassigned')).toHaveLength(1);
    expect(await prisma.agentOrder.count()).toBe(1);
    expect(await prisma.agentEvent.count({ where: { orderId: order.id, action: 'replan' } })).toBe(1);
  });
});
