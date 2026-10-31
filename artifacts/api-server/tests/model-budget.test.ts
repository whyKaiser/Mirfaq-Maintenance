import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SPEND_POLICY, inspectSpend, markResponseUnknown, raiseAuthorizedCeiling, raiseUiAttemptLimit, authorizeFreshEnglishUi, reconcileLegacy, reserveResponse, settleResponse } from '../src/lib/model-spend-journal';
import { openAIResponsesProvider } from '../src/lib/model-provider';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

describe('append-only budget guard; synthetic transport only',()=>{
  let dir:string,path:string,original:string;
  const ins=[175,284,345,454,580,1025,1527,201,199,198,296], outs=[26,14,14,15,14,14,127,39,21,20,78], counts=[97,206,267,376,502,947,1449,123,121,120];
  beforeEach(()=>{
    vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-30T12:00:00Z'));
    dir=mkdtempSync(join(tmpdir(),'mirfaq-journal-')); path=join(dir,'legacy.json');
    original=JSON.stringify({version:1,model:SPEND_POLICY.model,blocked:true,entries:ins.map((inputTokens,i)=>({status:'success',inputTokens,outputTokens:outs[i],reservedMicroUsd:i===10?526080:20000,...(i<10?{countTokens:counts[i]}:{})}))});
    writeFileSync(path,original); reconcileLegacy(path,createHash('sha256').update(original).digest('hex'));process.env.MIRFAQ_AGENT_SPENDING_ENABLED='1';
  });
  afterEach(()=>{vi.restoreAllMocks();delete process.env.MIRFAQ_AGENT_SPENDING_ENABLED;rmSync(dir,{recursive:true,force:true});});
  it('keeps legacy intact and appends one settlement with verified released amount',()=>{
    const s=inspectSpend(path);expect(s).toMatchObject({settled:3_329_600,countReserve:200_000_000,attempts:0,pending:null});
    const event=JSON.parse(readFileSync(`${path}.journal.jsonl`,'utf8').trim());expect(event).toMatchObject({previousReservation:726_080_000,released:522_750_400});
    expect(readFileSync(path,'utf8')).toBe(original);expect(()=>reconcileLegacy(path,'wrong')).toThrow();
  });
  it('reserves before sending, serializes calls, settles once, and caps twelve attempts',()=>{
    for(let i=0;i<12;i++){const id=reserveResponse(path);expect(()=>reserveResponse(path)).toThrow();settleResponse(path,id,100,20);expect(()=>settleResponse(path,id,100,20)).toThrow();}
    expect(inspectSpend(path)).toMatchObject({attempts:12,settled:4_361_600,pending:null});expect(()=>reserveResponse(path)).toThrow();
    const events=readFileSync(`${path}.journal.jsonl`,'utf8').trim().split('\n').map(x=>JSON.parse(x));expect(events.filter(e=>e.type==='reserve')).toHaveLength(12);expect(events.filter(e=>e.type==='settle')).toHaveLength(12);
  });
  it('allows exactly one of two competing processes to reserve',async()=>{
    const run=()=>promisify(execFile)(process.execPath,['--import','tsx','evaluation/journal-race-child.ts',path],{cwd:process.cwd()});
    const results=await Promise.all([run(),run()]);
    expect(results.map(r=>r.stdout).sort()).toEqual(['blocked','reserved']);
    expect(inspectSpend(path)).toMatchObject({attempts:1,events:2});
  });
  it('retains the full unresolved reservation on timeout and blocks next calls',()=>{
    const id=reserveResponse(path);markResponseUnknown(path,id);expect(inspectSpend(path)).toMatchObject({pending:id,stopped:true});expect(()=>reserveResponse(path)).toThrow();expect(()=>settleResponse(path,id,1,1)).toThrow();
  });
  it('appends the authorized ceiling change without resetting history and enforces the new cumulative cap',()=>{
    const before=readFileSync(`${path}.journal.jsonl`,'utf8');
    const pending=reserveResponse(path);expect(()=>raiseAuthorizedCeiling(path)).toThrow();settleResponse(path,pending,1,1);
    raiseAuthorizedCeiling(path);expect(readFileSync(`${path}.journal.jsonl`,'utf8').startsWith(before)).toBe(true);
    expect(inspectSpend(path)).toMatchObject({ceiling:5_000_000_000,attempts:1});expect(()=>raiseAuthorizedCeiling(path)).toThrow();
    for(let i=0;i<9;i++){const id=reserveResponse(path);settleResponse(path,id,1_050_000,600);}
    expect(()=>reserveResponse(path)).toThrow('model_budget_exhausted_or_unknown');
    expect(readFileSync(path,'utf8')).toBe(original);
  });
  it('allows the UI-only attempt allowance once after the $5 approval, without altering past events',()=>{
    expect(()=>raiseUiAttemptLimit(path,'case-ui')).toThrow();raiseAuthorizedCeiling(path);
    const prefix=readFileSync(`${path}.journal.jsonl`,'utf8');
    const pending=reserveResponse(path);expect(()=>raiseUiAttemptLimit(path,'case-ui')).toThrow();settleResponse(path,pending,1,1);
    raiseUiAttemptLimit(path,'case-ui');const state=inspectSpend(path);expect(state).toMatchObject({ceiling:5_000_000_000,attemptLimit:19,attempts:1,targetRequestId:'case-ui'});
    expect(readFileSync(`${path}.journal.jsonl`,'utf8').startsWith(prefix)).toBe(true);expect(()=>raiseUiAttemptLimit(path,'case-ui')).toThrow();
    for(let i=1;i<12;i++){const id=reserveResponse(path);settleResponse(path,id,1,1);}
    expect(()=>reserveResponse(path)).toThrow();
    expect(()=>reserveResponse(path,'delegated-ui','other-case')).toThrow();
    for(let i=12;i<19;i++){const id=reserveResponse(path,'delegated-ui','case-ui');settleResponse(path,id,1,1);}expect(()=>reserveResponse(path,'delegated-ui','case-ui')).toThrow();
  });
  it('fails closed on a pending reservation, lock, corrupted journal or changed legacy',()=>{
    const id=reserveResponse(path);expect(()=>reserveResponse(path)).toThrow();settleResponse(path,id,1,1);
    writeFileSync(`${path}.lock`,'locked');expect(()=>reserveResponse(path)).toThrow();rmSync(`${path}.lock`);
    writeFileSync(`${path}.journal.jsonl`,'partial');expect(()=>reserveResponse(path)).toThrow();
    writeFileSync(path,original+' ');expect(()=>reconcileLegacy(path,'wrong')).toThrow();
  });
  it('allows one bounded new English UI case without altering history or accepting other cases',()=>{
    raiseAuthorizedCeiling(path);raiseUiAttemptLimit(path,'old-case');
    for(let i=0;i<16;i++){const id=reserveResponse(path,i>=12?'delegated-ui':undefined,i>=12?'old-case':undefined);settleResponse(path,id,1,1);}
    const prefix=readFileSync(`${path}.journal.jsonl`,'utf8');
    expect(()=>authorizeFreshEnglishUi(path,'old-case')).toThrow();
    authorizeFreshEnglishUi(path,'english-case');
    expect(readFileSync(`${path}.journal.jsonl`,'utf8').startsWith(prefix)).toBe(true);
    expect(inspectSpend(path)).toMatchObject({attempts:16,attemptLimit:25,targetRequestId:'english-case',pending:null});
    expect(()=>authorizeFreshEnglishUi(path,'another-case')).toThrow();
    expect(()=>reserveResponse(path,'delegated-ui','old-case')).toThrow();
    for(let i=16;i<25;i++){const id=reserveResponse(path,'delegated-ui','english-case');settleResponse(path,id,1,1);}
    expect(()=>reserveResponse(path,'delegated-ui','english-case')).toThrow();
  });
  it('makes one Responses call with the same guard and never calls token counting',async()=>{
    let calls=0;
    const send=(async(target:string|URL|Request,init?:RequestInit)=>{calls++;expect(String(target)).toBe('https://api.openai.com/v1/responses');const body=JSON.parse(String(init?.body));expect(body).toMatchObject({model:SPEND_POLICY.model,service_tier:'default',max_output_tokens:600,parallel_tool_calls:false});expect(body.prompt_cache_options).toBeUndefined();expect(body.previous_response_id).toBeUndefined();expect(inspectSpend(path).pending).toBeTruthy();return new Response(JSON.stringify({status:'completed',model:SPEND_POLICY.model,service_tier:'default',output:[],usage:{input_tokens:100,output_tokens:20}}),{status:200});}) as typeof fetch;
    const p=openAIResponsesProvider({key:'synthetic-only',model:SPEND_POLICY.model,budgetPath:path},send);await p.next({input:[],tools:[]});expect(calls).toBe(1);expect(inspectSpend(path)).toMatchObject({attempts:1,settled:3_415_600,pending:null});
  });
  it('rejects unsafe payloads, missing opt-in, wrong model, oversize and expired prices before reserving',async()=>{
    let calls=0;const send=(async()=>{calls++;throw Error('unexpected')}) as typeof fetch;const provider=openAIResponsesProvider({key:'synthetic',model:SPEND_POLICY.model,budgetPath:path},send);
    await expect(provider.next({input:[],tools:[{type:'web_search'}]})).rejects.toThrow();
    await expect(provider.next({input:[{type:'input_image'}],tools:[]})).rejects.toThrow();
    await expect(provider.next({input:[{role:'user',content:'x',cache_control:{ttl:'12h'}}],tools:[]})).rejects.toThrow();
    await expect(provider.next({input:[{role:'user',content:'x'.repeat(16000)}],tools:[]})).rejects.toThrow();
    delete process.env.MIRFAQ_AGENT_SPENDING_ENABLED;await expect(provider.next({input:[],tools:[]})).rejects.toThrow();process.env.MIRFAQ_AGENT_SPENDING_ENABLED='1';
    await expect(openAIResponsesProvider({key:'x',model:'wrong',budgetPath:path},send).next({input:[],tools:[]})).rejects.toThrow();
    vi.spyOn(Date,'now').mockReturnValue(Date.parse(SPEND_POLICY.pricingValidUntil));await expect(provider.next({input:[],tools:[]})).rejects.toThrow();expect(calls).toBe(0);expect(inspectSpend(path).attempts).toBe(0);
  });
  it.each(['missing_usage','wrong_model','incomplete','twelve_hour_cache','timeout'])('blocks after uncertain %s',async(kind)=>{
    let calls=0;const send=(async()=>{calls++;if(kind==='timeout')throw Error('private secret');const x:any={status:'completed',model:SPEND_POLICY.model,service_tier:'default',output:[],usage:{input_tokens:100,output_tokens:20}};if(kind==='missing_usage')delete x.usage;if(kind==='wrong_model')x.model='other';if(kind==='incomplete')x.status='incomplete';if(kind==='twelve_hour_cache')x.usage.input_tokens_details={cache_write_tokens_details:{ttl_12h_tokens:1}};return new Response(JSON.stringify(x));}) as typeof fetch;
    const p=openAIResponsesProvider({key:'synthetic-private-key',model:SPEND_POLICY.model,budgetPath:path},send);await expect(p.next({input:[],tools:[]})).rejects.toThrow();await expect(p.next({input:[],tools:[]})).rejects.toThrow();expect(calls).toBe(1);expect(inspectSpend(path)).toMatchObject({stopped:true,attempts:1});expect(readFileSync(`${path}.journal.jsonl`,'utf8')).not.toContain('synthetic-private-key');
  });
});
