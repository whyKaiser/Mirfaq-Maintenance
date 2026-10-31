import { describe, expect, it, vi } from 'vitest';
import { modelAdvice } from '../src/lib/model-advice';
import type { ModelProvider } from '../src/lib/model-provider';
const data = {title:'Synthetic AC leak',description:'Water drips from the AC drain.'};
function provider(names:string[]) {
 let calls=0;
 const next=vi.fn(async()=>({output:[{type:'function_call',name:names[calls++],call_id:`c${calls}`,arguments:names[calls-1]==='finish'?JSON.stringify({summary:'Synthetic result',questions:[]}):'{}'}]}));
 return {next,model:'synthetic-only',kind:'mock' as const} satisfies ModelProvider;
}
function workflow(createState='verified', readState='verified') {
 return {inspect:vi.fn(async()=>({state:'ready'})),create:vi.fn(async()=>({state:createState})),read:vi.fn(async()=>({state:readState}))};
}
describe('review regressions: model tool execution boundaries (mock only)',()=>{
 it.each(['create_order','finish'])('stops on unknown write before proposed %s or another model request',async(nextTool)=>{
  const p=provider(['read_case','read_policy','inspect_order_plan','create_order',nextTool]);
  const w=workflow('unknown'), observed:unknown[]=[];
  await expect(modelAdvice(data,p,w,{onToolOutput:(name,result)=>{if(name==='create_order')observed.push(result);}})).rejects.toThrow('workflow_outcome_unknown');
  expect(p.next).toHaveBeenCalledTimes(4); expect(w.create).toHaveBeenCalledTimes(1); expect(observed).toEqual([{state:'unknown'}]);
 });
 it.each(['unknown','inconsistent'])('stops on %s readback rather than continuing to a success summary',async(state)=>{
  const p=provider(['read_case','read_policy','inspect_order_plan','create_order','read_order','finish']);
  await expect(modelAdvice(data,p,workflow('verified',state))).rejects.toThrow('workflow_outcome_unknown');
  expect(p.next).toHaveBeenCalledTimes(5);
 });
 it('permits only one write attempt even if model requests another',async()=>{
  const p=provider(['read_case','read_policy','inspect_order_plan','create_order','create_order','read_order','finish']);
  const w=workflow(), observed:unknown[]=[];
  const result=await modelAdvice(data,p,w,{onToolOutput:(name,result)=>{if(name==='create_order')observed.push(result);}});
  expect(w.create).toHaveBeenCalledTimes(1);expect(w.read).toHaveBeenCalledTimes(1);
  expect(result.execution?.state).toBe('verified');expect(observed[1]).toEqual({state:'denied',reason:'write_already_attempted'});
 });
 it('requires case and policy evidence before inspecting or executing a plan',async()=>{
  for(const sequence of [['inspect_order_plan'],['read_case','inspect_order_plan'],['read_policy','create_order']]){
   const w=workflow(); await expect(modelAdvice(data,provider(sequence),w)).rejects.toThrow('missing_tool_evidence');
   expect(w.inspect).not.toHaveBeenCalled();expect(w.create).not.toHaveBeenCalled();
  }
 });
});
