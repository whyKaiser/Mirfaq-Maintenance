/**
 * Audit log helper.
 * Call logAction() from any route to record significant events.
 * Failures are caught and logged to stderr — they never propagate to the caller.
 */

import { prisma } from "./prisma";

export type AuditAction =
  | "create_request"
  | "change_status"
  | "change_priority"
  | "assign_technician"
  | "create_property"
  | "delete_property"
  | "create_unit"
  | "delete_unit"
  | "create_user"
  | "activate_user"
  | "deactivate_user"
  | "upload_attachment"
  | "update_settings"
  | "update_request_costs"
  | "rate_request"
  | "create_preventive_plan"
  | "delete_preventive_plan"
  | "complete_preventive_plan"
  | "update_preventive_plan"
  | "rotate_unit_public_token"
  | "change_plan"
  | "update_invoice_status";

export interface LogActionParams {
  organizationId: string;
  actorId: string;
  actorName: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  details?: Record<string, unknown>;
}

export async function logAction(params: LogActionParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        actorId: params.actorId,
        actorName: params.actorName,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        entityLabel: params.entityLabel ?? null,
        details: params.details ? JSON.stringify(params.details) : null,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}

export const ACTION_LABELS: Record<AuditAction, string> = {
  create_request: "إنشاء بلاغ",
  change_status: "تغيير الحالة",
  change_priority: "تغيير الأولوية",
  assign_technician: "تعيين فني",
  create_property: "إضافة عقار",
  delete_property: "حذف عقار",
  create_unit: "إضافة وحدة",
  delete_unit: "حذف وحدة",
  create_user: "إنشاء مستخدم",
  activate_user: "تفعيل مستخدم",
  deactivate_user: "تعطيل مستخدم",
  upload_attachment: "رفع مرفق",
  update_settings: "تحديث إعدادات الشركة",
  update_request_costs: "تحديث تكاليف البلاغ",
  rate_request: "تقييم البلاغ",
  create_preventive_plan: "إنشاء خطة صيانة وقائية",
  delete_preventive_plan: "حذف خطة صيانة وقائية",
  complete_preventive_plan: "إكمال صيانة وقائية",
  update_preventive_plan: "تحديث خطة صيانة وقائية",
  rotate_unit_public_token: "تدوير رمز بلاغ الوحدة",
  change_plan: "تغيير الباقة",
  update_invoice_status: "تحديث حالة الفاتورة",
};
