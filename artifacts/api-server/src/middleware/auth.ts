import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { auditForResponse } from "../lib/agent-audit";

async function auditDenied(req: Request, res: Response, reason: 'session_invalid' | 'role_denied') {
  if (!/^\/api\/(agent\/|maintenance-advice\/)/.test(req.originalUrl)) return;
  if (!req.session.userId || !req.session.organizationId) { res.setHeader('X-Agent-Audit-Status', 'not_recorded'); return; }
  // Only associate a denial with a tenant after independently confirming membership.
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const member = await Promise.race([
      prisma.user.findFirst({ where: { id: req.session.userId, organizationId: req.session.organizationId }, select: { id: true } }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('membership_timeout')), 2000); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    if (member) await auditForResponse(res, req.session.organizationId, member.id, 'authorization', 'denied', reason);
    else res.setHeader('X-Agent-Audit-Status', 'not_recorded');
  } catch { res.setHeader('X-Agent-Audit-Status', 'outcome_unknown'); }
}

async function sessionIsCurrent(req: Request) {
  if (!req.session.userId || !req.session.organizationId || !req.session.userRole) return false;
  const user = await prisma.user.findFirst({ where: { id: req.session.userId, organizationId: req.session.organizationId, role: req.session.userRole, isActive: true }, select: { id: true } });
  return Boolean(user);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await sessionIsCurrent(req)) { await auditDenied(req, res, 'session_invalid'); return res.status(401).json({ error: "الجلسة غير صالحة" }); }
    next();
  } catch (error) { next(error); }
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!await sessionIsCurrent(req)) { await auditDenied(req, res, 'session_invalid'); return res.status(401).json({ error: "الجلسة غير صالحة" }); }
      if (!roles.includes(req.session.userRole!)) { await auditDenied(req, res, 'role_denied'); return res.status(403).json({ error: "ليس لديك صلاحية الوصول لهذه الصفحة" }); }
      next();
    } catch (error) { next(error); }
  };
}
