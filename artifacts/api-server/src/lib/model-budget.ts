import { closeSync, existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// One persistent ledger outside the demo database. A crash, missing ledger,
// stale lock, missing usage, timeout or invalid response blocks further calls.
export const BUDGET_POLICY = Object.freeze({ model: 'gpt-5.6-luna', maxCalls: 10, maxInputTokens: 8192, inputOverheadTokens: 512, maxOutputTokens: 600, maxRequestBytes: 16000, maxReservedMicroUsd: 200000, pricingValidUntil: '2026-11-01T00:00:00.000Z' });
type Entry = { id: string; status: 'pending' | 'success' | 'rejected' | 'unknown'; reservedMicroUsd: number; estimatedMicroUsd?: number; countTokens?: number; inputTokens?: number; outputTokens?: number; createdAt: string };
type Ledger = { version: 1; model: string; entries: Entry[]; blocked: boolean };

export function initializeModelBudget(path: string) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify({ version: 1, model: BUDGET_POLICY.model, entries: [], blocked: false })); fsyncSync(fd); }
  finally { closeSync(fd); }
}
function locked<T>(path: string, update: (ledger: Ledger) => T): T {
  if (!path || !existsSync(path)) throw new Error('model_budget_unavailable');
  const lockPath = `${path}.lock`;
  const lock = openSync(lockPath, 'wx', 0o600);
  try {
    const ledger = JSON.parse(readFileSync(path, 'utf8')) as Ledger;
    if (ledger.version !== 1 || ledger.model !== BUDGET_POLICY.model || typeof ledger.blocked !== 'boolean' || !Array.isArray(ledger.entries) || ledger.entries.length > BUDGET_POLICY.maxCalls || ledger.entries.some(e => !e || e.reservedMicroUsd !== 20000 || typeof e.id !== 'string' || !/^[0-9a-f-]{36}$/.test(e.id) || typeof e.createdAt !== 'string' || !['pending', 'success', 'rejected', 'unknown'].includes(e.status) || (e.status === 'success' && (!Number.isSafeInteger(e.countTokens) || e.countTokens! < 0 || e.countTokens! > BUDGET_POLICY.maxInputTokens || !Number.isSafeInteger(e.inputTokens) || e.inputTokens! < 0 || e.inputTokens! > BUDGET_POLICY.maxInputTokens || !Number.isSafeInteger(e.outputTokens) || e.outputTokens! < 0 || e.outputTokens! > BUDGET_POLICY.maxOutputTokens)) || (e.status === 'rejected' && (!Number.isSafeInteger(e.countTokens) || e.countTokens! + BUDGET_POLICY.inputOverheadTokens <= BUDGET_POLICY.maxInputTokens)))) throw new Error('invalid_model_budget');
    const result = update(ledger);
    const fd = openSync(path, 'r+');
    try { const data = Buffer.from(JSON.stringify(ledger)); ftruncateSync(fd, 0); writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
    return result;
  } finally { closeSync(lock); unlinkSync(lockPath); }
}
export function reserveModelCall(path: string): string {
  return locked(path, ledger => {
    if (ledger.blocked || ledger.entries.some(e => e.status === 'pending' || e.status === 'unknown') || ledger.entries.length >= BUDGET_POLICY.maxCalls) throw new Error('model_budget_exhausted_or_unknown');
    const id = randomUUID(); ledger.entries.push({ id, status: 'pending', reservedMicroUsd: 20000, createdAt: new Date().toISOString() }); return id;
  });
}
export function finishModelCall(path: string, id: string, status: 'success' | 'rejected' | 'unknown', counts: { countTokens?: number; inputTokens?: number; outputTokens?: number } = {}) {
  locked(path, ledger => {
    const entry = ledger.entries.find(e => e.id === id);
    if (!entry || entry.status !== 'pending') throw new Error('invalid_model_reservation');
    Object.assign(entry, counts, { status });
    if (status === 'success' && counts.countTokens !== undefined && counts.inputTokens !== undefined && counts.outputTokens !== undefined) entry.estimatedMicroUsd = Math.ceil((counts.countTokens + counts.inputTokens) * 0.25 + counts.outputTokens * 1.2);
    if (status === 'unknown') ledger.blocked = true;
  });
}
