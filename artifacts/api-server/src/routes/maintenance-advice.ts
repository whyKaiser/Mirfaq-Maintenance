import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { maintenanceAdvice, closureAdvice, screenClosureReport } from "../lib/maintenance-advice";
import { modelAdvice } from "../lib/model-advice";
import { openAIResponsesProvider } from "../lib/model-provider";

const router = Router();

// Disabled by default. Only the local demo organization may be sent to a model.
router.post("/maintenance-advice/:requestId/model", requireRole("manager"), async (req, res) => {
  if (process.env.NODE_ENV === "production" || process.env.MIRFAQ_AGENT_DEMO_ONLY !== "1" || req.session.organizationId !== "org-demo") return res.status(403).json({ error: "التجربة غير مفعلة لهذه الجهة" });
  const key = process.env.OPENAI_API_KEY, model = process.env.MIRFAQ_AGENT_MODEL;
  if (process.env.MIRFAQ_AGENT_PROVIDER !== "openai-responses" || !key || !model) return res.status(503).json({ error: "النموذج غير مهيأ" });
  try {
    const ticket = await prisma.maintenanceRequest.findFirst({ where: { id: req.params.requestId, organizationId: req.session.organizationId }, select: { title: true, description: true } });
    if (!ticket) return res.status(404).json({ error: "البلاغ غير موجود" });
    return res.json(await modelAdvice(ticket, openAIResponsesProvider({ key, model })));
  } catch {
    // Do not log provider payloads, user reports, or credentials.
    return res.status(502).json({ error: "تعذر تشغيل النموذج أو التحقق من مخرجاته" });
  }
});

// Advice is read-only and manager-only. Organization comes solely from session.
router.get("/maintenance-advice/:requestId", requireRole("manager"), async (req, res) => {
  try {
    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: req.params.requestId, organizationId: req.session.organizationId! },
      select: { id: true, title: true, description: true, propertyId: true, unitId: true, technicianId: true, status: true },
    });
    if (!request) return res.status(404).json({ error: "البلاغ غير موجود" });
    return res.json({ request, advice: maintenanceAdvice(request.title, request.description), mode: "deterministic_advice", savedOrAssigned: false });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "تعذر قراءة البلاغ" });
  }
});

router.post("/maintenance-advice/:requestId/closure", requireRole("manager"), async (req, res) => {
  try {
    const request = await prisma.maintenanceRequest.findFirst({
      where: { id: req.params.requestId, organizationId: req.session.organizationId! }, select: { id: true },
    });
    if (!request) return res.status(404).json({ error: "البلاغ غير موجود" });
    const fields = ["actionDescribed", "issueResolved", "evidenceAttached", "contradiction"] as const;
    if (!req.body || fields.some((key) => typeof req.body[key] !== "boolean")) {
      return res.status(400).json({ error: "يلزم تقديم جميع حقائق المراجعة" });
    }
    return res.json(closureAdvice(req.body));
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "تعذرت مراجعة البلاغ" });
  }
});

// Reads existing technician comments and completion attachments; does not close the request.
router.get("/maintenance-advice/:requestId/closure", requireRole("manager"), async (req, res) => {
  try {
    const orgId = req.session.organizationId!;
    const ticket = await prisma.maintenanceRequest.findFirst({
      where: { id: req.params.requestId, organizationId: orgId },
      select: { id: true, technician: { select: { userId: true } } },
    });
    if (!ticket) return res.status(404).json({ error: "البلاغ غير موجود" });
    const authorId = ticket.technician?.userId;
    const report = authorId ? await prisma.requestComment.findFirst({ where: { requestId: ticket.id, authorId, author: { role: "technician", organizationId: orgId } }, orderBy: { createdAt: "desc" }, select: { content: true, createdAt: true } }) : null;
    const count = await prisma.requestAttachment.count({ where: { requestId: ticket.id, organizationId: orgId, attachmentType: "completion" } });
    return res.json({ ...screenClosureReport(report?.content ?? null, count), reportDate: report?.createdAt ?? null });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "تعذرت قراءة أدلة البلاغ" });
  }
});

export default router;
