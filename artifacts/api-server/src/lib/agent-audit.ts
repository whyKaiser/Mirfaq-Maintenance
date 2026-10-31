import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

// Only fixed codes are persisted. Never send user text, headers, model output,
// foreign identifiers, credentials, or exception details into this log.
export type AuditAction = 'authorization' | 'plan' | 'intake' | 'order' | 'replan' | 'followup' | 'model' | 'snapshot' | 'safety';
export type AuditOutcome = 'denied' | 'escalated' | 'failed' | 'unknown' | 'recorded' | 'verified';
export async function auditAgent(organizationId: string, actorId: string, action: AuditAction, outcome: AuditOutcome, reasonCode: string, db: Prisma.TransactionClient = prisma) {
  if (!/^[a-z_]{2,48}$/.test(reasonCode)) throw new Error('invalid_audit_code');
  await db.agentAudit.create({ data: { organizationId, actorId, action, outcome, reasonCode } });
}

// Outside a transaction, preserve the API response if audit storage is unavailable.
// The response explicitly marks that the record could not be confirmed.
export async function auditForResponse(res: import('express').Response, organizationId: string, actorId: string, action: AuditAction, outcome: AuditOutcome, reasonCode: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([auditAgent(organizationId, actorId, action, outcome, reasonCode), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('audit_timeout')), 2000); })]);
  } catch { res.setHeader('X-Agent-Audit-Status', 'outcome_unknown'); }
  finally { if (timer) clearTimeout(timer); }
}
