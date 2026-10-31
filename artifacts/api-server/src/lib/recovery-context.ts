import { createHash } from 'node:crypto';
import { prisma } from './prisma';
import { reportHash, technicianMatchesIssue, type Actor } from './agent-workflow';
import { maintenanceAdvice } from './maintenance-advice';

export type RecoveryProposal = {
  action: 'reassign' | 'manager_review';
  technicianId: string | null;
  reason: 'recorded_absence' | 'no_eligible_candidate' | 'requires_manager';
};
export type RecoveryContext = {
  state: 'ready' | 'review' | 'forbidden' | 'not_found' | 'stale';
  reason: string;
  order?: { id: string; revision: number; state: string; blocker: string | null; issueCode: string; technicianId: string; deliveryState: string };
  report?: { title: string; description: string };
  policy?: { allowedIssueCodes: string[]; maxWorkload: number; availabilityTtlHours: number };
  candidates?: Array<{ id: string; specialty: string; workload: number }>;
  token?: string;
};
export const recoveryDemoEnabled = (actor: Actor) => process.env.NODE_ENV !== 'production' && process.env.MIRFAQ_AUTONOMY_DEMO === '1' && process.env.MIRFAQ_AGENT_DEMO_ONLY === '1' && actor.organizationId === 'org-demo';
export async function recoveryActorAllowed(actor: Actor) {
  return recoveryDemoEnabled(actor) && actor.role === 'manager' && !!await prisma.user.findFirst({where:{id:actor.userId,organizationId:actor.organizationId,role:'manager',isActive:true},select:{id:true}});
}

/** Fresh tenant-scoped facts; no model-selected tenant, SQL, credential or private contact details. */
export async function readRecoveryContext(actor: Actor, orderId: string, revision: number): Promise<RecoveryContext> {
  if (!await recoveryActorAllowed(actor)) return {state:'forbidden',reason:'authorization_required'};
  const order = await prisma.agentOrder.findFirst({where:{id:orderId,organizationId:actor.organizationId}});
  if (!order) return {state:'not_found',reason:'order_not_found'};
  if (order.revision !== revision) return {state:'stale',reason:'order_changed'};
  const ticket = await prisma.maintenanceRequest.findFirst({where:{id:order.requestId,organizationId:actor.organizationId},select:{title:true,description:true,technicianId:true,status:true,unitId:true,updatedAt:true}});
  const facts = {order:{id:order.id,revision:order.revision,state:order.state,blocker:order.blocker,issueCode:order.issueCode,technicianId:order.technicianId,deliveryState:order.deliveryState},report:ticket?{title:ticket.title,description:ticket.description}:undefined};
  const review = (reason:string):RecoveryContext => ({...facts,state:'review',reason,candidates:[]});
  if (!ticket || ticket.technicianId!==order.technicianId || ticket.status!=='قيد التنفيذ' || reportHash(ticket.title,ticket.description)!==order.reportHash) return review('report_or_assignment_changed');
  if (ticket.title.length>200 || ticket.description.length>4000) return review('report_too_long');
  if (order.state!=='blocked' || order.blocker!=='technician_absent') return review('manager_action_required');
  const risk = await prisma.agentIntake.findFirst({where:{organizationId:actor.organizationId,requestId:order.requestId,state:'escalate'},select:{id:true}});
  if (risk || maintenanceAdvice(ticket.title,ticket.description).state==='escalate') return review('risk_requires_manager');
  const asset = await prisma.agentAsset.findFirst({where:{id:order.assetId,organizationId:actor.organizationId,unitId:ticket.unitId},select:{kind:true}});
  if (!asset || (order.issueCode.startsWith('hvac_') ? asset.kind!=='hvac' : order.issueCode==='water_leak' ? asset.kind!=='plumbing' : true)) return review('asset_or_issue_requires_manager');
  const policy = await prisma.agentDemoPolicy.findUnique({where:{organizationId:actor.organizationId}});
  let issueCodes:unknown;
  try { issueCodes=policy && JSON.parse(policy.issueCodesJson); } catch { return review('policy_invalid'); }
  if (!policy?.enabled || !Array.isArray(issueCodes) || issueCodes.some(x=>typeof x!=='string') || !issueCodes.includes(order.issueCode)) return review('delegation_required');
  const available = await prisma.agentAvailability.findMany({where:{organizationId:actor.organizationId,available:true,updatedAt:{gte:new Date(Date.now()-8*60*60*1000)},technicianId:{not:order.technicianId}},select:{technicianId:true,updatedAt:true},take:101,orderBy:{technicianId:'asc'}});
  if(available.length>100) return review('candidate_scan_limit');
  const profiles = await prisma.technicianProfile.findMany({where:{id:{in:available.map(x=>x.technicianId)},user:{organizationId:actor.organizationId,role:'technician',isActive:true}},include:{_count:{select:{requests:{where:{organizationId:actor.organizationId,status:{not:'مكتملة'}}}}}}});
  const candidates = profiles.filter(x=>technicianMatchesIssue(order.issueCode,x.specialty)&&x._count.requests<policy.maxWorkload).map(x=>({id:x.id,specialty:x.specialty,workload:x._count.requests})).sort((a,b)=>a.workload-b.workload||a.id.localeCompare(b.id));
  const context:RecoveryContext = {...facts,state:'ready',reason:candidates.length?'recorded_absence':'no_eligible_candidate',policy:{allowedIssueCodes:issueCodes,maxWorkload:policy.maxWorkload,availabilityTtlHours:8},candidates};
  context.token=createHash('sha256').update(JSON.stringify({context,reportHash:order.reportHash,requestVersion:ticket.updatedAt.toISOString(),availability:available})).digest('hex');
  return context;
}

export function isRecoveryProposal(value: unknown): value is RecoveryProposal {
  if(!value || typeof value!=='object' || Array.isArray(value)) return false;
  const p=value as Record<string,unknown>;
  return Object.keys(p).sort().join(',')==='action,reason,technicianId' && ['reassign','manager_review'].includes(String(p.action)) && (p.technicianId===null || typeof p.technicianId==='string'&&p.technicianId.length>0&&p.technicianId.length<=100) && ['recorded_absence','no_eligible_candidate','requires_manager'].includes(String(p.reason));
}
export function validateRecoveryProposal(context: RecoveryContext, proposal: RecoveryProposal) {
  if(['forbidden','not_found','stale'].includes(context.state)) return {state:'rejected',reason:context.reason};
  if(proposal.action==='manager_review') {
    if(proposal.technicianId!==null || proposal.reason==='recorded_absence') return {state:'rejected',reason:'conflicting_plan'};
    if(proposal.reason==='no_eligible_candidate' && (context.state!=='ready'||context.candidates?.length)) return {state:'rejected',reason:'unsupported_claim'};
    return {state:'manager_review',reason:proposal.reason};
  }
  if(context.state!=='ready') return {state:'rejected',reason:context.reason};
  if(proposal.reason!=='recorded_absence' || !context.candidates?.some(x=>x.id===proposal.technicianId)) return {state:'rejected',reason:'candidate_not_eligible'};
  return {state:'ready',reason:'candidate_and_policy_validated'};
}
