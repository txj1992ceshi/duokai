type RuntimeProxyFailure = {
  status: number;
  code: 'RUNTIME_TIMEOUT' | 'RUNTIME_UNREACHABLE';
  error: string;
};

type StorageArtifactFailure = {
  status: number;
  code: 'STORAGE_STATE_ARTIFACT_MISSING' | 'STORAGE_STATE_ARTIFACT_INVALID';
  error: string;
};

function extractNodeErrorCode(error: unknown): string {
  const directCode =
    error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  if (directCode) {
    return directCode;
  }
  if (error instanceof Error && error.cause && typeof error.cause === 'object' && 'code' in error.cause) {
    return String((error.cause as { code?: unknown }).code || '');
  }
  return '';
}

export function isRuntimeTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const normalizedName = error.name.toLowerCase();
    const normalizedMessage = error.message.toLowerCase();
    if (
      normalizedName.includes('timeout') ||
      normalizedMessage.includes('timeout') ||
      normalizedMessage.includes('timed out')
    ) {
      return true;
    }
    if (normalizedName === 'aborterror' && normalizedMessage.includes('timeout')) {
      return true;
    }
  }
  return false;
}

export function classifyRuntimeProxyFailure(error: unknown): RuntimeProxyFailure {
  if (isRuntimeTimeoutError(error)) {
    return {
      status: 504,
      code: 'RUNTIME_TIMEOUT',
      error: 'Runtime service request timed out',
    };
  }

  return {
    status: 502,
    code: 'RUNTIME_UNREACHABLE',
    error: 'Runtime service is unreachable',
  };
}

export function classifyStorageArtifactFailure(error: unknown): StorageArtifactFailure {
  const code = extractNodeErrorCode(error).toUpperCase();
  if (code === 'ENOENT') {
    return {
      status: 424,
      code: 'STORAGE_STATE_ARTIFACT_MISSING',
      error: 'Synced storage-state artifact is missing',
    };
  }

  return {
    status: 424,
    code: 'STORAGE_STATE_ARTIFACT_INVALID',
    error: 'Synced storage-state artifact is invalid',
  };
}

export async function parseRuntimeResponsePayload(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {
      success: false,
      error: raw,
    };
  }
}
