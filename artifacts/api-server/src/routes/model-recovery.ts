import {Router, type Request} from 'express';
import {requireRole} from '../middleware/auth';
import {recoveryDemoEnabled} from '../lib/recovery-context';
import {executeRecoveryRun,readRecoveryAttempt} from '../lib/recovery-run';
import {scriptedRecoveryProvider} from '../lib/model-recovery';
import {openAIResponsesProvider} from '../lib/model-provider';
import {auditForResponse} from '../lib/agent-audit';
const router=Router();
const actor=(req:Request)=>({userId:req.session.userId!,organizationId:req.session.organizationId!,role:req.session.userRole!});
const liveEnabled=()=>process.env.MIRFAQ_RECOVERY_LIVE==='1'&&process.env.MIRFAQ_AGENT_PROVIDER==='openai-responses'&&!!process.env.OPENAI_API_KEY&&!!process.env.MIRFAQ_AGENT_MODEL;
router.get('/agent/demo/recovery-capabilities',requireRole('manager'),(req,res)=>res.json({liveEnabled:recoveryDemoEnabled(actor(req))&&liveEnabled()}));
router.post('/agent/demo/model-recovery/:id',requireRole('manager'),async(req,res)=>{
  const current=actor(req),key=req.header('Idempotency-Key'),revision=req.body?.expectedRevision,mode=req.body?.mode;
  if(!recoveryDemoEnabled(current)) return res.status(403).json({state:'forbidden'});
  if(!key||!/^[A-Za-z0-9_-]{16,80}$/.test(key)||!Number.isSafeInteger(revision)||revision<0||!['mock','real_model'].includes(mode)||Object.keys(req.body).some(x=>!['expectedRevision','mode'].includes(x))) return res.status(400).json({state:'invalid_input'});
  if(mode==='real_model'&&!liveEnabled()) return res.status(409).json({state:'live_recovery_disabled',mode:'real_model',trace:[]});
  try {
    const provider=mode==='mock'?scriptedRecoveryProvider():openAIResponsesProvider({key:process.env.OPENAI_API_KEY!,model:process.env.MIRFAQ_AGENT_MODEL!,budgetScope:'recovery-ui',budgetCaseId:req.params.id});
    const result=await executeRecoveryRun(current,req.params.id,revision,key,mode,provider);
    await auditForResponse(res,current.organizationId,current.userId,'replan',result.state==='reassigned'?'verified':result.state==='unknown'?'unknown':'recorded','model_recovery_result');
    return res.status(result.state==='unknown'?503:200).json(result);
  } catch {
    await auditForResponse(res,current.organizationId,current.userId,'replan','unknown','recovery_outcome_unknown');
    return res.status(503).json({state:'unknown',mode,trace:[],receiptConfirmed:false});
  }
});
router.get('/agent/demo/recovery-runs/:key',requireRole('manager'),async(req,res)=>{
  if(!/^[A-Za-z0-9_-]{16,80}$/.test(req.params.key)) return res.status(400).json({state:'invalid_input'});
  try{return res.json(await readRecoveryAttempt(actor(req),req.params.key));}
  catch{return res.status(503).json({state:'unknown',trace:[]});}
});
export default router;
