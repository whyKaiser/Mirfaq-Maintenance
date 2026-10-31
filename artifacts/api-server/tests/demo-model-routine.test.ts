import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const model=vi.hoisted(()=>({calls:0,queue:[] as string[]}));
vi.mock('../src/lib/model-provider',()=>({openAIResponsesProvider:()=>({kind:'mock',model:'synthetic-model',next:async()=>{model.calls++;const name=model.queue.shift();if(!name)throw Error('unexpected_model_call');return {output:[{type:'function_call',name,call_id:`call-${model.calls}`,arguments:name==='finish'?JSON.stringify({summary:'تجربة اصطناعية',questions:[]}):'{}'}],usage:{input_tokens:10,output_tokens:5}};}})}));
import { prisma } from '../src/lib/prisma';
import { loginAs, resetDatabase, seedFixture, type Fixture } from './helpers';

describe('delegated demo model loop using a fake provider',()=>{
  let fx:Fixture;
  beforeEach(async()=>{await resetDatabase();fx=await seedFixture('aamal','a','org-demo');vi.stubEnv('MIRFAQ_AUTONOMY_DEMO','1');vi.stubEnv('MIRFAQ_AGENT_DEMO_ONLY','1');vi.stubEnv('MIRFAQ_AGENT_PROVIDER','openai-responses');vi.stubEnv('MIRFAQ_AGENT_MODEL','synthetic-model');vi.stubEnv('OPENAI_API_KEY','synthetic');model.calls=0;model.queue=[];await prisma.technicianProfile.update({where:{id:fx.technicianProfileId},data:{specialty:'تكييف'}});});
  afterEach(()=>vi.unstubAllEnvs());afterAll(async()=>prisma.$disconnect());
  async function fixture(description='المكيف يقطر ماء في المكتب'){
    const manager=await loginAs(fx.managerEmail);
    const asset=await prisma.agentAsset.create({data:{organizationId:fx.organizationId,unitId:fx.unitId,tag:'AC-DEMO-LOOP',kind:'hvac'}});
    const ticket=await prisma.maintenanceRequest.create({data:{organizationId:fx.organizationId,title:'تسريب مكيف تجريبي',description,category:'تكييف',priority:'عادي',status:'معلّقة',propertyId:fx.propertyId,unitId:fx.unitId,residentId:fx.residentId}});
    await manager.post('/api/agent/demo/policy').send({enabled:true,issueCodes:['hvac_leak'],urgentWords:[],maxWorkload:4});
    await manager.post('/api/agent/demo/availability').send({technicianId:fx.technicianProfileId,available:true});
    await manager.post('/api/agent/demo/fixture').send({requestId:ticket.id,assetId:asset.id,issueCode:'hvac_leak',riskStatus:'verified_safe',confirmedSynthetic:true});
    return {manager,ticket};
  }
  it('runs chosen bounded tools under saved demo delegation and verifies one order; repeat only reads',async()=>{
    const {manager,ticket}=await fixture();
    model.queue=['read_case','read_policy','inspect_order_plan','create_order','read_order','finish'];
    const r=await manager.post('/api/agent/demo/model-routine').send({requestId:ticket.id});
    expect(r.status).toBe(200);expect(r.body).toMatchObject({state:'verified',mode:'mock',execution:{state:'verified',order:{deliveryState:'not_confirmed'}}});
    expect(r.body.trace.map((t:{tool:string})=>t.tool)).toEqual(['read_case','read_policy','inspect_order_plan','create_order','read_order','finish']);
    expect(await prisma.agentOrder.count({where:{requestId:ticket.id}})).toBe(1);expect(model.calls).toBe(6);
    const repeat=await manager.post('/api/agent/demo/model-routine').send({requestId:ticket.id});
    expect(repeat.body).toMatchObject({state:'verified',mode:'saved_demo_replay'});expect(model.calls).toBe(6);expect(await prisma.agentOrder.count({where:{requestId:ticket.id}})).toBe(1);
  });
  it('stops for risk without model call or order',async()=>{
    const {manager,ticket}=await fixture('تسريب ماء قرب لوحة كهرباء وشرر');
    const r=await manager.post('/api/agent/demo/model-routine').send({requestId:ticket.id});
    expect(r.body.state).toBe('escalate');expect(model.calls).toBe(0);expect(await prisma.agentOrder.count()).toBe(0);
  });
  it('denies another tenant and disabled delegation',async()=>{
    const {manager,ticket}=await fixture();const other=await seedFixture('aamal','b');
    expect((await (await loginAs(other.managerEmail)).post('/api/agent/demo/model-routine').send({requestId:ticket.id})).status).toBe(403);
    await prisma.agentDemoPolicy.update({where:{organizationId:fx.organizationId},data:{enabled:false}});
    expect((await manager.post('/api/agent/demo/model-routine').send({requestId:ticket.id})).body.state).toBe('disabled');expect(model.calls).toBe(0);
  });
});
