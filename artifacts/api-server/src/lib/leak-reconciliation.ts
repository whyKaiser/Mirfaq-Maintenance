import type { Issue } from './agent-intake';

export type LeakDecision = {
  rawIssue: Issue;
  finalIssue: Issue;
  reason: 'model_unchanged' | 'hvac_source_explicit' | 'plumbing_source_explicit' | 'trusted_asset_with_leak' | 'conflicting_sources' | 'negated_or_unclear_leak' | 'asset_source_conflict';
  evidence: Array<'explicit_hvac_source' | 'explicit_plumbing_source' | 'trusted_hvac_asset' | 'trusted_plumbing_asset' | 'negation' | 'leak_mentioned'>;
  clarificationRequired: boolean;
};

/** Conservative routing signals, not a diagnosis. `assetKind` comes only from a tenant-scoped database lookup. */
export function reconcileLeakIssue(text: string, rawIssue: Issue, assetKind: string | null = null): LeakDecision {
  const source = text.normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  const leak = /تسرب|تسريب|يسرب|تسيل|يسيل|يقطر|تقطر|ينقط|تنقط|تنقيط|تقطير|رشح|يرشح|مياه تتساقط|\b(?:leak|leaks|leaking|dripping)\b/.test(source);
  const negation = /(?:^|[\s،,.!?؟])(?:لا|ما|ليس|ليست|بدون|لم|مافي|ما فيه|مو|مب|لا يوجد|غير موجود)\s+[^.!؟\n]{0,30}(?:تسرب|تسريب|تقطير|تنقيط|يقطر|تقطر|ينقط|تنقط|يسرب|تسيل|مياه|ماء)|(?:تسرب|تسريب|تقطير|يقطر|تقطر|ينقط|تنقط)[^.!؟\n]{0,24}(?:غير موجود|لا يوجد|لم يحدث)|\b(?:no|not|isn't|is not|without)\s+(?:any\s+)?(?:water |a )?(?:leak(?:ing)?|dripping)\b/.test(source);
  const hvac = '(?:المكيف|مكيف|التكييف|المكيفه|وحدة التكييف|وحدة المكيف|صرف المكيف|خرطوم المكيف|حوض التكثيف|\\b(?:air conditioner|air conditioning|a/?c|hvac)\\b)';
  const plumbing = '(?:الانبوب|الأنبوب|انبوب|أنبوب|الماسورة|ماسورة|الانابيب|الأنابيب|الحنفية|حنفية|الصنبور|صنبور|مواسير|التمديدات|خط المياه|\\b(?:tap|faucet|pipe|plumbing)\\b)';
  const event = '(?:تسرب|تسريب|يسرب|تسيل|يسيل|يقطر|تقطر|ينقط|تنقط|تنقيط|تقطير|رشح|يرشح|مياه تتساقط|\\b(?:leak|leaks|leaking|dripping)\\b)';
  // A nearby object alone is not the source: require a direct grammatical link.
  const related = (entity: string, other: string) => {
    const forward = new RegExp(`${entity}([^.!؟،,\\n]{0,30})${event}`, 'g');
    for (const match of source.matchAll(forward)) {
      const after=source.slice((match.index ?? 0)+match[0].length);
      if (!new RegExp(`${other}|قرب|بجانب|بالقرب|حول|\\b(?:near|next to|beside|around)\\b`).test(match[1]) && !new RegExp(`^\\s*(?:ماء|مياه|الماء|المياه|water)?\\s*(?:من|from)\\s*${other}`).test(after)) return true;
    }
    return new RegExp(`${event}\\s*(?:ماء|مياه|الماء|المياه|water)?\\s*(?:من|في|بسبب|بداخل|داخل|from|in)\\s*(?:the\\s+)?${entity}`).test(source);
  };
  const h = related(hvac, plumbing), p = related(plumbing, hvac);
  const evidence: LeakDecision['evidence'] = [];
  if (leak) evidence.push('leak_mentioned');
  if (h) evidence.push('explicit_hvac_source');
  if (p) evidence.push('explicit_plumbing_source');
  if (assetKind === 'hvac') evidence.push('trusted_hvac_asset');
  if (assetKind === 'plumbing') evidence.push('trusted_plumbing_asset');
  if (negation) evidence.push('negation');
  const result = (finalIssue: Issue, reason: LeakDecision['reason'], clarificationRequired = false): LeakDecision => ({ rawIssue, finalIssue, reason, evidence, clarificationRequired });
  if (!leak) return result(rawIssue, 'model_unchanged');
  if (/(?:لا|ما|لم|مو)\s+(?:يبرد|تبرد|يعمل|تعمل)|تبريد\s+(?:ضعيف|متوقف)|\b(?:not cooling|does not cool|doesn't cool|no cooling)\b/.test(source)) return result('unknown', 'conflicting_sources', true);
  if (rawIssue === 'electrical_fault' || rawIssue === 'hvac_no_cooling') return result('unknown', 'conflicting_sources', true);
  if (negation) return result('unknown', 'negated_or_unclear_leak', true);
  if (h && p) return result('unknown', 'conflicting_sources', true);
  if ((h && assetKind === 'plumbing') || (p && assetKind === 'hvac')) return result('unknown', 'asset_source_conflict', true);
  if (h) return result('hvac_leak', 'hvac_source_explicit');
  if (p) return result('water_leak', 'plumbing_source_explicit');
  // A linked asset can disambiguate a generic leak, but a second mentioned device or pipe cannot.
  const mentionsHvac = new RegExp(hvac).test(source), mentionsPipe = new RegExp(plumbing).test(source);
  if (mentionsHvac && mentionsPipe) return result('unknown', 'conflicting_sources', true);
  if ((assetKind === 'hvac' && mentionsPipe) || (assetKind === 'plumbing' && mentionsHvac)) return result('unknown', 'asset_source_conflict', true);
  if (assetKind === 'hvac') return result('hvac_leak', 'trusted_asset_with_leak');
  if (assetKind === 'plumbing') return result('water_leak', 'trusted_asset_with_leak');
  // Generic leak plus a model guess or merely nearby equipment does not establish the source.
  return result('unknown', 'negated_or_unclear_leak', true);
}
