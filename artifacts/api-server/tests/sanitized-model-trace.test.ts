import { describe, expect, it } from 'vitest';
import type { ModelProvider } from '../src/lib/model-provider';
import { tracedProvider } from '../evaluation/sanitized-model-trace';

describe('synthetic model evaluation traces', () => {
  it('keeps only permitted tool arguments and redacts secrets without retaining reasoning', async () => {
    const source: ModelProvider = { kind: 'mock', model: 'mock', async next() { return { output: [
      { type: 'reasoning', summary: 'PRIVATE_REASONING' },
      { type: 'function_call', name: 'extract_report', arguments: JSON.stringify({ issue: 'unknown', location: null, questions: ['اتصل بـ demo@example.test', 'sk-test-secret-placeholder'], injected: 'PRIVATE_FIELD' }) },
    ] }; } };
    const trace: Array<Record<string, unknown>> = [];
    await tracedProvider(source, trace).next({ input: [], tools: [] });
    expect(trace).toEqual([{ name: 'extract_report', arguments: { issue: 'unknown', location: null, questions: ['اتصل بـ [redacted]', '[redacted]'] } }]);
    const saved = JSON.stringify(trace);
    for (const secret of ['PRIVATE_REASONING', 'PRIVATE_FIELD', 'demo@example.test', 'sk-test-secret-placeholder']) expect(saved).not.toContain(secret);
  });
});
