import type { ModelProvider, ProviderRequest } from '../src/lib/model-provider';

// Evaluation fixtures are synthetic. Store function arguments only, never
// reasoning items, prompts, headers, credentials or arbitrary provider output.
const known = new Set(['extract_report', 'choose_next_step', 'finish', 'read_case', 'read_policy', 'inspect_order_plan', 'create_order', 'read_order']);
function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return v.slice(0, 250).replace(/\b(?:authorization|api[_-]?key|password|token)\s*[:=]\s*\S+/gi, '[redacted]').replace(/\bsk-[A-Za-z0-9_-]+/gi, '[redacted]').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]').replace(/(?:\+?\d[\d\s-]{7,}\d)/g, '[redacted]');
}
export function tracedProvider(provider: ModelProvider, trace: Array<Record<string, unknown>>): ModelProvider {
  return { kind: provider.kind, model: provider.model, async next(request: ProviderRequest) {
    const reply = await provider.next(request);
    for (const item of reply.output.filter(x => x.type === 'function_call')) {
      const name = typeof item.name === 'string' && known.has(item.name) ? item.name : 'unknown_tool';
      let a: Record<string, unknown> = {};
      try { const x: unknown = typeof item.arguments === 'string' ? JSON.parse(item.arguments) : null; if (x && typeof x === 'object' && !Array.isArray(x)) a = x as Record<string, unknown>; } catch { /* record malformed only */ }
      let args: Record<string, unknown> = {};
      if (name === 'extract_report') args = { issue: clean(a.issue), location: a.location === null ? null : clean(a.location), questions: Array.isArray(a.questions) ? a.questions.slice(0, 5).map(clean) : null };
      else if (name === 'choose_next_step') args = { action: clean(a.action) };
      else if (name === 'finish') args = { summary: clean(a.summary), questions: Array.isArray(a.questions) ? a.questions.slice(0, 6).map(clean) : null };
      trace.push({ name, arguments: args });
    }
    return reply;
  } };
}
