import {describe,it,expect,vi} from 'vitest';
import {runModelRecovery,type RecoveryTools} from '../src/lib/model-recovery';
import type {ModelProvider} from '../src/lib/model-provider';

const plan={action:'reassign',technicianId:'backup-b',reason:'recorded_absence'};
function provider(steps:Array<[string,unknown?]>) {
  let i=0;
  const next=vi.fn(async()=>{const [name,args]=steps[i++]??['finish_recovery',{}];return {output:[{type:'function_call',name,call_id:`c${i}`,arguments:JSON.stringify(args??{})}],usage:{input_tokens:1,output_tokens:1}};});
  return {provider:{kind:'mock',model:'controlled-script',next} satisfies ModelProvider,next};
}
function tools():RecoveryTools {
  return {read:vi.fn(async()=>({state:'ready',reason:'recorded_absence',candidates:[{id:'backup-a',specialty:'HVAC',workload:0},{id:'backup-b',specialty:'HVAC',workload:1}]})),validate:vi.fn(async()=>({state:'ready'})),execute:vi.fn(async()=>({state:'reassigned'})),readResult:vi.fn(async()=>({state:'verified'})),observe:vi.fn(async()=>{})};
}
describe('model recovery loop contract (controlled provider, not live AI)',()=>{
  it('forwards the model-selected alternative to validation and requires persisted readback',async()=>{
    const t=tools(),p=provider([['read_recovery_context'],['propose_recovery_plan',plan],['execute_recovery'],['read_recovery_result'],['finish_recovery']]);
    expect(await runModelRecovery(p.provider,t)).toMatchObject({state:'reassigned',mode:'mock'});
    expect(t.validate).toHaveBeenCalledWith(plan);expect(t.execute).toHaveBeenCalledTimes(1);expect(t.readResult).toHaveBeenCalledTimes(1);
  });
  it('can refresh and revise one rejected proposal before a single write',async()=>{
    const t=tools();vi.mocked(t.validate).mockResolvedValueOnce({state:'rejected',reason:'candidate_not_eligible'}).mockResolvedValueOnce({state:'ready'});
    const p=provider([['read_recovery_context'],['propose_recovery_plan',{...plan,technicianId:'backup-a'}],['read_recovery_context'],['propose_recovery_plan',plan],['execute_recovery'],['read_recovery_result'],['finish_recovery']]);
    expect((await runModelRecovery(p.provider,t)).state).toBe('reassigned');expect(p.next).toHaveBeenCalledTimes(7);expect(t.execute).toHaveBeenCalledTimes(1);
  });
  it('supports a validated manager review without a business write',async()=>{
    const t=tools();vi.mocked(t.validate).mockResolvedValue({state:'manager_review'});
    const p=provider([['read_recovery_context'],['propose_recovery_plan',{action:'manager_review',technicianId:null,reason:'requires_manager'}],['finish_recovery']]);
    expect((await runModelRecovery(p.provider,t)).state).toBe('manager_review');expect(t.execute).not.toHaveBeenCalled();
  });
  it.each(['unknown','inconsistent'])('stops before another model request after %s execution',async(state)=>{
    const t=tools();vi.mocked(t.execute).mockResolvedValue({state});
    const p=provider([['read_recovery_context'],['propose_recovery_plan',plan],['execute_recovery'],['read_recovery_result']]);
    await expect(runModelRecovery(p.provider,t)).rejects.toThrow('recovery_outcome_unknown');expect(p.next).toHaveBeenCalledTimes(3);expect(t.execute).toHaveBeenCalledTimes(1);
  });
  it('does not silently retry a definitively refused execution',async()=>{
    const t=tools();vi.mocked(t.execute).mockResolvedValue({state:'review'});
    const p=provider([['read_recovery_context'],['propose_recovery_plan',plan],['execute_recovery']]);
    await expect(runModelRecovery(p.provider,t)).rejects.toThrow('execution_refused');expect(p.next).toHaveBeenCalledTimes(3);
  });
  it.each([
    [['execute_recovery']],
    [['read_recovery_context'],['execute_recovery']],
    [['read_recovery_context'],['propose_recovery_plan',plan],['execute_recovery'],['finish_recovery']],
    [['read_recovery_context'],['propose_recovery_plan',{...plan,tenantId:'foreign'}]],
    [['read_recovery_context'],['propose_recovery_plan',plan],['execute_recovery'],['execute_recovery']],
  ] as Array<Array<[string,unknown?]>>)('rejects missing evidence, override fields or second execution: %j',async(...steps)=>{
    const t=tools(),p=provider(steps as Array<[string,unknown?]>);
    await expect(runModelRecovery(p.provider,t)).rejects.toThrow();expect(vi.mocked(t.execute).mock.calls.length).toBeLessThanOrEqual(1);
  });
});
