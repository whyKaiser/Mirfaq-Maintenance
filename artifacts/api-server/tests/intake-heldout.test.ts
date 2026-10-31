import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/intake-heldout.json';
import { rulesInterpret } from '../src/lib/agent-intake';

// Fixed after implementation and before this run; exposed to the author, not blind.
// Do not tune rules on these cases and then call them unseen.
describe('fixed separate synthetic intake cases', () => {
  it('reports successes and failures instead of tuning on them', () => {
    // Intentionally simpler keyword baseline, evaluated on exactly the same cases.
    function baseline(text: string) {
      const issue = /مكيف|تكييف/.test(text) ? 'hvac_no_cooling' : /ماء|مياه|تسريب/.test(text) ? 'water_leak' : /شرر|كهرب/.test(text) ? 'electrical_fault' : 'unknown';
      return { issue, hazard: /شرر|دخان/.test(text) };
    }
    const cases = fixtures.map(f => ({ ...f, actual: rulesInterpret(f.text), baseline: baseline(f.text) }));
    const issueCorrect = cases.filter(c => c.actual.issue === c.issue).length;
    const hazardCorrect = cases.filter(c => c.actual.hazard === c.hazard).length;
    const hazardFalseNegative = cases.filter(c => c.hazard && !c.actual.hazard).length;
    const hazardFalsePositive = cases.filter(c => !c.hazard && c.actual.hazard).length;
    console.log('FIXED_SYNTHETIC_INTAKE', JSON.stringify({ count: cases.length, issueCorrect, hazardCorrect, hazardFalseNegative, hazardFalsePositive, baselineIssueCorrect: cases.filter(c => c.baseline.issue === c.issue).length, baselineHazardCorrect: cases.filter(c => c.baseline.hazard === c.hazard).length, baselineHazardFalseNegative: cases.filter(c => c.hazard && !c.baseline.hazard).length, errors: cases.filter(c => c.actual.issue !== c.issue || c.actual.hazard !== c.hazard).map(c => ({ id: c.id, expectedIssue: c.issue, actualIssue: c.actual.issue, expectedHazard: c.hazard, actualHazard: c.actual.hazard })) }));
    expect(cases).toHaveLength(8);
  });
});
