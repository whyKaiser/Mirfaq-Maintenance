import { describe, expect, it } from 'vitest';
import { reconcileLeakIssue } from '../src/lib/leak-reconciliation';
import type { Issue } from '../src/lib/agent-intake';

// Development cases: known to the implementer; not an unseen/model evaluation.
const cases: Array<{id:string; text:string; raw:Issue; asset:string|null; expected:Issue; reason:string}> = [
  {id:'reported_live_failure', text:'المكيف في الصالة يقطر ماء.', raw:'water_leak', asset:null, expected:'hvac_leak', reason:'hvac_source_explicit'},
  {id:'ac_unit_leak', text:'وحدة التكييف في المكتب تسرب مياه.', raw:'water_leak', asset:null, expected:'hvac_leak', reason:'hvac_source_explicit'},
  {id:'condensate_drain', text:'تسريب من صرف المكيف في الدور الأول.', raw:'water_leak', asset:null, expected:'hvac_leak', reason:'hvac_source_explicit'},
  {id:'ac_hose', text:'خرطوم المكيف يقطر ماء.', raw:'water_leak', asset:null, expected:'hvac_leak', reason:'hvac_source_explicit'},
  {id:'pipe_source_near_ac', text:'تسرب ماء من الأنبوب بجانب المكيف.', raw:'hvac_leak', asset:null, expected:'water_leak', reason:'plumbing_source_explicit'},
  {id:'pipe_source_ac_asset', text:'تسرب ماء من الأنبوب بجانب المكيف.', raw:'water_leak', asset:'hvac', expected:'unknown', reason:'asset_source_conflict'},
  {id:'ac_near_leaking_pipe', text:'المكيف قريب من ماسورة تسرب مياه.', raw:'hvac_leak', asset:null, expected:'water_leak', reason:'plumbing_source_explicit'},
  {id:'conflicting_sources', text:'المكيف يقطر ماء، والماسورة تسرب مياه.', raw:'hvac_leak', asset:null, expected:'unknown', reason:'conflicting_sources'},
  {id:'negated_ac', text:'المكيف لا يقطر ماء الآن.', raw:'hvac_leak', asset:'hvac', expected:'unknown', reason:'negated_or_unclear_leak'},
  {id:'negated_pipe', text:'لا يوجد تسريب من الأنبوب.', raw:'water_leak', asset:'plumbing', expected:'unknown', reason:'negated_or_unclear_leak'},
  {id:'generic_trusted_ac', text:'يوجد تسريب ماء في الوحدة.', raw:'water_leak', asset:'hvac', expected:'hvac_leak', reason:'trusted_asset_with_leak'},
  {id:'generic_trusted_plumbing', text:'يوجد تسريب ماء في الوحدة.', raw:'hvac_leak', asset:'plumbing', expected:'water_leak', reason:'trusted_asset_with_leak'},
  {id:'generic_unlinked', text:'يوجد تسريب ماء في الوحدة.', raw:'water_leak', asset:null, expected:'unknown', reason:'negated_or_unclear_leak'},
  {id:'nearby_unclear', text:'يوجد تسريب قرب المكيف وأنبوب المياه.', raw:'water_leak', asset:null, expected:'unknown', reason:'conflicting_sources'},
  {id:'electric_plus_leak', text:'المكيف يقطر ماء وهناك شرر كهرباء.', raw:'electrical_fault', asset:'hvac', expected:'unknown', reason:'conflicting_sources'},
  {id:'non_leak', text:'المكيف لا يبرد.', raw:'hvac_no_cooling', asset:'hvac', expected:'hvac_no_cooling', reason:'model_unchanged'},
];

describe('leak-source reconciliation using model and trusted asset evidence', () => {
  it.each(cases)('$id', ({text,raw,asset,expected,reason}) => {
    const out = reconcileLeakIssue(text, raw, asset);
    expect(out).toMatchObject({ rawIssue:raw, finalIssue:expected, reason });
    if (expected === 'unknown') expect(out.clarificationRequired).toBe(true);
    if (out.finalIssue !== raw) expect(out.evidence.length).toBeGreaterThan(0);
  });
  it('compares corrections to the raw model baseline on the same development fixtures', () => {
    const results = cases.map(c => ({ ...c, actual:reconcileLeakIssue(c.text,c.raw,c.asset).finalIssue }));
    console.log('LEAK_DEVELOPMENT_COMPARISON', JSON.stringify({n:results.length,rawCorrect:results.filter(c=>c.raw===c.expected).length,reconciledCorrect:results.filter(c=>c.actual===c.expected).length,changed:results.filter(c=>c.raw!==c.actual).length,errors:results.filter(c=>c.actual!==c.expected).map(c=>c.id)}));
    expect(results).toHaveLength(16);
  });
  it('handles drip synonyms and their negation without routing the negated report', () => {
    expect(reconcileLeakIssue('المياه تنقط من المكيف في الغرفة','water_leak').finalIssue).toBe('hvac_leak');
    expect(reconcileLeakIssue('المكيف لا ينقط ماء','hvac_leak','hvac')).toMatchObject({finalIssue:'unknown',clarificationRequired:true});
  });
  it('does not attribute a pipe leak to an AC merely because title and description are adjacent', () => {
    const result=reconcileLeakIssue('تسريب قرب المكيف - تعارض اصطناعي\nتسرب ماء من الأنبوب بجانب المكيف.', 'water_leak','hvac');
    expect(result).toMatchObject({finalIssue:'unknown',reason:'asset_source_conflict',clarificationRequired:true});
    expect(result.evidence).toContain('explicit_plumbing_source');
    expect(result.evidence).not.toContain('explicit_hvac_source');
    expect(reconcileLeakIssue('المكيف قربه تسرب ماء من الأنبوب','water_leak','hvac').evidence).not.toContain('explicit_hvac_source');
  });
});
