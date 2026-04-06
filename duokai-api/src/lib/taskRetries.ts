import { randomUUID } from 'node:crypto';

export function normalizeTaskAttemptCount(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return Math.max(1, Math.floor(fallback) || 1);
  }
  return Math.max(1, Math.floor(parsed));
}

export function buildRetryTaskPayload(options: {
  existingTask: {
    taskId?: string;
    agentId?: string;
    type?: string;
    payload?: Record<string, unknown> | null;
    idempotencyKey?: string;
    createdByUserId?: string;
    createdByEmail?: string;
    attemptCount?: number;
    maxAttempts?: number;
  };
}) {
  const attemptCount = normalizeTaskAttemptCount(options.existingTask.attemptCount, 1) + 1;
  const maxAttempts = normalizeTaskAttemptCount(options.existingTask.maxAttempts, attemptCount);
  const retryBase =
    String(options.existingTask.idempotencyKey || '').trim() || String(options.existingTask.taskId || '').trim();

  return {
    taskId: randomUUID(),
    agentId: String(options.existingTask.agentId || '').trim(),
    type: String(options.existingTask.type || '').trim(),
    status: 'PENDING',
    payload:
      options.existingTask.payload && typeof options.existingTask.payload === 'object'
        ? options.existingTask.payload
        : {},
    idempotencyKey: `${retryBase}:retry:${attemptCount}`,
    attemptCount,
    maxAttempts,
    retryOfTaskId: String(options.existingTask.taskId || '').trim(),
    supersededByTaskId: '',
    terminalReasonCode: '',
    createdByUserId: String(options.existingTask.createdByUserId || '').trim(),
    createdByEmail: String(options.existingTask.createdByEmail || '').trim(),
  };
}
