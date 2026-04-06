type MaybeRecord = Record<string, unknown> | null | undefined;

function getNestedCode(container: MaybeRecord, key: string): string {
  const nested = container?.[key];
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
    return '';
  }
  return String((nested as Record<string, unknown>).code || '').trim();
}

export function resolveControlTaskReasonCode(task: {
  status?: string;
  errorCode?: string;
  terminalReasonCode?: string;
  payload?: MaybeRecord;
}) {
  const directErrorCode = String(task.errorCode || '').trim();
  if (directErrorCode) {
    return directErrorCode;
  }
  const terminalReasonCode = String(task.terminalReasonCode || '').trim();
  if (terminalReasonCode) {
    return terminalReasonCode;
  }
  const payload =
    task.payload && typeof task.payload === 'object' && !Array.isArray(task.payload)
      ? task.payload
      : null;
  const preLaunchCode = getNestedCode(payload, 'preLaunchDecision');
  const leaseValidationCode = getNestedCode(payload, 'leaseValidation');

  if (String(task.status || '').trim() === 'FAILED') {
    return preLaunchCode || leaseValidationCode || 'FAILED_UNKNOWN';
  }

  if (String(task.status || '').trim() === 'CANCELLED') {
    return preLaunchCode || leaseValidationCode || 'CANCELLED';
  }

  return preLaunchCode || leaseValidationCode || '';
}
