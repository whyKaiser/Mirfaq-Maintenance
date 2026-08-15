import { Router, type RequestHandler } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { upload, buildStorageKey } from "../lib/upload";
import {
  getFileUrl,
  deleteStoredFile,
  saveStoredFile,
  readStoredFile,
} from "../lib/storage";
import { logAction } from "../lib/audit";
import { getMaintenanceRequestAccess } from "../lib/request-access";

const router = Router();

const requireRequestAccess: RequestHandler = async (req, res, next) => {
  try {
    const access = await getMaintenanceRequestAccess(
      {
        organizationId: req.session.organizationId!,
        userId: req.session.userId!,
        role: req.session.userRole!,
      },
      req.params.requestId,
    );
    if (access.decision === "not-found") {
      return res.status(404).json({ error: "البلاغ غير موجود" });
    }
    if (access.decision === "forbidden") {
      return res
        .status(403)
        .json({ error: "ليس لديك صلاحية الوصول لهذا البلاغ" });
    }

    res.locals.maintenanceRequest = access.request;
    next();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
};

// POST /api/requests/:requestId/attachments
// Accepts up to 3 images (JPEG/PNG/WebP, max 3 MB each)
router.post(
  "/requests/:requestId/attachments",
  requireAuth,
  requireRequestAccess,
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

      const userId = req.session.userId!;
      const request = res.locals.maintenanceRequest as {
        id: string;
        title: string;
      };

      // Check total count won't exceed 3 per type
      const existing = await prisma.requestAttachment.count({ where: { requestId, attachmentType } });
      if (existing + files.length > 3) {
        return res.status(400).json({ error: `الحد الأقصى 3 صور من نوع ${attachmentType === "initial" ? "أولي" : "إتمام"} لكل بلاغ` });
      }

      // Store the bytes first: a stored object with no row is recoverable
      // clutter, while a row pointing at nothing breaks the attachment list.
      const stored = await Promise.all(
        files.map(async (file) => {
          const key = buildStorageKey(file.mimetype);
          await saveStoredFile(key, file.buffer, file.mimetype);
          return { file, key };
        }),
      );

      const created = await Promise.all(
        stored.map(({ file, key }) =>
          prisma.requestAttachment.create({
            data: {
              requestId,
              uploaderUserId: userId,
              organizationId: req.session.organizationId!,
              filePath: key,
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

    const access = await getMaintenanceRequestAccess(
      {
        organizationId: req.session.organizationId!,
        userId: req.session.userId!,
        role: req.session.userRole!,
      },
      attachment.requestId,
    );
    if (access.decision === "not-found") {
      return res.status(404).json({ error: "المرفق غير موجود" });
    }
    if (access.decision === "forbidden") {
      return res.status(403).json({ error: "ليس لديك صلاحية حذف هذا المرفق" });
    }

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

// GET /api/files/:filename  (authenticated file serving with request access check)
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

    const access = await getMaintenanceRequestAccess(
      {
        organizationId: req.session.organizationId!,
        userId: req.session.userId!,
        role: req.session.userRole!,
      },
      attachment.requestId,
    );
    if (access.decision === "not-found") {
      return res.status(404).json({ error: "الملف غير موجود" });
    }
    if (access.decision === "forbidden") {
      return res.status(403).json({ error: "ليس لديك صلاحية الوصول لهذا الملف" });
    }

    const stream = await readStoredFile(filename);
    if (!stream) return res.status(404).json({ error: "الملف غير موجود" });

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    stream.on("error", (err) => {
      req.log.error(err);
      if (!res.headersSent) res.status(500).json({ error: "خطأ في الخادم" });
      else res.end();
    });
    stream.pipe(res);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
