import { TASK_STATUSES, type TaskStatus } from './agentTypes.js';

const TERMINAL_STATUSES = new Set<TaskStatus>(['SUCCEEDED', 'FAILED', 'CANCELLED']);
const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  PENDING: ['RECEIVED', 'RUNNING', 'CANCELLED'],
  RECEIVED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function isTaskStatusValue(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value);
}

export function canTransitionTaskStatus(from: TaskStatus, to: TaskStatus) {
  if (from === to) {
    return true;
  }
  return TRANSITIONS[from].includes(to);
}

export function isTerminalTaskStatus(status: TaskStatus) {
  return TERMINAL_STATUSES.has(status);
}

export function validateAckPayload(payload: Record<string, unknown>) {
  const status = String(payload.status || '').trim();
  const idempotencyKey = String(payload.idempotencyKey || '').trim();
  const startedAtRaw = payload.startedAt;
  const endedAtRaw = payload.endedAt;
  const errorCode = String(payload.errorCode || '').trim();
  const errorMessage = String(payload.errorMessage || '').trim();
  const outputRef = String(payload.outputRef || '').trim();
  const diagnostics =
    payload.diagnostics && typeof payload.diagnostics === 'object' && !Array.isArray(payload.diagnostics)
      ? (payload.diagnostics as Record<string, unknown>)
      : null;

  if (!status) {
    return { ok: false as const, error: 'status is required' };
  }
  if (!isTaskStatusValue(status)) {
    return { ok: false as const, error: `Invalid status: ${status}` };
  }

  const startedAt = startedAtRaw ? new Date(String(startedAtRaw)) : null;
  const endedAt = endedAtRaw ? new Date(String(endedAtRaw)) : null;
  if (startedAtRaw && Number.isNaN(startedAt?.getTime())) {
    return { ok: false as const, error: 'startedAt is invalid date' };
  }
  if (endedAtRaw && Number.isNaN(endedAt?.getTime())) {
    return { ok: false as const, error: 'endedAt is invalid date' };
  }

  return {
    ok: true as const,
    value: {
      status,
      idempotencyKey,
      errorCode,
      errorMessage,
      outputRef,
      diagnostics,
      startedAt,
      endedAt,
    },
  };
}

export function validateHeartbeatPayload(payload: Record<string, unknown>) {
  const capabilities = Array.isArray(payload.capabilities)
    ? payload.capabilities.filter((item) => typeof item === 'string').map((item) => String(item))
    : [];
  const agentVersion = String(payload.agentVersion || '').trim();

  return {
    agentVersion,
    capabilities,
    hostInfo:
      payload.hostInfo && typeof payload.hostInfo === 'object' && !Array.isArray(payload.hostInfo)
        ? (payload.hostInfo as Record<string, unknown>)
        : null,
    runtimeStatus:
      payload.runtimeStatus && typeof payload.runtimeStatus === 'object' && !Array.isArray(payload.runtimeStatus)
        ? (payload.runtimeStatus as Record<string, unknown>)
        : null,
  };
}
