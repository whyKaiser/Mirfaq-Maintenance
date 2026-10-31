import { createHash } from 'node:crypto';
import { prisma } from './prisma';
import type { Actor } from './agent-workflow';
import { reportHash } from './agent-workflow';
import { maintenanceAdvice } from './maintenance-advice';
import type { ModelProvider } from './model-provider';
import { replanOrder } from './agent-replan';
import { readRecoveryContext, recoveryActorAllowed, validateRecoveryProposal, type RecoveryContext, type RecoveryProposal } from './recovery-context';
import { runModelRecovery, type RecoveryToolResult } from './model-recovery';

const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const runKey=(key:string)=>`recovery-run-${digest(key)}`;
const executionKey=(key:string)=>`recovery-exec-${digest(key).slice(0,48)}`;
export type RecoveryMode='mock'|'real_model';
export type RecoveryTrace={tool:string;state:string;reason?:string;technicianId?:string};

async function readExecution(actor:Actor,orderId:string,key:string,expectedRevision:number):Promise<RecoveryToolResult> {
  if(!await recoveryActorAllowed(actor)) return {state:'forbidden'};
  const command=await prisma.agentCommand.findUnique({where:{organizationId_idempotencyKey:{organizationId:actor.organizationId,idempotencyKey:executionKey(key)}}});
  if(!command || command.orderId!==orderId) return {state:'not_executed'};
  const order=await prisma.agentOrder.findFirst({where:{id:orderId,organizationId:actor.organizationId}});
  const request=order&&await prisma.maintenanceRequest.findFirst({where:{id:order.requestId,organizationId:actor.organizationId},select:{technicianId:true,status:true,title:true,description:true}});
  const risk=order&&await prisma.agentIntake.findFirst({where:{organizationId:actor.organizationId,requestId:order.requestId,state:'escalate'},select:{id:true}});
  if(risk||(request&&maintenanceAdvice(request.title,request.description).state==='escalate')) return {state:'escalate'};
  if(!order||!request||!Number.isSafeInteger(expectedRevision)||order.revision!==expectedRevision+1||command.resultState!=='reassigned'||order.state!=='assigned'||order.technicianId!==command.technicianId||request.technicianId!==order.technicianId||request.status!=='قيد التنفيذ'||reportHash(request.title,request.description)!==order.reportHash||order.deliveryState!=='not_confirmed') return {state:'inconsistent'};
  return {state:'verified',orderId:order.id,revision:order.revision,technicianId:order.technicianId,receiptConfirmed:false};
}

export async function readRecoveryAttempt(actor:Actor,key:string) {
  if(!await recoveryActorAllowed(actor)) return {state:'forbidden',mode:'unknown',trace:[]};
  const run=await prisma.agentCommand.findUnique({where:{organizationId_idempotencyKey:{organizationId:actor.organizationId,idempotencyKey:runKey(key)}}});
  if(!run) return {state:'not_found',mode:'unknown',trace:[]};
  const events=await prisma.agentEvent.findMany({where:{organizationId:actor.organizationId,orderId:run.orderId,action:'recovery_tool',reason:{startsWith:`${run.id}|`}},orderBy:[{createdAt:'asc'},{id:'asc'}]});
  const trace:RecoveryTrace[]=events.map(x=>({tool:x.reason.split('|')[1],state:x.outcome,...JSON.parse(x.reason.split('|')[2]||'{}')}));
  const mode:RecoveryMode=run.resultState.startsWith('mock:')?'mock':'real_model';
  const state=run.resultState.split(':')[1];
  const saved=await readExecution(actor,run.orderId,key,Number(run.resultState.split(':')[2]));
  return {state:state==='planning'?'in_progress':state==='reassigned'&&saved.state!=='verified'?'unknown':state,mode,trace,savedState:saved.state,execution:saved,receiptConfirmed:false,replay:true};
}

/** Persistent claims prevent repeated clicks or alternate keys from launching duplicate model loops. */
export async function executeRecoveryRun(actor:Actor,orderId:string,revision:number,key:string,mode:RecoveryMode,provider:ModelProvider) {
  if(!await recoveryActorAllowed(actor)) return {state:'forbidden',mode,trace:[]};
  const inputHash=digest({orderId,revision,mode});
  const existing=await prisma.agentCommand.findUnique({where:{organizationId_idempotencyKey:{organizationId:actor.organizationId,idempotencyKey:runKey(key)}}});
  if(existing) return existing.inputHash!==inputHash||existing.orderId!==orderId?{state:'key_conflict',mode,trace:[]}:readRecoveryAttempt(actor,key);
  const preflight=await readRecoveryContext(actor,orderId,revision);
  if(['forbidden','not_found','stale'].includes(preflight.state)) return {state:preflight.state,mode,trace:[]};
  let run: {id:string};
  try {
    run=await prisma.$transaction(async tx=>{
      const member=await tx.user.findFirst({where:{id:actor.userId,organizationId:actor.organizationId,role:'manager',isActive:true},select:{id:true}});
      const order=await tx.agentOrder.findFirst({where:{id:orderId,organizationId:actor.organizationId,revision},select:{id:true}});
      if(!member||!order) throw new Error('context_changed');
      await tx.agentCommand.create({data:{organizationId:actor.organizationId,orderId,idempotencyKey:`recovery-lock-${digest({orderId,revision})}`,inputHash,resultState:'recovery_lock'}});
      return tx.agentCommand.create({data:{organizationId:actor.organizationId,orderId,idempotencyKey:runKey(key),inputHash,resultState:`${mode}:planning:${revision}`}});
    });
  } catch {
    const replay=await prisma.agentCommand.findUnique({where:{organizationId_idempotencyKey:{organizationId:actor.organizationId,idempotencyKey:runKey(key)}}});
    if(replay) return replay.inputHash===inputHash&&replay.orderId===orderId?readRecoveryAttempt(actor,key):{state:'key_conflict',mode,trace:[]};
    const lock=await prisma.agentCommand.findUnique({where:{organizationId_idempotencyKey:{organizationId:actor.organizationId,idempotencyKey:`recovery-lock-${digest({orderId,revision})}`}}});
    return {state:lock?'already_attempted':'unknown',mode,trace:[],receiptConfirmed:false};
  }
  let observed:RecoveryContext|undefined;
  let approved:{proposal:RecoveryProposal;token:string}|undefined;
  const trace:RecoveryTrace[]=[];
  const observe=async(tool:string,result:RecoveryToolResult,proposal?:RecoveryProposal)=>{
    const candidate=proposal?.technicianId&&observed?.candidates?.some(x=>x.id===proposal.technicianId)?proposal.technicianId:undefined;
    const details={...(result.reason?{reason:String(result.reason).slice(0,80)}:{}),...(candidate?{technicianId:candidate}:{})};
    const entry={tool,state:result.state,...details};trace.push(entry);
    await prisma.agentEvent.create({data:{organizationId:actor.organizationId,orderId,actorId:actor.userId,action:'recovery_tool',reason:`${run.id}|${tool}|${JSON.stringify(details)}`,outcome:result.state}});
  };
  try {
    const outcome=await runModelRecovery(provider,{
      read:async()=>{observed=await readRecoveryContext(actor,orderId,revision);approved=undefined;return observed;},
      validate:async(proposal)=>{
        approved=undefined;
        if(!observed) return {state:'rejected',reason:'context_required'};
        const current=await readRecoveryContext(actor,orderId,revision);
        if(current.state==='forbidden'||current.state==='not_found'||current.state==='stale') return {state:'rejected',reason:current.reason};
        if(observed.token!==current.token||observed.state!==current.state||observed.reason!==current.reason) return {state:'rejected',reason:'context_changed_refresh_required'};
        const decision=validateRecoveryProposal(current,proposal);
        if(decision.state==='ready'&&current.token) approved={proposal,token:current.token};
        return decision;
      },
      execute:async()=>{
        if(!approved||!approved.proposal.technicianId) return {state:'denied',reason:'plan_not_validated'};
        const current=await readRecoveryContext(actor,orderId,revision);
        if(current.state!=='ready'||current.token!==approved.token) return {state:'review',reason:'context_changed_before_execution'};
        return replanOrder(actor,orderId,'technician_absent',revision,executionKey(key),true,{technicianId:approved.proposal.technicianId,contextToken:approved.token});
      },
      readResult:()=>readExecution(actor,orderId,key,revision),observe,
    });
    await prisma.agentCommand.update({where:{id:run.id},data:{resultState:`${mode}:${outcome.state}:${revision}`}});
    return {...outcome,trace,receiptConfirmed:false};
  } catch (error) {
    // Persist uncertainty, retain the claim, and reconcile without another model request or write.
    const state=error instanceof Error&&error.message==='execution_refused'?'manager_review':'unknown';
    await prisma.agentCommand.updateMany({where:{id:run.id,resultState:`${mode}:planning:${revision}`},data:{resultState:`${mode}:${state}:${revision}`}}).catch(()=>undefined);
    const saved=await readExecution(actor,orderId,key,revision).catch(()=>({state:'unknown'}));
    return {state,mode,trace,savedState:saved.state,receiptConfirmed:false};
  }
}
