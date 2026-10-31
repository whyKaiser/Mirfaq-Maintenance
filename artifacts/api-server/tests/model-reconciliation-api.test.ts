import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// No transport or real credential: this fake returns the previously observed wrong classification.
vi.mock('../src/lib/model-provider', () => ({
  openAIResponsesProvider: () => ({ kind:'mock', model:'synthetic-model', next: async () => ({ output:[{type:'function_call', name:'extract_report', arguments:JSON.stringify({issue:'water_leak', location:null, questions:[]})}] }) }),
}));
import { prisma } from '../src/lib/prisma';
import { loginAs, resetDatabase, seedFixture } from './helpers';

describe('model reconciliation API with synthetic transport', () => {
  beforeEach(async () => { await resetDatabase(); vi.stubEnv('MIRFAQ_AGENT_DEMO_ONLY','1'); vi.stubEnv('MIRFAQ_AGENT_PROVIDER','openai-responses'); vi.stubEnv('MIRFAQ_AGENT_MODEL','synthetic-model'); vi.stubEnv('OPENAI_API_KEY','synthetic-only'); });
  afterAll(async () => { vi.unstubAllEnvs(); await prisma.$disconnect(); });
  it('persists raw and final classification, reason and scoped evidence, without user text', async () => {
    const fx = await seedFixture('aamal','demo','org-demo');
    const ticket = await prisma.maintenanceRequest.create({data:{organizationId:fx.organizationId,title:'بلاغ صيانة',description:'المكيف في الصالة يقطر ماء.',category:'صيانة',priority:'عادي',status:'جديد',propertyId:fx.propertyId,unitId:fx.unitId,residentId:fx.residentId}});
    const asset = await prisma.agentAsset.create({data:{organizationId:fx.organizationId,unitId:fx.unitId,tag:'AC-MOCK',kind:'hvac'}});
    const manager = await loginAs(fx.managerEmail);
    const started = await manager.post('/api/agent/intakes').send({requestId:ticket.id});
    const answered = await manager.post(`/api/agent/intakes/${started.body.id}/answers`).send({assetId:asset.id,issueCode:'hvac_leak'});
    expect(answered.status).toBe(200);
    const result = await manager.post(`/api/agent/intakes/${started.body.id}/model`).send({});
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({mode:'mock',issue:'hvac_leak',trustedForExecution:false,decision:{rawIssue:'water_leak',finalIssue:'hvac_leak',reason:'hvac_source_explicit'}});
    const saved = await prisma.agentIntake.findUniqueOrThrow({where:{id:started.body.id}});
    const recorded = JSON.parse(saved.historyJson).find((x:string)=>x.startsWith('model_decision:'));
    expect(JSON.parse(recorded.slice('model_decision:'.length))).toMatchObject({rawIssue:'water_leak',finalIssue:'hvac_leak',reason:'hvac_source_explicit',evidence:['leak_mentioned','explicit_hvac_source','trusted_hvac_asset']});
    expect(recorded).not.toContain(ticket.description);
    expect(await prisma.agentAudit.count({where:{organizationId:fx.organizationId,actorId:fx.managerId,action:'model',reasonCode:'model_reconciled'}})).toBe(1);
    expect(await prisma.agentOrder.count()).toBe(0);
  });
  it('refuses an unrelated tenant before invoking the model', async () => {
    const a=await seedFixture('aamal','demo','org-demo'); const b=await seedFixture('aamal','other');
    const ticket=await prisma.maintenanceRequest.create({data:{organizationId:b.organizationId,title:'بلاغ',description:'تسريب',category:'صيانة',priority:'عادي',status:'جديد',propertyId:b.propertyId,unitId:b.unitId,residentId:b.residentId}});
    const intake=await prisma.agentIntake.create({data:{organizationId:b.organizationId,requestId:ticket.id,createdBy:b.managerId,state:'needs_information',factsJson:'{}',questionsJson:'[]',historyJson:'[]'}});
    const response=await (await loginAs(a.managerEmail)).post(`/api/agent/intakes/${intake.id}/model`).send({});
    expect(response.status).toBe(404);
    expect(await prisma.agentAudit.count({where:{organizationId:a.organizationId,action:'model',reasonCode:'model_reconciled'}})).toBe(0);
  });
  it('blocks planning when a linked AC conflicts with an explicitly leaking nearby pipe', async () => {
    const fx = await seedFixture('aamal','demo','org-demo');
    const ticket = await prisma.maintenanceRequest.create({data:{organizationId:fx.organizationId,title:'بلاغ صيانة',description:'تسرب ماء من الأنبوب بجانب المكيف.',category:'صيانة',priority:'عادي',status:'جديد',propertyId:fx.propertyId,unitId:fx.unitId,residentId:fx.residentId}});
    const asset = await prisma.agentAsset.create({data:{organizationId:fx.organizationId,unitId:fx.unitId,tag:'AC-CONFLICT',kind:'hvac'}});
    const manager = await loginAs(fx.managerEmail);
    const result = await manager.post('/api/agent/plan').send({requestId:ticket.id,assetId:asset.id,issueCode:'hvac_leak',priority:'normal',riskConfirmedSafe:true,availableTechnicianIds:[fx.technicianProfileId]});
    expect(result.body.state).toBe('clarify');
    expect(result.body.reason).toContain('مصدر التسريب');
    expect(await prisma.agentOrder.count()).toBe(0);
  });
});
