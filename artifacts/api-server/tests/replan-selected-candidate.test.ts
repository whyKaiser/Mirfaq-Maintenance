import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { replanOrder } from '../src/lib/agent-replan';
import { activeSafetyReview, safetyContext } from '../src/lib/agent-safety';
import { reportHash, type Actor } from '../src/lib/agent-workflow';
import { resetDatabase, seedFixture, type Fixture } from './helpers';

describe('server-bound model recovery candidate', () => {
  let fx: Fixture;
  let actor: Actor;
  const contextToken = 'a'.repeat(64);
  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MIRFAQ_AUTONOMY_DEMO', '1');
    vi.stubEnv('MIRFAQ_AGENT_DEMO_ONLY', '1');
    await resetDatabase();
    fx = await seedFixture('aamal', 'selected', 'org-demo');
    actor = { organizationId: fx.organizationId, userId: fx.managerId, role: 'manager' };
    await prisma.agentDemoPolicy.create({ data: { organizationId: fx.organizationId, enabled: true, issueCodesJson: '["hvac_leak"]', urgentWordsJson: '[]', maxWorkload: 4 } });
  });
  afterEach(() => { vi.unstubAllEnvs(); });
  afterAll(async () => { await prisma.$disconnect(); });

  async function fixture() {
    const ticket = await prisma.maintenanceRequest.create({ data: {
      title: 'Synthetic HVAC drain leak', description: 'Water drips from the air conditioner drain in the meeting room.',
      category: 'تكييف', priority: 'عادي', status: 'قيد التنفيذ', technicianId: fx.technicianProfileId,
      propertyId: fx.propertyId, unitId: fx.unitId, residentId: fx.residentId, organizationId: fx.organizationId,
    } });
    const asset = await prisma.agentAsset.create({ data: { organizationId: fx.organizationId, unitId: fx.unitId, tag: 'SELECTED-HVAC', kind: 'hvac' } });
    const order = await prisma.agentOrder.create({ data: {
      organizationId: fx.organizationId, requestId: ticket.id, assetId: asset.id, issueCode: 'hvac_leak', priority: 'normal',
      technicianId: fx.technicianProfileId, state: 'blocked', blocker: 'technician_absent', revision: 1,
      idempotencyKey: 'selected_initial_order', inputHash: 'fixture', reportHash: reportHash(ticket.title, ticket.description),
    } });
    return { ticket, order };
  }
  async function candidate(id: string, specialty = 'HVAC') {
    const source = await prisma.user.findUniqueOrThrow({ where: { id: fx.technicianUserId } });
    const user = await prisma.user.create({ data: { name: id, email: `${id}@test.invalid`, passwordHash: source.passwordHash, role: 'technician', organizationId: fx.organizationId } });
    const profile = await prisma.technicianProfile.create({ data: { id, userId: user.id, specialty } });
    await prisma.agentAvailability.create({ data: { organizationId: fx.organizationId, technicianId: id, available: true } });
    return profile;
  }
  async function unchanged(orderId: string) {
    expect(await prisma.agentOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ state: 'blocked', revision: 1, technicianId: fx.technicianProfileId, deliveryState: 'not_confirmed' });
    expect(await prisma.agentCommand.count()).toBe(0);
    expect(await prisma.agentEvent.count()).toBe(0);
  }

  it('uses the exact eligible second candidate, verifies one assignment and replays it', async () => {
    const { order, ticket } = await fixture();
    await candidate('candidate_a'); const chosen = await candidate('candidate_b');
    const selection = { technicianId: chosen.id, contextToken };
    const first = await replanOrder(actor, order.id, 'technician_absent', 1, 'selected_recovery_001', true, selection);
    expect(first).toMatchObject({ state: 'reassigned', replay: false, order: { technicianId: chosen.id, revision: 2, deliveryState: 'not_confirmed' } });
    expect((await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: ticket.id } })).technicianId).toBe(chosen.id);
    const repeat = await replanOrder(actor, order.id, 'technician_absent', 1, 'selected_recovery_001', true, selection);
    expect(repeat).toMatchObject({ state: 'reassigned', replay: true });
    expect(await prisma.agentOrder.count()).toBe(1);
    expect(await prisma.agentEvent.count({ where: { action: 'replan' } })).toBe(1);
  });

  it('does not substitute another eligible technician when the selected one is unavailable', async () => {
    const { order } = await fixture();
    await candidate('candidate_a'); await candidate('candidate_b');
    await prisma.agentAvailability.updateMany({ where: { technicianId: 'candidate_b' }, data: { available: false } });
    expect((await replanOrder(actor, order.id, 'technician_absent', 1, 'selected_unavailable', true, { technicianId: 'candidate_b', contextToken })).state).toBe('review');
    await unchanged(order.id);
  });

  it('binds the selected candidate and snapshot token to the idempotency key', async () => {
    const { order } = await fixture();
    await candidate('candidate_a'); await candidate('candidate_b');
    expect((await replanOrder(actor, order.id, 'technician_absent', 1, 'selected_bound_key', true, { technicianId: 'candidate_b', contextToken })).state).toBe('reassigned');
    expect((await replanOrder(actor, order.id, 'technician_absent', 1, 'selected_bound_key', true, { technicianId: 'candidate_a', contextToken })).state).toBe('key_conflict');
    expect((await replanOrder(actor, order.id, 'technician_absent', 1, 'selected_bound_key', true, { technicianId: 'candidate_b', contextToken: 'b'.repeat(64) })).state).toBe('key_conflict');
    expect(await prisma.agentCommand.count()).toBe(1);
  });

  it('requires enabled policy and recorded absence even if a caller passes false', async () => {
    const { order } = await fixture(); await candidate('candidate_b');
    await prisma.agentDemoPolicy.update({ where: { organizationId: fx.organizationId }, data: { enabled: false } });
    expect((await replanOrder(actor, order.id, 'technician_absent', 1, 'selected_disabled', false, { technicianId: 'candidate_b', contextToken })).state).toBe('review');
    await unchanged(order.id);
    await prisma.agentDemoPolicy.update({ where: { organizationId: fx.organizationId }, data: { enabled: true } });
    await prisma.agentOrder.update({ where: { id: order.id }, data: { blocker: 'part_unavailable' } });
    expect((await replanOrder(actor, order.id, 'technician_absent', 1, 'selected_wrong_blocker', false, { technicianId: 'candidate_b', contextToken })).state).toBe('review');
    await unchanged(order.id);
  });

  it('rejects a hazardous report even when an active demo safety review exists', async () => {
    const { order, ticket } = await fixture(); await candidate('candidate_b');
    const updated = await prisma.maintenanceRequest.update({ where: { id: ticket.id }, data: { description: 'Smoke and sparks are visible at the electrical panel.' } });
    await prisma.agentOrder.update({ where: { id: order.id }, data: { reportHash: reportHash(updated.title, updated.description) } });
    const context = await safetyContext(prisma, fx.organizationId, ticket.id);
    expect(context?.risk).toBe(true);
    await prisma.agentSafetyReview.create({ data: {
      organizationId: fx.organizationId, requestId: ticket.id, actorId: fx.managerId, fingerprint: context!.fingerprint,
      evidenceRef: 'synthetic containment evidence', reasonCode: 'demo_containment', state: 'reassessed', requestVersion: context!.requestVersion,
      orderId: order.id, orderRevision: order.revision, expiresAt: new Date(Date.now() + 60_000),
    } });
    expect(await activeSafetyReview(prisma, fx.organizationId, ticket.id)).not.toBeNull();
    expect((await replanOrder(actor, order.id, 'technician_absent', 1, 'selected_hazard_review', true, { technicianId: 'candidate_b', contextToken })).state).toBe('review');
    await unchanged(order.id);
  });

  it('disables model selection outside the explicit demo-only environment', async () => {
    const { order } = await fixture(); await candidate('candidate_b');
    vi.stubEnv('MIRFAQ_AGENT_DEMO_ONLY', '0');
    expect((await replanOrder(actor, order.id, 'technician_absent', 1, 'selected_no_demo', true, { technicianId: 'candidate_b', contextToken })).state).toBe('disabled');
    await unchanged(order.id);
  });
});
