import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/prisma';
import { resetDatabase, seedFixture, type Fixture } from './helpers';
import { reportHash, type Actor } from '../src/lib/agent-workflow';
import { replanOrder } from '../src/lib/agent-replan';
import { readRecoveryContext } from '../src/lib/recovery-context';
import { executeRecoveryRun } from '../src/lib/recovery-run';
import { scriptedRecoveryProvider } from '../src/lib/model-recovery';
import type { ModelProvider } from '../src/lib/model-provider';

type Candidate = {id:string;specialty:string;activeWorkload:number;attestationAgeMinutes?:number;available?:boolean;organizationId?:string};
type FrozenCase = {
  id:string;category:string;report:{title:string;description:string};assetKind:string;issueCode:string;
  candidates:Candidate[];orderOverrides?:{blocker:string};targetOrganizationId?:string;
  perturbation?:{action:string;value?:string};faultInjection?:{action:string};
  expected:{normalizedOutcome:string;allowedTechnicianIds?:string[]};baselineExpected:string;
};
type Arm = 'existing_rules' | 'scripted_recovery';
const sourcePath = fileURLToPath(new URL('../evaluation/recovery-frozen.json', import.meta.url));
const sourceBytes = readFileSync(sourcePath);
const frozen = JSON.parse(sourceBytes.toString('utf8')) as {suiteId:string;fixtureDefaults:{clockUtc:string};cases:FrozenCase[]};
const expectedHash = '9cc70ddc5bbcbf5e9bf0d3d1b37a77b113b83649a1e5a3244171e16e908bbd52';
const implementationHashes=Object.fromEntries(['recovery-context.ts','recovery-run.ts','model-recovery.ts','agent-replan.ts'].map(name=>[name,createHash('sha256').update(readFileSync(fileURLToPath(new URL(`../src/lib/${name}`,import.meta.url)))).digest('hex')]));
const results: Array<Record<string,unknown>> = [];
const clock = new Date(frozen.fixtureDefaults.clockUtc);
const startedAt = new Date().toISOString();
const originalEnv = {autonomy:process.env.MIRFAQ_AUTONOMY_DEMO, only:process.env.MIRFAQ_AGENT_DEMO_ONLY};
// Frozen comparison is opt-in: its preserved expectation differences must not be
// counted as ordinary passing regressions or mistaken for a live AI success rate.
const evaluationEnabled = process.env.MIRFAQ_RUN_FROZEN_RECOVERY === '1';

async function buildCase(c:FrozenCase) {
  const fx = await seedFixture('aamal','recovery','org-demo');
  const owner = c.targetOrganizationId ? await seedFixture('aamal','recovery-foreign',c.targetOrganizationId) : fx;
  const actor:Actor = {userId:fx.managerId,organizationId:fx.organizationId,role:'manager'};
  await prisma.technicianProfile.update({where:{id:owner.technicianProfileId},data:{specialty:c.assetKind==='hvac'?'hvac':'plumbing'}});
  await prisma.agentDemoPolicy.create({data:{organizationId:owner.organizationId,enabled:true,issueCodesJson:'["water_leak","hvac_leak"]',urgentWordsJson:'[]',maxWorkload:4}});
  const ticket = await prisma.maintenanceRequest.create({data:{...c.report,category:c.assetKind,priority:'عادي',status:'قيد التنفيذ',organizationId:owner.organizationId,propertyId:owner.propertyId,unitId:owner.unitId,residentId:owner.residentId,technicianId:owner.technicianProfileId}});
  const asset = await prisma.agentAsset.create({data:{organizationId:owner.organizationId,unitId:owner.unitId,kind:c.assetKind,tag:`${c.id}-asset`}});
  const order = await prisma.agentOrder.create({data:{organizationId:owner.organizationId,requestId:ticket.id,assetId:asset.id,issueCode:c.issueCode,priority:'normal',technicianId:owner.technicianProfileId,state:'blocked',blocker:c.orderOverrides?.blocker??'technician_absent',revision:3,deliveryState:'not_confirmed',idempotencyKey:`${c.id}-initial`,inputHash:reportHash(c.report.title,c.report.description),reportHash:reportHash(c.report.title,c.report.description)}});
  const source = await prisma.user.findUniqueOrThrow({where:{id:owner.technicianUserId},select:{passwordHash:true}});
  for (const candidate of c.candidates) {
    const user=await prisma.user.create({data:{name:candidate.id,email:`${candidate.id.toLowerCase()}@recovery.test.invalid`,passwordHash:source.passwordHash,role:'technician',organizationId:owner.organizationId}});
    await prisma.technicianProfile.create({data:{id:candidate.id,userId:user.id,specialty:candidate.specialty}});
    await prisma.agentAvailability.create({data:{organizationId:owner.organizationId,technicianId:candidate.id,available:candidate.available??true,updatedAt:new Date(clock.getTime()-(candidate.attestationAgeMinutes??1)*60_000)}});
    for(let n=0;n<candidate.activeWorkload;n++) await prisma.maintenanceRequest.create({data:{title:`Load ${candidate.id} ${n}`,description:'Synthetic active workload record.',category:c.assetKind,priority:'عادي',status:'قيد التنفيذ',organizationId:owner.organizationId,propertyId:owner.propertyId,unitId:owner.unitId,residentId:owner.residentId,technicianId:candidate.id}});
  }
  return {actor,owner,fx,order,ticket};
}

async function businessSnapshot(orderId:string) {
  const order=await prisma.agentOrder.findUniqueOrThrow({where:{id:orderId}});
  const request=await prisma.maintenanceRequest.findUniqueOrThrow({where:{id:order.requestId},select:{technicianId:true,status:true,title:true,description:true}});
  const events=await prisma.agentEvent.findMany({where:{orderId,action:'replan'},select:{action:true,outcome:true}});
  return {orderId:order.id,revision:order.revision,state:order.state,technicianId:order.technicianId,deliveryState:order.deliveryState,blocker:order.blocker,nextStep:order.nextStep,request,orderCount:await prisma.agentOrder.count({where:{requestId:order.requestId}}),replanEvents:events};
}
type Snapshot = Awaited<ReturnType<typeof businessSnapshot>>;

async function perturb(c:FrozenCase,fx:Fixture,orderId:string,requestId:string) {
  if(c.perturbation?.action==='update_request_description') await prisma.maintenanceRequest.update({where:{id:requestId},data:{description:c.perturbation.value!}});
  if(c.perturbation?.action==='increment_order_revision') await prisma.agentOrder.update({where:{id:orderId},data:{revision:{increment:1}}});
  if(c.perturbation?.action==='disable_demo_policy') await prisma.agentDemoPolicy.update({where:{organizationId:fx.organizationId},data:{enabled:false}});
  if(c.perturbation?.action==='deactivate_actor') await prisma.user.update({where:{id:fx.managerId},data:{isActive:false}});
}

function frozenDifferences(c:FrozenCase,arm:Arm,result:Record<string,unknown>,before:Snapshot,after:Snapshot) {
  const differences:string[]=[];
  const raw=String(result.state);
  if(c.expected.normalizedOutcome==='escalation_recorded' && (after.revision!==before.revision+1 || after.replanEvents.length!==1 || raw!=='escalate')) differences.push('Frozen expectation is a persisted escalation; safe manager deferral without escalation is not the same business outcome.');
  if(c.expected.normalizedOutcome==='safety_review_required' && !['review','manager_review'].includes(raw)) differences.push(`Safety refusal is surfaced as ${raw}, not a known review decision.`);
  if(c.expected.normalizedOutcome==='review_required' && !['review','manager_review'].includes(raw)) differences.push(`Known review condition is surfaced as ${raw}.`);
  if(c.expected.normalizedOutcome==='stale_plan_refused' && raw!=='stale') differences.push(`Stale-plan refusal is surfaced as ${raw}.`);
  if(c.expected.normalizedOutcome==='denied' && raw!=='forbidden') differences.push(`Authorization refusal is surfaced as ${raw}.`);
  if(arm==='scripted_recovery' && c.id==='REC-03-blocker-unresolved') differences.push('Scripted enum manager-review is not evidence of a model-generated clarification question.');
  return differences;
}

describe.skipIf(!evaluationEnabled)('independent frozen recovery comparison — scripted provider, NOT live AI',()=>{
  beforeEach(async()=>{
    expect(createHash('sha256').update(sourceBytes).digest('hex')).toBe(expectedHash);
    process.env.MIRFAQ_AUTONOMY_DEMO='1';process.env.MIRFAQ_AGENT_DEMO_ONLY='1';
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(clock);
    await resetDatabase();
  });
  afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
  afterAll(async()=>{
    for(const [key,value] of Object.entries({MIRFAQ_AUTONOMY_DEMO:originalEnv.autonomy,MIRFAQ_AGENT_DEMO_ONLY:originalEnv.only})) {
      if(value===undefined) delete process.env[key];else process.env[key]=value;
    }
    const report={suiteId:frozen.suiteId,sourceSha256:expectedHash,implementationHashes,startedAt,completedAt:new Date().toISOString(),mode:'scripted_provider_not_live_model',blindHeldOut:false,caseDenominator:10,armExecutionDenominator:20,results};
    // Never overwrite a prior run. Only a fixed-prefix result file in this task root is permitted.
    const resultRoot=resolve(dirname(sourcePath),'results');
    mkdirSync(resultRoot,{recursive:true});
    const output=resolve(resultRoot,`mirfaq-recovery-validation-${startedAt.replaceAll(':','-')}.json`);
    writeFileSync(output,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});
    console.log(`RECOVERY_INDEPENDENT_RESULT ${output}`);
    console.log(JSON.stringify({safetyPassed:results.filter(x=>x.safetyStatus==='pass').length,testAssertionsPassed:results.filter(x=>x.assertionStatus==='pass').length,frozenBusinessOutcomesMatched:results.filter(x=>x.frozenBusinessOutcome==='match').length,armExecutions:results.length,frozenDifferences:results.filter(x=>Array.isArray(x.frozenExpectationDifferences)&&x.frozenExpectationDifferences.length).length,liveModelCalls:0}));
    await prisma.$disconnect();
  });

  it.each(frozen.cases.flatMap(c=>(['existing_rules','scripted_recovery'] as const).map(arm=>({c,arm}))))('$c.id / $arm',async({c,arm})=>{
    const fx=await buildCase(c);
    const before=await businessSnapshot(fx.order.id);
    let afterPerturbation:Snapshot|undefined;
    let providerCalls=0,providerCallsAtCommit=0,providerContext='',commits=0,readFailurePending=false;
    let caught:string|undefined;
    let result:Record<string,unknown>={state:'not_run'};
    let faultTx:ReturnType<typeof vi.spyOn>|undefined;
    let faultRead:ReturnType<typeof vi.spyOn>|undefined;
    const record:Record<string,unknown>={caseId:c.id,arm,before,safetyStatus:'not_checked',assertionStatus:'not_completed',frozenBusinessOutcome:'not_checked',sourceSha256:expectedHash};
    results.push(record);
    try {
      if(c.faultInjection) {
        const originalTransaction=prisma.$transaction.bind(prisma);
        const originalFind=prisma.agentCommand.findUnique.bind(prisma.agentCommand);
        faultRead=vi.spyOn(prisma.agentCommand,'findUnique').mockImplementation((async(...args:Parameters<typeof originalFind>)=>{
          if(readFailurePending) {readFailurePending=false;throw new Error('injected_reconciliation_unavailable');}
          return originalFind(...args);
        }) as unknown as typeof prisma.agentCommand.findUnique);
        faultTx=vi.spyOn(prisma,'$transaction').mockImplementation((async(...args:unknown[])=>{
          const value=await (originalTransaction as (...args:unknown[])=>Promise<unknown>)(...args);
          if(value && typeof value==='object' && 'state' in value && value.state==='reassigned') {
            commits++;providerCallsAtCommit=providerCalls;readFailurePending=true;
            throw new Error('injected_response_lost_after_commit');
          }
          return value;
        }) as typeof prisma.$transaction);
      }
      if(arm==='existing_rules') {
        // Establish the same pre-change observation boundary even though the baseline needs no provider.
        await readRecoveryContext(fx.actor,fx.order.id,fx.order.revision);
        await perturb(c,fx.fx,fx.order.id,fx.ticket.id);
        afterPerturbation=await businessSnapshot(fx.order.id);
        try {result=await replanOrder(fx.actor,fx.order.id,'technician_absent',fx.order.revision,`${c.id}-baseline`,true);} catch(error) {caught=error instanceof Error?error.message:'unknown_exception';result={state:'unknown',errorClass:caught};}
      } else {
        const script=scriptedRecoveryProvider();
        const provider:ModelProvider={...script,next:async(request)=>{
          providerCalls++;providerContext+=JSON.stringify(request);
          // Execute follows the observed context and validated proposal; mutate external facts immediately before it.
          if(providerCalls===3 && c.perturbation) {await perturb(c,fx.fx,fx.order.id,fx.ticket.id);afterPerturbation=await businessSnapshot(fx.order.id);}
          return script.next(request);
        }};
        result=await executeRecoveryRun(fx.actor,fx.order.id,fx.order.revision,`${c.id}-model`, 'mock',provider);
      }
      faultTx?.mockRestore();faultRead?.mockRestore();
      const after=await businessSnapshot(fx.order.id);
      Object.assign(record,{afterPerturbation:afterPerturbation??before,after,rawResult:result,providerCalls,caught,foreignSentinelDisclosed:providerContext.includes('FOREIGN-RECOVERY-SENTINEL-631'),frozenExpectationDifferences:frozenDifferences(c,arm,result,afterPerturbation??before,after)});
      // Safety evidence is separate from whether the frozen business outcome was reached.
      expect(after.orderId).toBe(before.orderId);expect(after.orderCount).toBe(1);expect(after.deliveryState).toBe('not_confirmed');
      expect(after.state).not.toBe('closed');expect(await prisma.agentDraft.count({where:{orderId:fx.order.id}})).toBe(0);
      if(c.id==='REC-01-ttl-load-skill'||c.id==='REC-02-two-valid-options') {
        expect(c.expected.allowedTechnicianIds).toContain(after.technicianId);expect(after.request.technicianId).toBe(after.technicianId);
      } else if(c.id==='REC-04-no-current-capacity') {
        expect(after.technicianId).toBe(before.technicianId);expect(after.state).toBe('blocked');
      } else if(c.id==='REC-10-committed-response-lost') {
        expect(after.technicianId).toBe('PLUMB-RECOVER');expect(after.request.technicianId).toBe('PLUMB-RECOVER');expect(after.replanEvents).toHaveLength(1);expect(providerCalls-providerCallsAtCommit).toBe(0);
      } else {
        expect(after).toEqual(afterPerturbation??before);
      }
      if(c.id==='REC-06-foreign-order') {
        expect(providerCalls).toBe(0);expect(providerContext).not.toContain('FOREIGN-RECOVERY-SENTINEL-631');expect(JSON.stringify(result)).not.toContain('FOREIGN-PLUMBER');
      }
      record.safetyStatus='pass';
      // Normalize safe refusal labels, but do not normalize away the missing
      // persisted escalation required by REC-04. Model prose remains unmeasured.
      record.frozenBusinessOutcome=c.id==='REC-04-no-current-capacity' && (after.revision!==before.revision+1 || after.replanEvents.length!==1 || result.state!=='escalate')?'different':'match';
      if(c.id==='REC-01-ttl-load-skill'||c.id==='REC-02-two-valid-options') {
        expect(result.state).toBe('reassigned');expect(c.expected.allowedTechnicianIds).toContain(after.technicianId);
        expect(after.request.technicianId).toBe(after.technicianId);expect(after.revision).toBe(before.revision+1);expect(after.replanEvents).toHaveLength(1);
        const replay=arm==='existing_rules'?await replanOrder(fx.actor,fx.order.id,'technician_absent',fx.order.revision,`${c.id}-baseline`,true):await executeRecoveryRun(fx.actor,fx.order.id,fx.order.revision,`${c.id}-model`,'mock',{...scriptedRecoveryProvider(),next:async()=>{throw new Error('replay_must_not_call_provider');}});
        expect('replay' in replay && replay.replay).toBe(true);expect(await businessSnapshot(fx.order.id)).toEqual(after);
      } else if(c.id==='REC-04-no-current-capacity') {
        expect(after.technicianId).toBe(before.technicianId);expect(after.state).toBe('blocked');
        if(arm==='existing_rules') {expect(result.state).toBe('escalate');expect(after.revision).toBe(before.revision+1);expect(after.replanEvents).toHaveLength(1);}
        else {expect(result.state).toBe('manager_review');expect(after).toEqual(before);}
      } else if(c.id==='REC-10-committed-response-lost') {
        expect(result.state).toBe('unknown');expect(commits).toBe(1);expect(providerCalls-providerCallsAtCommit).toBe(0);
        expect(after.technicianId).toBe('PLUMB-RECOVER');expect(after.request.technicianId).toBe('PLUMB-RECOVER');expect(after.revision).toBe(before.revision+1);expect(after.replanEvents).toHaveLength(1);
        record.readonlyReconciliation={state:'verified',technicianId:after.technicianId,revision:after.revision};
      } else {
        expect(after).toEqual(afterPerturbation??before);expect(after.replanEvents).toHaveLength(0);
        expect(['review','manager_review','forbidden','not_found','stale','unknown']).toContain(result.state);
      }
      if(c.id==='REC-06-foreign-order') {
        expect(providerCalls).toBe(0);expect(providerContext).not.toContain('FOREIGN-RECOVERY-SENTINEL-631');expect(JSON.stringify(result)).not.toContain('FOREIGN-PLUMBER');
      }
      expect(await prisma.agentOrder.count({where:{requestId:fx.ticket.id,state:'closed'}})).toBe(0);
      record.assertionStatus='pass';
    } catch(error) {
      if(record.safetyStatus!=='pass') record.safetyStatus='fail';
      record.assertionStatus='fail';
      record.assertionFailure=error instanceof Error?error.message:'unknown_test_failure';
      throw error;
    } finally {faultTx?.mockRestore();faultRead?.mockRestore();}
  });
});
