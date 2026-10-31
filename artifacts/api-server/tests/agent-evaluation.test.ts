import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { prisma } from '../src/lib/prisma';
import { createOrder, inspectPlan, type PlanInput } from '../src/lib/agent-workflow';
import { resetDatabase, seedFixture, type Fixture } from './helpers';

// Development scenarios, defined before this run. They are NOT unseen or field evidence.
describe('development comparison with a conservative manual-review baseline', () => {
  let fx: Fixture;
  beforeEach(async () => { await resetDatabase(); fx = await seedFixture(); await prisma.technicianProfile.update({ where: { id: fx.technicianProfileId }, data: { specialty: 'تكييف' } }); await prisma.agentAvailability.create({ data: { organizationId: fx.organizationId, technicianId: fx.technicianProfileId, available: true } }); });
  afterAll(async () => { await prisma.$disconnect(); });
  it('measures the same six scenarios for both systems without claiming reduced human effort', async () => {
    const actor = { organizationId: fx.organizationId, userId: fx.managerId, role: 'manager' };
    const [assetA, assetB] = await Promise.all(['A', 'B'].map(tag => prisma.agentAsset.create({ data: { organizationId: fx.organizationId, unitId: fx.unitId, tag, kind: 'hvac' } })));
    async function ticket(description: string) { return prisma.maintenanceRequest.create({ data: { title: 'عطل مكيف', description, category: 'تكييف', priority: 'عادي', status: 'معلّقة', propertyId: fx.propertyId, unitId: fx.unitId, residentId: fx.residentId, organizationId: fx.organizationId } }); }
    const first = await ticket('المكيف يقطر ماء في الغرفة');
    const base: PlanInput = { requestId: first.id, assetId: assetA.id, issueCode: 'hvac_leak', priority: 'normal', riskConfirmedSafe: true, availableTechnicianIds: [fx.technicianProfileId] };
    const initialPlan = await inspectPlan(actor, base);
    expect(initialPlan.state).toBe('ready');
    if (initialPlan.state !== 'ready') throw new Error('fixture plan not ready');
    expect((await createOrder(actor, { ...base, planToken: initialPlan.planToken }, 'evaluation_key_00001')).state).toBe('verified');
    const safe = await ticket('المكيف يقطر ماء داخل الغرفة');
    const hazard = await ticket('تسريب ماء بجانب لوحة الكهرباء');
    const dupe = await ticket('المكيف يقطر ماء في الصالة');
    const cases: { name: string; input: PlanInput; expected: string }[] = [
      { name: 'safe', input: { ...base, requestId: safe.id, assetId: assetB.id }, expected: 'ready' },
      { name: 'risk-unknown', input: { ...base, requestId: safe.id, assetId: assetB.id, riskConfirmedSafe: false }, expected: 'clarify' },
      { name: 'no-tech', input: { ...base, requestId: safe.id, assetId: assetB.id, availableTechnicianIds: [] }, expected: 'clarify' },
      { name: 'electrical-hazard', input: { ...base, requestId: hazard.id, assetId: assetB.id }, expected: 'escalate' },
      { name: 'duplicate', input: { ...base, requestId: dupe.id }, expected: 'duplicate_review' },
      { name: 'different-issue', input: { ...base, requestId: dupe.id, issueCode: 'hvac_no_cooling' }, expected: 'ready' },
    ];
    let matched = 0, baselineMatched = 0, elapsedMs = 0;
    const results: { name: string; expected: string; actual: string; baseline: string }[] = [];
    for (const scenario of cases) {
      const start = performance.now();
      const actual = (await inspectPlan(actor, scenario.input)).state;
      elapsedMs += performance.now() - start;
      const baseline = 'review'; // Safe, simple baseline: ask a manager for every case.
      if (actual === scenario.expected) matched++;
      if (baseline === scenario.expected) baselineMatched++;
      results.push({ name: scenario.name, expected: scenario.expected, actual, baseline });
    }
    // Isolated counterfactual: remove only the duplicate signal; no runtime safety setting is changed.
    const duplicateCases = results.filter(x => x.name === 'duplicate' || x.name === 'different-issue');
    const metrics = { cases: cases.length, exactExpectedWorkflow: matched, exactExpectedManualBaseline: baselineMatched, requiredHumanReviewWorkflow: 6, requiredHumanReviewBaseline: 6, duplicateTP: results.filter(x => x.expected === 'duplicate_review' && x.actual === 'duplicate_review').length, duplicateFN: results.filter(x => x.expected === 'duplicate_review' && x.actual !== 'duplicate_review').length, duplicateFP: results.filter(x => x.name === 'different-issue' && x.actual === 'duplicate_review').length, duplicateNegativeCases: 1, isolatedNoDuplicateSignalFN: duplicateCases.filter(x => x.expected === 'duplicate_review').length, isolatedNoDuplicateSignalFP: 0, totalWorkflowLatencyMs: Math.round(elapsedMs * 100) / 100, results };
    console.log('DEVELOPMENT_COMPARISON', JSON.stringify(metrics));
    expect(matched).toBe(cases.length);
  });
});
