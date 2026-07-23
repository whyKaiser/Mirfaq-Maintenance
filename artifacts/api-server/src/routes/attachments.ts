import { Router } from "express";
import path from "path";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { upload } from "../lib/upload";
import { getFileUrl, deleteStoredFile, UPLOAD_DIR } from "../lib/storage";
import { logAction } from "../lib/audit";

const router = Router();

// POST /api/requests/:requestId/attachments
// Accepts up to 3 images (JPEG/PNG/WebP, max 3 MB each)
router.post(
  "/requests/:requestId/attachments",
  requireAuth,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req, res, next) => (upload as any).array("images", 3)(req, res, (err: unknown) => {
    if (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "خطأ في رفع الملف" });
    }
    next();
  }),
  async (req, res) => {
    try {
      const { requestId } = req.params;
      const files = (req.files ?? []) as Express.Multer.File[];
      const attachmentType = (req.body.attachmentType as string) || "initial";

      if (!files.length) {
        return res.status(400).json({ error: "لم يتم إرفاق أي صورة" });
      }

      // Load request and verify org isolation
      const request = await prisma.maintenanceRequest.findFirst({
        where: { id: requestId, organizationId: req.session.organizationId! },
      });
      if (!request) {
        return res.status(404).json({ error: "البلاغ غير موجود" });
      }

      // Role checks
      const role = req.session.userRole!;
      const userId = req.session.userId!;
      if (role === "resident" && request.residentId !== userId) {
        return res.status(403).json({ error: "ليس لديك صلاحية رفع مرفق لهذا البلاغ" });
      }
      if (role === "technician") {
        const profile = await prisma.technicianProfile.findUnique({ where: { userId } });
        if (!profile || request.technicianId !== profile.id) {
          return res.status(403).json({ error: "ليس لديك صلاحية رفع مرفق لهذا البلاغ" });
        }
      }

      // Check total count won't exceed 3 per type
      const existing = await prisma.requestAttachment.count({ where: { requestId, attachmentType } });
      if (existing + files.length > 3) {
        return res.status(400).json({ error: `الحد الأقصى 3 صور من نوع ${attachmentType === "initial" ? "أولي" : "إتمام"} لكل بلاغ` });
      }

      const created = await Promise.all(
        files.map((file) =>
          prisma.requestAttachment.create({
            data: {
              requestId,
              uploaderUserId: userId,
              organizationId: req.session.organizationId!,
              filePath: file.filename,
              fileName: file.originalname,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              attachmentType,
            },
          }),
        ),
      );

      await logAction({
        organizationId: req.session.organizationId!,
        actorId: userId,
        actorName: req.session.userName!,
        action: "upload_attachment",
        entityType: "request",
        entityId: requestId,
        entityLabel: request.title,
        details: { count: files.length, type: attachmentType },
      });

      res.status(201).json(
        created.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          attachmentType: a.attachmentType,
          url: getFileUrl(a.filePath),
          createdAt: a.createdAt.toISOString(),
        })),
      );
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "خطأ في الخادم" });
    }
  },
);

// DELETE /api/attachments/:id
router.delete("/attachments/:id", requireAuth, async (req, res) => {
  try {
    const attachment = await prisma.requestAttachment.findFirst({
      where: { id: req.params.id, organizationId: req.session.organizationId! },
    });
    if (!attachment) return res.status(404).json({ error: "المرفق غير موجود" });

    const role = req.session.userRole!;
    if (role !== "manager" && attachment.uploaderUserId !== req.session.userId) {
      return res.status(403).json({ error: "ليس لديك صلاحية حذف هذا المرفق" });
    }

    await deleteStoredFile(attachment.filePath);
    await prisma.requestAttachment.delete({ where: { id: req.params.id } });
    res.json({ message: "تم حذف المرفق بنجاح" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// GET /api/files/:filename  (authenticated file serving with org check)
router.get("/files/:filename", requireAuth, async (req, res) => {
  try {
    const { filename } = req.params;

    // Prevent path traversal
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({ error: "اسم ملف غير صالح" });
    }

    const attachment = await prisma.requestAttachment.findFirst({
      where: { filePath: filename, organizationId: req.session.organizationId! },
    });
    if (!attachment) return res.status(404).json({ error: "الملف غير موجود" });

    const filePath = path.join(UPLOAD_DIR, filename);
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.sendFile(filePath);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
