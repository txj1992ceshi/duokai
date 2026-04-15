import { apiFetch } from '@/lib/api-client';
import {
  checkLocalRuntimeHealth,
  LocalRuntimeRequestError,
  runLocalRuntimeAction,
  startLocalRuntimeSession,
  stopLocalRuntimeSession,
  testLocalBrowserProxy,
} from '@/lib/localRuntimeClient';
import type { ProxyProtocol, ProxyVerificationRecord } from '@/lib/proxyTypes';

type RuntimePrepareAction = 'start' | 'stop' | 'action';

type PreparedRuntimeAction = {
  success: true;
  action: RuntimePrepareAction;
  executionTarget: 'local-runtime';
  runtimeApiKey: string;
  profileId: string;
  preparedPayload: Record<string, unknown>;
};

type PreparedProxyCheck = {
  success: true;
  executionTarget: 'local-runtime';
  runtimeApiKey: string;
  preparedPayload: Record<string, unknown>;
};

export class RuntimeClientError extends Error {
  stage: 'cloud_prepare' | 'local_execute' | 'cloud_sync';
  details?: unknown;
  verification?: ProxyVerificationRecord;
  hostEnvironment?: string;
  sessionId?: string;

  constructor(
    stage: 'cloud_prepare' | 'local_execute' | 'cloud_sync',
    message: string,
    extras: {
      details?: unknown;
      verification?: ProxyVerificationRecord;
      hostEnvironment?: string;
      sessionId?: string;
    } = {},
  ) {
    super(message);
    this.name = 'RuntimeClientError';
    this.stage = stage;
    this.details = extras.details;
    this.verification = extras.verification;
    this.hostEnvironment = extras.hostEnvironment;
    this.sessionId = extras.sessionId;
  }
}

function normalizeErrorMessage(payload: unknown, fallbackMessage: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string' && record.error.trim()) return record.error;
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
  }
  return fallbackMessage;
}

async function prepareRuntimeAction(
  action: RuntimePrepareAction,
  payload: Record<string, unknown>,
): Promise<PreparedRuntimeAction> {
  const response = await apiFetch(`/api/runtime/${action}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok || data?.success !== true) {
    throw new RuntimeClientError(
      'cloud_prepare',
      normalizeErrorMessage(data, '云端准备环境动作失败'),
      { details: data },
    );
  }

  return data as unknown as PreparedRuntimeAction;
}

async function prepareProxyBrowserCheck(
  payload: Record<string, unknown>,
): Promise<PreparedProxyCheck> {
  const response = await apiFetch('/api/proxy/browser-check', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok || data?.success !== true) {
    throw new RuntimeClientError(
      'cloud_prepare',
      normalizeErrorMessage(data, '云端准备代理测试失败'),
      { details: data },
    );
  }

  return data as unknown as PreparedProxyCheck;
}

async function syncProfileRuntimeState(
  profileId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await apiFetch(`/api/profiles/${profileId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data?.success !== true) {
    throw new RuntimeClientError(
      'cloud_sync',
      normalizeErrorMessage(data, '云端运行状态回写失败'),
      { details: data },
    );
  }
}

function toLocalExecutionError(
  error: unknown,
  fallbackMessage: string,
): RuntimeClientError {
  if (error instanceof RuntimeClientError) {
    return error;
  }
  if (error instanceof LocalRuntimeRequestError) {
    const payload =
      error.payload && typeof error.payload === 'object'
        ? (error.payload as Record<string, unknown>)
        : undefined;
    return new RuntimeClientError(
      'local_execute',
      normalizeErrorMessage(payload, error.message || fallbackMessage),
      {
        details: payload || { code: error.code, status: error.status, message: error.message },
        verification: payload as ProxyVerificationRecord | undefined,
        hostEnvironment:
          payload && typeof payload.hostEnvironment === 'string'
            ? payload.hostEnvironment
            : undefined,
        sessionId:
          payload && typeof payload.sessionId === 'string'
            ? payload.sessionId
            : undefined,
      },
    );
  }
  return new RuntimeClientError(
    'local_execute',
    error instanceof Error ? error.message : fallbackMessage,
    { details: error },
  );
}

function buildLocalProxyFailureRecord(
  payload: Record<string, unknown>,
  error: unknown,
): ProxyVerificationRecord {
  if (error instanceof RuntimeClientError && error.verification) {
    return error.verification;
  }
  if (error instanceof LocalRuntimeRequestError && error.payload && typeof error.payload === 'object') {
    const verification = error.payload as Record<string, unknown>;
    return {
      layer: 'environment',
      status: 'unknown',
      proxyType: verification.proxyType as ProxyProtocol | undefined,
      error: normalizeErrorMessage(verification, error.message),
      errorType: error.code,
      detail:
        typeof verification.detail === 'string'
          ? verification.detail
          : error.message,
      expectedIp: typeof payload.expectedIp === 'string' ? payload.expectedIp : undefined,
      expectedCountry:
        typeof payload.expectedCountry === 'string' ? payload.expectedCountry : undefined,
      expectedRegion:
        typeof payload.expectedRegion === 'string' ? payload.expectedRegion : undefined,
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    layer: 'environment',
    status: 'unknown',
    proxyType: typeof payload.proxyType === 'string' ? (payload.proxyType as ProxyProtocol) : undefined,
    error: error instanceof Error ? error.message : '本地运行时执行代理测试失败',
    errorType:
      error instanceof LocalRuntimeRequestError
        ? error.code
        : error instanceof RuntimeClientError
          ? error.stage
          : 'local_execute',
    detail:
      error instanceof RuntimeClientError
        ? error.message
        : error instanceof Error
          ? error.message
          : '本地运行时执行代理测试失败',
    expectedIp: typeof payload.expectedIp === 'string' ? payload.expectedIp : undefined,
    expectedCountry: typeof payload.expectedCountry === 'string' ? payload.expectedCountry : undefined,
    expectedRegion: typeof payload.expectedRegion === 'string' ? payload.expectedRegion : undefined,
    checkedAt: new Date().toISOString(),
  };
}

export async function checkRuntimeHealth(runtimeApiKey?: string) {
  return await checkLocalRuntimeHealth(runtimeApiKey);
}

export async function startSession<T extends { id: string; fingerprint?: unknown }>(
  profile: T,
  proxy?: Record<string, unknown>,
  opts = { headless: false },
) {
  const body = {
    profileId: profile.id,
    fingerprintConfig: profile.fingerprint,
    profile,
    proxy,
    headless: !!opts.headless,
  };

  const prepared = await prepareRuntimeAction('start', body);

  let localResult: Record<string, unknown> | null = null;
  try {
    localResult = await startLocalRuntimeSession(prepared.preparedPayload, prepared.runtimeApiKey);
  } catch (error) {
    throw toLocalExecutionError(error, '本地启动环境失败');
  }

  if (!localResult?.sessionId || typeof localResult.sessionId !== 'string') {
    return localResult;
  }

  try {
    await syncProfileRuntimeState(prepared.profileId, {
      runtimeSessionId: localResult.sessionId,
      status: 'Running',
      proxyVerification: localResult.verification,
      lastResolvedProxyTransport:
        typeof localResult.effectiveProxyTransport === 'string'
          ? localResult.effectiveProxyTransport
          : undefined,
      lastHostEnvironment:
        typeof localResult.hostEnvironment === 'string'
          ? localResult.hostEnvironment
          : undefined,
      startupNavigation:
        localResult.startupNavigation && typeof localResult.startupNavigation === 'object'
          ? localResult.startupNavigation
          : undefined,
      lastLaunchAt: new Date().toISOString(),
    });
  } catch (syncError) {
    try {
      await stopLocalRuntimeSession({ sessionId: localResult.sessionId }, prepared.runtimeApiKey);
    } catch {
      // Preserve the sync error; local rollback is best-effort only.
    }
    throw new RuntimeClientError(
      'cloud_sync',
      '本地环境已启动，但云端状态回写失败，已尝试回滚本地会话。',
      {
        details: syncError,
        verification: localResult.verification as ProxyVerificationRecord | undefined,
        hostEnvironment:
          typeof localResult.hostEnvironment === 'string'
            ? localResult.hostEnvironment
            : undefined,
        sessionId: localResult.sessionId,
      },
    );
  }

  return localResult;
}

export async function stopSession(sessionId: string) {
  const prepared = await prepareRuntimeAction('stop', { sessionId });

  let localResult: Record<string, unknown> | null = null;
  try {
    localResult = await stopLocalRuntimeSession(prepared.preparedPayload, prepared.runtimeApiKey);
  } catch (error) {
    throw toLocalExecutionError(error, '本地停止环境失败');
  }

  await syncProfileRuntimeState(prepared.profileId, {
    runtimeSessionId: '',
    status: 'Ready',
  });

  return localResult;
}

export async function doSessionAction(sessionId: string, action: Record<string, unknown>) {
  const prepared = await prepareRuntimeAction('action', { sessionId, action });

  try {
    return await runLocalRuntimeAction(prepared.preparedPayload, prepared.runtimeApiKey);
  } catch (error) {
    throw toLocalExecutionError(error, '本地执行环境动作失败');
  }
}

export async function testBrowserProxy(payload: Record<string, unknown>) {
  try {
    const prepared = await prepareProxyBrowserCheck(payload);
    return (await testLocalBrowserProxy(
      prepared.preparedPayload,
      prepared.runtimeApiKey,
    )) as unknown as ProxyVerificationRecord;
  } catch (error) {
    if (error instanceof RuntimeClientError && error.stage === 'cloud_prepare') {
      throw error;
    }
    return buildLocalProxyFailureRecord(payload, error);
  }
}
