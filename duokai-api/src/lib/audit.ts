import { AdminActionLogModel } from '../models/AdminActionLog.js';

type AuditInput = {
  adminUserId: string;
  adminEmail?: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  detail?: unknown;
};

export async function logAdminAction(input: AuditInput) {
  try {
    await AdminActionLogModel.create({
      adminUserId: input.adminUserId,
      adminEmail: input.adminEmail || '',
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId || '',
      targetLabel: input.targetLabel || '',
      detail: input.detail ?? null,
    });
  } catch (error) {
    console.error('[audit] failed to write admin action log', error);
  }
}
