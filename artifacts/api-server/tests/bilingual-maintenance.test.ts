import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { maintenanceAdvice } from '../src/lib/maintenance-advice';
import { rulesInterpret, interpretWithModel } from '../src/lib/agent-intake';
import { reconcileLeakIssue } from '../src/lib/leak-reconciliation';
import type { ModelProvider } from '../src/lib/model-provider';
import { prisma } from '../src/lib/prisma';
import { loginAs, resetDatabase, seedFixture, type Fixture } from './helpers';

describe('bilingual safety and intake rules', () => {
  it.each([
    ['The air conditioner is leaking in room 3B.', 'hvac_leak'],
    ['Water is leaking from the kitchen faucet.', 'water_leak'],
    ['The air conditioner is not cooling the room.', 'hvac_no_cooling'],
    ['المكيف يقطر ماء داخل الغرفة', 'hvac_leak'],
    ['وحدة التكييف لا تبرد غرفة النوم', 'hvac_no_cooling'],
    ['The air conditioner is not leaking.', 'unknown'],
    ['The air conditioner is near a leaking water pipe.', 'unknown'],
    ['Water is leaking near the air conditioner.', 'unknown'],
    ['There is a leak from the air conditioner.', 'hvac_leak'],
    ['تسريب ماء قرب المكيف', 'unknown'],
    ['The air conditioner is leaking and not cooling.', 'unknown'],
  ])('classifies %s conservatively', (text, expected) => {
    expect(rulesInterpret(text).issue).toBe(expected);
  });
  it.each([
    ['Kitchen tap leak. No electrical hazard.', false],
    ['تسريب صنبور المطبخ، لا يوجد خطر كهربائي.', false],
    ['Water leaking near an electrical panel.', true],
    ['No electrical hazard. Water is leaking near live wires.', true],
    ['No electrical hazard? Water is leaking.', true],
    ['No electrical hazard, but maybe there is an electrical risk near the leak.', true],
    ['The faucet is leaking. No electrical equipment is affected.', true],
    ['Smoke and sparks from an outlet.', true],
    ['دخان وشرر قرب لوحة كهرباء', true],
    ['تسريب ماء قرب لوحة الكهرباء', true],
    ['تسريب ماء، لا يوجد خطر كهربائي؟', true],
  ])('screens explicit or uncertain hazards: %s', (text, expected) => {
    expect(maintenanceAdvice('Synthetic report', text).state === 'escalate').toBe(expected);
  });
  it('reconciles leak sources without overriding conflicting evidence', () => {
    expect(reconcileLeakIssue('The air conditioner is leaking.', 'water_leak', 'hvac')).toMatchObject({finalIssue:'hvac_leak', clarificationRequired:false});
    expect(reconcileLeakIssue('The air conditioner is near a leaking pipe.', 'hvac_leak', 'hvac')).toMatchObject({finalIssue:'unknown', clarificationRequired:true});
    expect(reconcileLeakIssue('The air conditioner is not leaking.', 'hvac_leak', 'hvac')).toMatchObject({finalIssue:'unknown', clarificationRequired:true});
    expect(reconcileLeakIssue('Leak from the faucet.', 'hvac_leak', 'plumbing')).toMatchObject({finalIssue:'water_leak', clarificationRequired:false});
  });
  it('rejects a model-proposed location negated in English', async () => {
    const fake: ModelProvider={kind:'mock',model:'mock',async next(){return {output:[{type:'function_call',name:'extract_report',arguments:JSON.stringify({issue:'water_leak',location:'the kitchen',questions:[]})}]};}};
    await expect(interpretWithModel('The leak is not in the kitchen.',fake)).rejects.toThrow('invalid_extraction');
  });
});

describe('English report integration in isolated synthetic tenant', () => {
  let fx: Fixture;
  beforeEach(async()=>{await resetDatabase();fx=await seedFixture();await prisma.technicianProfile.update({where:{id:fx.technicianProfileId},data:{specialty:'تكييف'}});await prisma.agentAvailability.create({data:{organizationId:fx.organizationId,technicianId:fx.technicianProfileId,available:true}});});
  afterAll(async()=>{await prisma.$disconnect();});
  it('creates and clarifies an English report, verifies an order, reviews a duplicate, and enforces permissions', async()=>{
    const resident=await loginAs(fx.residentEmail), manager=await loginAs(fx.managerEmail);
    const created=await resident.post('/api/requests').send({title:'HVAC leak',description:'The air conditioner is leaking water in room 101.',category:'تكييف',priority:'عادي',unitId:fx.unitId});
    expect(created.status).toBe(201);
    const intake=await manager.post('/api/agent/intakes').send({requestId:created.body.id});
    expect(intake.body).toMatchObject({state:'needs_information',facts:{issue:'hvac_leak'}});
    const asset=await manager.post('/api/agent/assets').send({unitId:fx.unitId,tag:'AC-EN-101',kind:'hvac'});
    const payload={requestId:created.body.id,assetId:asset.body.asset.id,issueCode:'hvac_leak',priority:'normal',riskConfirmedSafe:true,availableTechnicianIds:[fx.technicianProfileId]};
    expect((await resident.post('/api/agent/plan').send(payload)).status).toBe(403);
    const other=await seedFixture('aamal','other');
    expect((await (await loginAs(other.managerEmail)).post('/api/agent/plan').send(payload)).body.state).toBe('not_found');
    const plan=await manager.post('/api/agent/plan').send(payload);
    expect(plan.body.state).toBe('ready');
    const first=await manager.post('/api/agent/orders').set('Idempotency-Key','english_test_key_0001').send({...payload,planToken:plan.body.planToken});
    expect(first.body).toMatchObject({state:'verified',order:{deliveryState:'not_confirmed'}});
    const next=await resident.post('/api/requests').send({title:'Air conditioner dripping',description:'Water is dripping from the air conditioner in room 101.',category:'تكييف',priority:'عادي',unitId:fx.unitId});
    expect((await manager.post('/api/agent/plan').send({...payload,requestId:next.body.id})).body.state).toBe('duplicate_review');
    expect((await manager.post('/api/agent/plan').send({...payload,requestId:next.body.id,issueCode:'hvac_no_cooling'})).body.state).toBe('ready');
    expect(await prisma.agentOrder.count()).toBe(1);
  });
});
