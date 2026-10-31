import { closeSync, existsSync, fsyncSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

// Monetary units are integer nanodollars. The original ledger is never rewritten.
export const SPEND_POLICY = Object.freeze({ model:'gpt-5.6-luna', initialExtraCalls:12, maxExtraCalls:19, finalExtraCalls:25, recoveryExtraCalls:30, recoveryNewCalls:8, initialCeiling:1_000_000_000, ceiling:5_000_000_000, countReserve:200_000_000, reservation:526_080_000, maxInput:1_050_000, maxOutput:600, maxRequestBytes:16_000, pricingValidUntil:'2026-11-01T00:00:00Z' });
export type BudgetScope = 'delegated-ui' | 'recovery-ui';
type Event = Record<string, unknown> & {type:string; seq:number; prev:string; hash:string};
type State = {events:Event[]; settled:number; pending:string|null; stopped:boolean; attempts:number; ceiling:number; attemptLimit:number; targetRequestId:string|null; recoveryCaseIds:string[]|null};
const hash = (v:string|Buffer) => createHash('sha256').update(v).digest('hex');
const journal = (legacy:string) => `${legacy}.journal.jsonl`;
const sourceHash = (legacy:string) => hash(readFileSync(legacy));
const settlement = (input:number, output:number) => input * 500 + output * 1800;
function locked<T>(legacy:string, fn:()=>T):T {
  if (!legacy || !existsSync(legacy)) throw Error('model_budget_unavailable');
  const p=`${legacy}.lock`, fd=openSync(p,'wx',0o600);
  let uncertain=false;
  try { return fn(); } catch(e) { if(e instanceof Error && e.message==='journal_io_uncertain') uncertain=true; throw e; }
  finally { closeSync(fd); if(!uncertain) unlinkSync(p); }
}
function append(legacy:string, core:Record<string,unknown>, exclusive=false) {
  const event={...core,hash:hash(JSON.stringify(core))};
  const bytes=Buffer.from(JSON.stringify(event)+'\n');
  let fd:number|undefined;
  try { fd=openSync(journal(legacy),exclusive?'wx':'a',0o600); if(writeSync(fd,bytes)!==bytes.length) throw Error('journal_short_write'); fsyncSync(fd); }
  catch { throw Error('journal_io_uncertain'); }
  finally { if(fd!==undefined) closeSync(fd); }
}
function validUsage(input:unknown,output:unknown): input is number {
  return Number.isSafeInteger(input) && (input as number)>=0 && (input as number)<=SPEND_POLICY.maxInput && Number.isSafeInteger(output) && (output as number)>=0 && (output as number)<=SPEND_POLICY.maxOutput;
}
function validRecoveryCases(value:unknown): value is [string,string] {
  return Array.isArray(value) && value.length===2 && value.every(x=>typeof x==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(x)) && value[0]!==value[1];
}
function scopeAllowed(attempts:number,targetRequestId:string|null,recoveryCaseIds:string[]|null,scope:unknown,requestId:unknown) {
  if(recoveryCaseIds) return scope==='recovery-ui' && typeof requestId==='string' && recoveryCaseIds.includes(requestId);
  if(scope!==undefined && scope!=='delegated-ui') return false;
  if(attempts>=SPEND_POLICY.initialExtraCalls && (scope!=='delegated-ui' || requestId!==targetRequestId)) return false;
  return !(scope==='delegated-ui' && targetRequestId!==null && requestId!==targetRequestId);
}
function load(legacy:string):State {
  const raw=readFileSync(journal(legacy),'utf8');
  if(!raw.endsWith('\n')) throw Error('journal_incomplete');
  const lines=raw.trimEnd().split('\n'); if(!lines.length || lines.length>75) throw Error('journal_invalid');
  const events=lines.map(x=>JSON.parse(x)) as Event[];
  let prev='0'.repeat(64), settled=0, pending:string|null=null, stopped=false, attempts=0, ceiling:number=SPEND_POLICY.initialCeiling, attemptLimit:number=SPEND_POLICY.initialExtraCalls, targetRequestId:string|null=null, recoveryCaseIds:string[]|null=null;
  for(const [seq,e] of events.entries()) {
    const {hash:actual,...core}=e;
    if(e.seq!==seq || e.prev!==prev || typeof actual!=='string' || hash(JSON.stringify(core))!==actual) throw Error('journal_invalid');
    prev=actual;
    if(seq===0) {
      if(e.type!=='genesis' || e.legacyHash!==sourceHash(legacy) || e.countReserve!==SPEND_POLICY.countReserve || e.inputTokens!==5284 || e.outputTokens!==382 || e.settled!==settlement(5284,382) || e.previousReservation!==726_080_000 || e.released!==726_080_000-SPEND_POLICY.countReserve-settlement(5284,382)) throw Error('journal_genesis_invalid');
      settled=e.settled as number;
    } else if(e.type==='reserve') {
      if(stopped || pending || attempts>=attemptLimit || !scopeAllowed(attempts,targetRequestId,recoveryCaseIds,e.scope,e.requestId) || typeof e.id!=='string' || !/^[0-9a-f-]{36}$/.test(e.id) || e.amount!==SPEND_POLICY.reservation || settled+SPEND_POLICY.countReserve+SPEND_POLICY.reservation>ceiling) throw Error('journal_invalid_reservation');
      pending=e.id; attempts++;
    } else if(e.type==='settle') {
      if(stopped || !pending || e.id!==pending || !validUsage(e.inputTokens,e.outputTokens) || e.amount!==settlement(e.inputTokens as number,e.outputTokens as number) || e.released!==SPEND_POLICY.reservation-(e.amount as number)) throw Error('journal_invalid_settlement');
      settled+=e.amount as number; pending=null;
    } else if(e.type==='raise_ceiling') {
      if(stopped || pending || ceiling!==SPEND_POLICY.initialCeiling || e.previousCeiling!==SPEND_POLICY.initialCeiling || e.ceiling!==SPEND_POLICY.ceiling || e.authorization!=='owner_approved_2026_10_31') throw Error('journal_invalid_authorization');
      ceiling=SPEND_POLICY.ceiling;
    } else if(e.type==='raise_attempt_limit') {
      if(stopped || pending || ceiling!==SPEND_POLICY.ceiling || attemptLimit!==SPEND_POLICY.initialExtraCalls || e.previousLimit!==SPEND_POLICY.initialExtraCalls || e.limit!==SPEND_POLICY.maxExtraCalls || e.purpose!=='one_actual_ui_loop' || typeof e.requestId!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(e.requestId)) throw Error('journal_invalid_authorization');
      attemptLimit=SPEND_POLICY.maxExtraCalls;
      targetRequestId=e.requestId;
    } else if(e.type==='authorize_english_ui_loop') {
      if(stopped || pending || ceiling!==SPEND_POLICY.ceiling || attemptLimit!==SPEND_POLICY.maxExtraCalls || attempts!==16 || e.expectedAttempts!==16 || e.previousLimit!==SPEND_POLICY.maxExtraCalls || e.limit!==SPEND_POLICY.finalExtraCalls || e.previousRequestId!==targetRequestId || e.purpose!=='one_fresh_english_ui_loop' || typeof e.requestId!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(e.requestId) || e.requestId===targetRequestId) throw Error('journal_invalid_authorization');
      attemptLimit=SPEND_POLICY.finalExtraCalls;
      targetRequestId=e.requestId;
    } else if(e.type==='authorize_recovery_ui') {
      if(stopped || pending || recoveryCaseIds!==null || ceiling!==SPEND_POLICY.ceiling || attemptLimit!==SPEND_POLICY.finalExtraCalls || attempts!==22 || e.expectedAttempts!==22 || e.previousLimit!==SPEND_POLICY.finalExtraCalls || e.limit!==SPEND_POLICY.recoveryExtraCalls || e.previousRequestId!==targetRequestId || e.purpose!=='two_synthetic_recovery_cases' || !validRecoveryCases(e.caseIds) || settled+SPEND_POLICY.countReserve+SPEND_POLICY.recoveryNewCalls*SPEND_POLICY.reservation>ceiling) throw Error('journal_invalid_authorization');
      attemptLimit=SPEND_POLICY.recoveryExtraCalls;
      recoveryCaseIds=e.caseIds;
    } else if(e.type==='unknown') {
      if(stopped || !pending || e.id!==pending) throw Error('journal_invalid_unknown');
      stopped=true;
    } else throw Error('journal_invalid_event');
  }
  return {events,settled,pending,stopped,attempts,ceiling,attemptLimit,targetRequestId,recoveryCaseIds};
}
function next(s:State, event:Record<string,unknown>) { return {seq:s.events.length,prev:s.events.at(-1)!.hash,...event}; }

/** Called once only on the verified legacy file. `expectedHash` is pinned by the caller. */
export function reconcileLegacy(legacy:string, expectedHash:string) {
  return locked(legacy,()=>{
    if(existsSync(journal(legacy)) || sourceHash(legacy)!==expectedHash) throw Error('legacy_or_journal_changed');
    const l=JSON.parse(readFileSync(legacy,'utf8'));
    if(l.version!==1 || l.model!==SPEND_POLICY.model || l.blocked!==true || !Array.isArray(l.entries) || l.entries.length!==11 || l.entries.some((e:any,i:number)=>e.status!=='success'||!validUsage(e.inputTokens,e.outputTokens)||e.reservedMicroUsd!==(i===10?526080:20000)) || l.entries.reduce((s:number,e:any)=>s+e.inputTokens,0)!==5284 || l.entries.reduce((s:number,e:any)=>s+e.outputTokens,0)!==382 || l.entries.slice(0,10).some((e:any)=>!Number.isSafeInteger(e.countTokens)) || l.entries.reduce((s:number,e:any)=>s+(e.countTokens||0),0)!==4208) throw Error('legacy_unreconciled');
    const settled=settlement(5284,382);
    append(legacy,{seq:0,prev:'0'.repeat(64),type:'genesis',legacyHash:expectedHash,inputTokens:5284,outputTokens:382,settled,countReserve:SPEND_POLICY.countReserve,previousReservation:726_080_000,released:726_080_000-SPEND_POLICY.countReserve-settled,source:'ledger_and_independent_usage_dashboard'},true);
  });
}
export function reserveResponse(legacy:string, scope?:BudgetScope, requestId?:string) {
  return locked(legacy,()=>{
    const s=load(legacy);
    if(s.stopped || s.pending || s.attempts>=s.attemptLimit || !scopeAllowed(s.attempts,s.targetRequestId,s.recoveryCaseIds,scope,requestId) || s.settled+SPEND_POLICY.countReserve+SPEND_POLICY.reservation>s.ceiling) throw Error('model_budget_exhausted_or_unknown');
    const id=randomUUID(); append(legacy,next(s,{type:'reserve',id,amount:SPEND_POLICY.reservation,...(scope?{scope,requestId}: {})})); return id;
  });
}
export function settleResponse(legacy:string,id:string,input:number,output:number) {
  return locked(legacy,()=>{
    const s=load(legacy); if(s.stopped || s.pending!==id || !validUsage(input,output)) throw Error('model_budget_bad_settlement');
    const amount=settlement(input,output); if(amount>SPEND_POLICY.reservation) throw Error('model_budget_bad_settlement');
    append(legacy,next(s,{type:'settle',id,inputTokens:input,outputTokens:output,amount,released:SPEND_POLICY.reservation-amount}));
  });
}
export function markResponseUnknown(legacy:string,id:string) {
  return locked(legacy,()=>{const s=load(legacy); if(s.pending!==id || s.stopped) throw Error('model_budget_bad_unknown'); append(legacy,next(s,{type:'unknown',id}));});
}
export function raiseAuthorizedCeiling(legacy:string) { return locked(legacy,()=>{const s=load(legacy);if(s.pending || s.stopped || s.ceiling!==SPEND_POLICY.initialCeiling) throw Error('model_budget_cannot_raise');append(legacy,next(s,{type:'raise_ceiling',previousCeiling:s.ceiling,ceiling:SPEND_POLICY.ceiling,authorization:'owner_approved_2026_10_31'}));}); }
export function raiseUiAttemptLimit(legacy:string,requestId:string) { return locked(legacy,()=>{const s=load(legacy);if(s.pending || s.stopped || s.ceiling!==SPEND_POLICY.ceiling || s.attemptLimit!==SPEND_POLICY.initialExtraCalls || !/^[A-Za-z0-9_-]{1,100}$/.test(requestId)) throw Error('model_budget_cannot_raise_attempts');append(legacy,next(s,{type:'raise_attempt_limit',previousLimit:s.attemptLimit,limit:SPEND_POLICY.maxExtraCalls,purpose:'one_actual_ui_loop',requestId}));}); }
export function authorizeFreshEnglishUi(legacy:string,requestId:string) { return locked(legacy,()=>{const s=load(legacy);if(s.pending || s.stopped || s.ceiling!==SPEND_POLICY.ceiling || s.attemptLimit!==SPEND_POLICY.maxExtraCalls || s.attempts!==16 || !/^[A-Za-z0-9_-]{1,100}$/.test(requestId) || requestId===s.targetRequestId || s.settled+SPEND_POLICY.countReserve+SPEND_POLICY.reservation>s.ceiling) throw Error('model_budget_cannot_authorize_english');append(legacy,next(s,{type:'authorize_english_ui_loop',expectedAttempts:s.attempts,previousLimit:s.attemptLimit,limit:SPEND_POLICY.finalExtraCalls,previousRequestId:s.targetRequestId,purpose:'one_fresh_english_ui_loop',requestId}));}); }
/** One explicit, append-only extension for the two approved synthetic recovery cases. */
export function authorizeRecoveryUi(legacy:string,caseIds:readonly [string,string]) {
  return locked(legacy,()=>{
    const s=load(legacy);
    if(s.pending || s.stopped || s.recoveryCaseIds!==null || s.ceiling!==SPEND_POLICY.ceiling || s.attemptLimit!==SPEND_POLICY.finalExtraCalls || s.attempts!==22 || !validRecoveryCases(caseIds) || s.settled+SPEND_POLICY.countReserve+SPEND_POLICY.recoveryNewCalls*SPEND_POLICY.reservation>s.ceiling) throw Error('model_budget_cannot_authorize_recovery');
    append(legacy,next(s,{type:'authorize_recovery_ui',expectedAttempts:s.attempts,previousLimit:s.attemptLimit,limit:SPEND_POLICY.recoveryExtraCalls,previousRequestId:s.targetRequestId,purpose:'two_synthetic_recovery_cases',caseIds:[...caseIds]}));
  });
}
export function inspectSpend(legacy:string) { return locked(legacy,()=>{const s=load(legacy);return {settled:s.settled,countReserve:SPEND_POLICY.countReserve,pending:s.pending,stopped:s.stopped,attempts:s.attempts,events:s.events.length,ceiling:s.ceiling,attemptLimit:s.attemptLimit,targetRequestId:s.targetRequestId,recoveryCaseIds:s.recoveryCaseIds};}); }
