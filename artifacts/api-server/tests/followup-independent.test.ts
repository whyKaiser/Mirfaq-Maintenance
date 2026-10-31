import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { loginAs, resetDatabase, seedFixture, type Fixture } from './helpers';

describe('frozen deterministic follow-up evaluation', () => {
  let fx: Fixture;
  beforeEach(async () => { await resetDatabase(); fx = await seedFixture('aamal', 'a', 'org-demo'); process.env.MIRFAQ_AUTONOMY_DEMO = '1'; await prisma.technicianProfile.update({ where: { id: fx.technicianProfileId }, data: { specialty: 'تكييف' } }); await prisma.agentAvailability.create({ data: { technicianId: fx.technicianProfileId, organizationId: fx.organizationId, available: true } }); await prisma.agentDemoPolicy.create({ data: { organizationId: fx.organizationId, enabled: true, issueCodesJson: '["hvac_leak"]', urgentWordsJson: '[]', maxWorkload: 4 } }); });
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
  it('recorded absence: existing report alone does not reassign; follow-up verifies one replacement and repeat is harmless', async () => {
    const { manager, ticket, order } = await setup();
    const replacement = await addTech('followup-qualified');
    await manager.post(`/api/agent/orders/${order.id}/block`).send({blocker:'technician_absent'});
    const before = await manager.get('/api/agent/report');
    expect(before.body.items.find((x: {id:string}) => x.id === order.id).blocker).toBe('technician_absent');
    expect((await prisma.maintenanceRequest.findUniqueOrThrow({where:{id:ticket.id}})).technicianId).toBe(fx.technicianProfileId);
    const run = await manager.post('/api/agent/demo/follow-up').send({});
    expect(run.body).toMatchObject({state:'completed', mode:'deterministic_demo', outcomes:[{orderId:order.id,state:'reassigned'}],receiptConfirmed:false});
    expect((await prisma.maintenanceRequest.findUniqueOrThrow({where:{id:ticket.id}})).technicianId).toBe(replacement.id);
    expect((await prisma.agentOrder.findUniqueOrThrow({where:{id:order.id}})).deliveryState).toBe('not_confirmed');
    expect((await manager.post('/api/agent/demo/follow-up').send({})).body.outcomes).toEqual([]);
    expect(await prisma.agentOrder.count()).toBe(1);
    expect(await prisma.agentEvent.count({where:{orderId:order.id,action:'replan'}})).toBe(1);
  });
  it('escalates once when no qualified alternative and waits for a manager', async () => {
    const { manager, order } = await setup();
    await manager.post(`/api/agent/orders/${order.id}/block`).send({blocker:'technician_absent'});
    const first = await manager.post('/api/agent/demo/follow-up').send({});
    expect(first.body.outcomes[0].state).toBe('escalate'); expect(first.body.awaitingManager).toBe(1);
    const repeat = await manager.post('/api/agent/demo/follow-up').send({});
    expect(repeat.body).toMatchObject({outcomes:[],awaitingManager:1});
    expect(await prisma.agentEvent.count({where:{orderId:order.id,action:'replan'}})).toBe(1);
  });
  it('leaves an assigned order and a part blocker to the manager', async () => {
    const { manager, order } = await setup(); await addTech('followup-unused');
    expect((await manager.post('/api/agent/demo/follow-up').send({})).body.outcomes).toEqual([]);
    await manager.post(`/api/agent/orders/${order.id}/block`).send({blocker:'part_unavailable'});
    expect((await manager.post('/api/agent/demo/follow-up').send({})).body.outcomes).toEqual([]);
    expect((await prisma.agentOrder.findUniqueOrThrow({where:{id:order.id}})).blocker).toBe('part_unavailable');
    expect(await prisma.agentDraft.count({where:{orderId:order.id,kind:'part_request',status:'pending_approval'}})).toBe(1);
  });
  it('keeps a new risk or ambiguous changed report blocked rather than reassigning', async () => {
    const { manager, ticket, order } = await setup(); await addTech('followup-risk');
    await manager.post(`/api/agent/orders/${order.id}/block`).send({blocker:'technician_absent'});
    await prisma.maintenanceRequest.update({where:{id:ticket.id},data:{description:'Smoke and sparks at the panel; uncertain cause'}});
    expect((await manager.post('/api/agent/demo/follow-up').send({})).body.outcomes[0].state).toBe('review');
    expect((await prisma.agentOrder.findUniqueOrThrow({where:{id:order.id}})).state).toBe('blocked');
    expect(await prisma.agentEvent.count({where:{orderId:order.id,action:'replan'}})).toBe(0);
  });
  it('denies residents and excludes another tenant’s blocked order', async () => {
    const { manager, order } = await setup();
    const resident = await loginAs(fx.residentEmail);
    expect((await resident.post('/api/agent/demo/follow-up').send({})).status).toBe(403);
    const foreign = await seedFixture('aamal','foreign');
    const foreignTicket = await prisma.maintenanceRequest.create({data:{ title:'Foreign', description:'Private', category:'test', priority:'normal', status:'pending', propertyId:foreign.propertyId,unitId:foreign.unitId,residentId:foreign.residentId,organizationId:foreign.organizationId }});
    const foreignAsset = await prisma.agentAsset.create({data:{organizationId:foreign.organizationId,unitId:foreign.unitId,tag:'FOREIGN',kind:'hvac'}});
    const source = await prisma.agentOrder.findUniqueOrThrow({where:{id:order.id}});
    const foreignOrder = await prisma.agentOrder.create({data:{...source,id:'foreign-order',organizationId:foreign.organizationId,requestId:foreignTicket.id,assetId:foreignAsset.id,technicianId:foreign.technicianProfileId,idempotencyKey:'foreign-order-key',activeKey:null,state:'blocked',blocker:'technician_absent'}});
    const response = await manager.post('/api/agent/demo/follow-up').send({});
    expect(JSON.stringify(response.body)).not.toContain(foreignOrder.id);
    expect((await prisma.agentOrder.findUniqueOrThrow({where:{id:foreignOrder.id}})).revision).toBe(foreignOrder.revision);
  });
  it('preserves a linked duplicate and keeps other blockers in manager review', async () => {
    const { manager, ticket, order } = await setup(); await addTech('followup-duplicate');
    const duplicate = await prisma.maintenanceRequest.create({data:{title:ticket.title,description:ticket.description,category:ticket.category,priority:ticket.priority,status:ticket.status,propertyId:fx.propertyId,unitId:fx.unitId,residentId:fx.residentId,organizationId:fx.organizationId}});
    await prisma.agentLink.create({data:{organizationId:fx.organizationId,orderId:order.id,requestId:duplicate.id}});
    await prisma.agentClaim.create({data:{organizationId:fx.organizationId,orderId:order.id,requestId:duplicate.id,kind:'linked'}});
    await manager.post(`/api/agent/orders/${order.id}/block`).send({blocker:'other'});
    expect((await manager.post('/api/agent/demo/follow-up').send({})).body.outcomes).toEqual([]);
    expect(await prisma.agentOrder.count()).toBe(1);
    expect((await prisma.agentLink.findUniqueOrThrow({where:{requestId:duplicate.id}})).orderId).toBe(order.id);
  });
  it('stops on an uncertain write without guessing a successful reassignment', async () => {
    const { manager, order } = await setup(); await addTech('followup-unknown');
    await manager.post(`/api/agent/orders/${order.id}/block`).send({blocker:'technician_absent'});
    const spy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('injected failure'));
    try {
      const response = await manager.post('/api/agent/demo/follow-up').send({});
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({state:'unknown',outcomes:[{orderId:order.id,state:'unknown'}]});
      expect((await prisma.agentOrder.findUniqueOrThrow({where:{id:order.id}})).state).toBe('blocked');
    } finally { spy.mockRestore(); }
  });
  it('requires an enabled policy and an allowed issue code before follow-up', async () => {
    const {manager,order} = await setup(); await addTech('followup-policy');
    await manager.post(`/api/agent/orders/${order.id}/block`).send({blocker:'technician_absent'});
    await prisma.agentDemoPolicy.update({where:{organizationId:fx.organizationId},data:{enabled:false}});
    const disabled = await manager.post('/api/agent/demo/follow-up').send({});
    expect(disabled.body.outcomes[0].state).toBe('review'); expect(disabled.body.awaitingManager).toBe(1);
    await prisma.agentDemoPolicy.update({where:{organizationId:fx.organizationId},data:{enabled:true,issueCodesJson:'["water_leak"]'}});
    expect((await manager.post('/api/agent/demo/follow-up').send({})).body.outcomes[0].state).toBe('review');
    expect((await prisma.agentOrder.findUniqueOrThrow({where:{id:order.id}})).state).toBe('blocked');
    expect(await prisma.agentEvent.count({where:{orderId:order.id,action:'replan'}})).toBe(0);
  });
  // Review regression, added after the frozen scenario evaluation.
  it('does not commit an escalation against an underlying request whose assignee drifted', async () => {
    const {manager,ticket,order} = await setup();
    await manager.post(`/api/agent/orders/${order.id}/block`).send({blocker:'technician_absent'});
    const before = await prisma.agentOrder.findUniqueOrThrow({where:{id:order.id}});
    await prisma.maintenanceRequest.update({where:{id:ticket.id},data:{technicianId:null}});
    const result = await manager.post('/api/agent/demo/follow-up').send({});
    expect(result.body).toMatchObject({outcomes:[{orderId:order.id,state:'review'}],awaitingManager:1});
    expect((await prisma.agentOrder.findUniqueOrThrow({where:{id:order.id}})).revision).toBe(before.revision);
    expect(await prisma.agentCommand.count({where:{orderId:order.id}})).toBe(0);
    expect(await prisma.agentEvent.count({where:{orderId:order.id,action:'replan'}})).toBe(0);
  });
  it('inspects past five review-only cases to reach a valid later order within the scan limit', async () => {
    const {manager,ticket,order} = await setup(); await addTech('followup-later');
    await manager.post(`/api/agent/orders/${order.id}/block`).send({blocker:'technician_absent'});
    const source = await prisma.agentOrder.findUniqueOrThrow({where:{id:order.id}});
    await prisma.agentOrder.update({where:{id:order.id},data:{createdAt:new Date('2026-01-01T00:00:00Z')}});
    await prisma.maintenanceRequest.update({where:{id:ticket.id},data:{technicianId:null}});
    let target='';
    for(let i=1;i<=5;i++) {
      const copy=await prisma.maintenanceRequest.create({data:{title:ticket.title,description:ticket.description,category:ticket.category,priority:ticket.priority,status:(await prisma.maintenanceRequest.findUniqueOrThrow({where:{id:ticket.id}})).status,propertyId:fx.propertyId,unitId:fx.unitId,residentId:fx.residentId,organizationId:fx.organizationId,technicianId:i===5?fx.technicianProfileId:null}});
      const cloned=await prisma.agentOrder.create({data:{...source,id:`followup-later-${i}`,requestId:copy.id,activeKey:null,idempotencyKey:`followup-later-key-${i}`,createdAt:new Date(`2026-01-0${i+1}T00:00:00Z`)}});
      if(i===5)target=cloned.id;
    }
    const response=await manager.post('/api/agent/demo/follow-up').send({});
    expect(response.body.outcomes).toHaveLength(6);expect(response.body.awaitingManager).toBe(5);expect(response.body.remaining).toBe(0);
    expect(response.body.outcomes[5]).toMatchObject({orderId:target,state:'reassigned'});
    expect(await prisma.agentEvent.count({where:{action:'replan'}})).toBe(1);
  });
});
