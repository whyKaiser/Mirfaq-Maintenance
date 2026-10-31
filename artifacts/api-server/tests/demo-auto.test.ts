import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { loginAs, resetDatabase, seedFixture, type Fixture } from './helpers';
import { executeDemoRoutine } from '../src/lib/demo-auto';

describe('explicitly delegated synthetic routine', () => {
  let fx: Fixture;
  beforeEach(async () => { await resetDatabase(); fx = await seedFixture('aamal', 'a', 'org-demo'); process.env.MIRFAQ_AUTONOMY_DEMO = '1'; await prisma.technicianProfile.update({ where: { id: fx.technicianProfileId }, data: { specialty: 'تكييف' } }); });
  afterEach(() => { delete process.env.MIRFAQ_AUTONOMY_DEMO; });
  afterAll(async () => { await prisma.$disconnect(); });
  it('uses stored availability and least workload, escalates hazard, and replays safely', async () => {
    const manager = await loginAs(fx.managerEmail);
    const tech = await prisma.user.findUniqueOrThrow({ where: { id: fx.technicianUserId } });
    const secondUser = await prisma.user.create({ data: { name: 'فني اصطناعي', email: 'tech-two@test.invalid', passwordHash: tech.passwordHash, role: 'technician', organizationId: fx.organizationId } });
    const second = await prisma.technicianProfile.create({ data: { userId: secondUser.id, specialty: 'تكييف' } });
    const asset = await prisma.agentAsset.create({ data: { organizationId: fx.organizationId, unitId: fx.unitId, tag: 'AC-SYNTHETIC', kind: 'hvac' } });
    async function ticket(description: string, assigned: string | null = null) { return prisma.maintenanceRequest.create({ data: { title: 'مكيف', description, category: 'تكييف', priority: 'عادي', status: assigned ? 'قيد التنفيذ' : 'معلّقة', propertyId: fx.propertyId, unitId: fx.unitId, residentId: fx.residentId, organizationId: fx.organizationId, technicianId: assigned } }); }
    await ticket('عمل تجريبي قائم', fx.technicianProfileId);
    const request = await ticket('المكيف يقطر ماء داخل الغرفة');
    expect((await manager.post('/api/agent/demo/routine').send({ requestId: request.id })).body.state).toBe('disabled');
    expect((await manager.post('/api/agent/demo/policy').send({ enabled: true, issueCodes: ['hvac_leak'], urgentWords: ['توقف كامل'], maxWorkload: 4 })).status).toBe(200);
    expect((await manager.post('/api/agent/demo/fixture').send({ requestId: request.id, assetId: asset.id, issueCode: 'hvac_leak', riskStatus: 'verified_safe', confirmedSynthetic: true })).status).toBe(200);
    expect((await manager.post('/api/agent/demo/routine').send({ requestId: request.id })).body.state).toBe('clarify');
    await manager.post('/api/agent/demo/availability').send({ technicianId: fx.technicianProfileId, available: true });
    await manager.post('/api/agent/demo/availability').send({ technicianId: second.id, available: true });
    const result = await manager.post('/api/agent/demo/routine').send({ requestId: request.id });
    expect(result.body).toMatchObject({ state: 'verified', mode: 'deterministic_demo', order: { technicianId: second.id, deliveryState: 'not_confirmed' } });
    expect((await manager.post('/api/agent/demo/routine').send({ requestId: request.id })).body).toMatchObject({ state: 'verified', replay: true });
    const danger = await ticket('تسريب ماء قرب لوحة الكهرباء');
    expect((await manager.post('/api/agent/demo/routine').send({ requestId: danger.id })).body.state).toBe('escalate');
    expect(await prisma.agentOrder.count()).toBe(1);
  });
  it('refreshes and reselects when availability changes between plan and commit', async () => {
    const manager = await loginAs(fx.managerEmail);
    const source = await prisma.user.findUniqueOrThrow({ where: { id: fx.technicianUserId } });
    const other = await prisma.user.create({ data: { name: 'فني بديل اصطناعي', email: 'replacement@test.invalid', passwordHash: source.passwordHash, role: 'technician', organizationId: fx.organizationId } });
    const replacement = await prisma.technicianProfile.create({ data: { userId: other.id, specialty: 'تكييف' } });
    const asset = await prisma.agentAsset.create({ data: { organizationId: fx.organizationId, unitId: fx.unitId, tag: 'AC', kind: 'hvac' } });
    const ticket = await prisma.maintenanceRequest.create({ data: { title: 'مكيف', description: 'المكيف يقطر ماء بالغرفة', category: 'تكييف', priority: 'عادي', status: 'معلّقة', propertyId: fx.propertyId, unitId: fx.unitId, residentId: fx.residentId, organizationId: fx.organizationId } });
    await manager.post('/api/agent/demo/policy').send({ enabled: true, issueCodes: ['hvac_leak'], urgentWords: [], maxWorkload: 4 });
    await manager.post('/api/agent/demo/fixture').send({ requestId: ticket.id, assetId: asset.id, issueCode: 'hvac_leak', riskStatus: 'verified_safe', confirmedSynthetic: true });
    await manager.post('/api/agent/demo/availability').send({ technicianId: fx.technicianProfileId, available: true });
    await manager.post('/api/agent/demo/availability').send({ technicianId: replacement.id, available: false });
    const result = await executeDemoRoutine({ organizationId: fx.organizationId, userId: fx.managerId, role: 'manager' }, ticket.id, { afterPlan: async () => {
      await prisma.agentAvailability.update({ where: { technicianId: fx.technicianProfileId }, data: { available: false } });
      await prisma.agentAvailability.update({ where: { technicianId: replacement.id }, data: { available: true } });
    } });
    expect(result).toMatchObject({ state: 'verified', order: { technicianId: replacement.id } });
    expect(await prisma.agentOrder.count()).toBe(1);
  });
});
