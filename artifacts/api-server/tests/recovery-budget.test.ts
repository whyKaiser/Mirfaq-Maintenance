import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SPEND_POLICY,authorizeFreshEnglishUi,authorizeRecoveryUi,inspectSpend,markResponseUnknown,raiseAuthorizedCeiling,raiseUiAttemptLimit,reconcileLegacy,reserveResponse,settleResponse} from '../src/lib/model-spend-journal';
import {openAIResponsesProvider} from '../src/lib/model-provider';

describe('two-case recovery budget authorization; temporary journals and fake transport only',()=>{
  let dir:string,path:string,legacy:string;
  const ids=['recovery-safe','recovery-review'] as const;
  beforeEach(()=>{
    vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-10-31T15:00:00Z'));
    dir=mkdtempSync(join(tmpdir(),'mirfaq-recovery-budget-'));path=join(dir,'legacy.json');
    const ins=[175,284,345,454,580,1025,1527,201,199,198,296],outs=[26,14,14,15,14,14,127,39,21,20,78],counts=[97,206,267,376,502,947,1449,123,121,120];
    legacy=JSON.stringify({version:1,model:SPEND_POLICY.model,blocked:true,entries:ins.map((inputTokens,i)=>({status:'success',inputTokens,outputTokens:outs[i],reservedMicroUsd:i===10?526080:20000,...(i<10?{countTokens:counts[i]}:{})}))});
    writeFileSync(path,legacy);reconcileLegacy(path,createHash('sha256').update(legacy).digest('hex'));
  });
  afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
  function prior33(heavy=0){
    raiseAuthorizedCeiling(path);raiseUiAttemptLimit(path,'old-ui');
    for(let i=0;i<16;i++){
      const key=reserveResponse(path,i>=12?'delegated-ui':undefined,i>=12?'old-ui':undefined);
      settleResponse(path,key,i<heavy?SPEND_POLICY.maxInput:1,i<heavy?SPEND_POLICY.maxOutput:1);
    }
    authorizeFreshEnglishUi(path,'english-ui');
    for(let i=16;i<22;i++){const key=reserveResponse(path,'delegated-ui','english-ui');settleResponse(path,key,1,1);}
  }
  it('preserves all prior bytes, limits the two exact cases to eight new reservations, and settles once',()=>{
    prior33();const prefix=readFileSync(`${path}.journal.jsonl`,'utf8');const before=inspectSpend(path);
    authorizeRecoveryUi(path,ids);
    expect(readFileSync(`${path}.journal.jsonl`,'utf8').startsWith(prefix)).toBe(true);
    expect(inspectSpend(path)).toMatchObject({attempts:22,attemptLimit:30,ceiling:5_000_000_000,pending:null,recoveryCaseIds:[...ids],settled:before.settled,countReserve:200_000_000});
    expect(()=>authorizeRecoveryUi(path,ids)).toThrow();
    for(let i=0;i<8;i++){
      const key=reserveResponse(path,'recovery-ui',ids[i<5?0:1]);
      expect(()=>reserveResponse(path,'recovery-ui',ids[1])).toThrow();
      settleResponse(path,key,100,20);expect(()=>settleResponse(path,key,100,20)).toThrow();
    }
    expect(inspectSpend(path)).toMatchObject({attempts:30,attemptLimit:30,pending:null});
    expect(()=>reserveResponse(path,'recovery-ui',ids[0])).toThrow();
    expect(readFileSync(path,'utf8')).toBe(legacy);
  });
  it('rejects a third case, absent scope and old scope, and never enables recovery before explicit authorization',()=>{
    prior33();expect(()=>reserveResponse(path,'recovery-ui',ids[0])).toThrow();
    authorizeRecoveryUi(path,ids);
    for(const [scope,id] of [[undefined,undefined],['delegated-ui','english-ui'],['delegated-ui',ids[0]],['recovery-ui','foreign'],['recovery-ui',undefined]] as const) expect(()=>reserveResponse(path,scope,id)).toThrow();
    expect(inspectSpend(path).attempts).toBe(22);
  });
  it('requires the precise current count and prior limit, two distinct valid IDs, and no pending reservation',()=>{
    expect(()=>authorizeRecoveryUi(path,ids)).toThrow();prior33();
    expect(()=>authorizeRecoveryUi(path,['same','same'])).toThrow();
    expect(()=>authorizeRecoveryUi(path,['bad id','valid'])).toThrow();
    const key=reserveResponse(path,'delegated-ui','english-ui');expect(()=>authorizeRecoveryUi(path,ids)).toThrow();
    settleResponse(path,key,1,1);expect(()=>authorizeRecoveryUi(path,ids)).toThrow();
    expect(inspectSpend(path)).toMatchObject({attempts:23,attemptLimit:25,recoveryCaseIds:null});
  });
  it('retains unknown reservations and blocks both future calls and reauthorization',()=>{
    prior33();authorizeRecoveryUi(path,ids);const key=reserveResponse(path,'recovery-ui',ids[0]);
    markResponseUnknown(path,key);
    expect(inspectSpend(path)).toMatchObject({attempts:23,pending:key,stopped:true});
    expect(()=>reserveResponse(path,'recovery-ui',ids[1])).toThrow();expect(()=>authorizeRecoveryUi(path,ids)).toThrow();expect(()=>settleResponse(path,key,1,1)).toThrow();
  });
  it('requires aggregate room for all eight conservative reservations while preserving the $5 ceiling',()=>{
    prior33(2);const prefix=readFileSync(`${path}.journal.jsonl`,'utf8');
    expect(()=>authorizeRecoveryUi(path,ids)).toThrow('model_budget_cannot_authorize_recovery');
    expect(readFileSync(`${path}.journal.jsonl`,'utf8')).toBe(prefix);expect(inspectSpend(path).ceiling).toBe(5_000_000_000);
  });
  it.each(['scope','limit'])('loader rejects a rehashed but unauthorized %s event',kind=>{
    prior33();authorizeRecoveryUi(path,ids);
    if(kind==='scope') reserveResponse(path,'recovery-ui',ids[0]);
    const lines=readFileSync(`${path}.journal.jsonl`,'utf8').trimEnd().split('\n');
    const {hash:_old,...event}=JSON.parse(lines.at(-1)!);
    if(kind==='scope')event.scope='delegated-ui';else event.limit=31;
    lines[lines.length-1]=JSON.stringify({...event,hash:createHash('sha256').update(JSON.stringify(event)).digest('hex')});
    writeFileSync(`${path}.journal.jsonl`,lines.join('\n')+'\n');
    expect(()=>inspectSpend(path)).toThrow();
  });
  it('routes one recovery UI request through the same reservation/settlement guard without token counting',async()=>{
    prior33();authorizeRecoveryUi(path,ids);vi.stubEnv('MIRFAQ_AGENT_SPENDING_ENABLED','1');
    const send=vi.fn(async(target:string|URL|Request,init?:RequestInit)=>{
      expect(String(target)).toBe('https://api.openai.com/v1/responses');expect(inspectSpend(path).pending).toBeTruthy();
      expect(JSON.parse(String(init?.body))).toMatchObject({model:SPEND_POLICY.model,max_output_tokens:600,service_tier:'default',parallel_tool_calls:false});
      return new Response(JSON.stringify({status:'completed',model:SPEND_POLICY.model,service_tier:'default',output:[],usage:{input_tokens:100,output_tokens:20}}));
    });
    await openAIResponsesProvider({key:'synthetic-only',model:SPEND_POLICY.model,budgetPath:path,budgetScope:'recovery-ui',budgetCaseId:ids[0]},send as typeof fetch).next({input:[],tools:[]});
    expect(send).toHaveBeenCalledTimes(1);expect(inspectSpend(path)).toMatchObject({attempts:23,pending:null,stopped:false});
    await expect(openAIResponsesProvider({key:'synthetic-only',model:SPEND_POLICY.model,budgetPath:path,budgetScope:'delegated-ui',budgetCaseId:'english-ui'},send as typeof fetch).next({input:[],tools:[]})).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
