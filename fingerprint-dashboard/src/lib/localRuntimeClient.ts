import { getApiBase, getAuthToken } from '@/lib/api-client';

const DEFAULT_LOCAL_RUNTIME_URL = 'http://127.0.0.1:3101';

type LocalRuntimeRequestOptions = {
  runtimeApiKey?: string;
  timeoutMs?: number;
};

type LocalRuntimeErrorCode =
  | 'LOCAL_RUNTIME_TIMEOUT'
  | 'LOCAL_RUNTIME_HTTP_ERROR'
  | 'LOCAL_RUNTIME_UNREACHABLE'
  | 'LOCAL_RUNTIME_BROWSER_BLOCKED';

export class LocalRuntimeRequestError extends Error {
  code: LocalRuntimeErrorCode;
  stage: 'local_execute';
  status?: number;
  payload?: unknown;

  constructor(
    code: LocalRuntimeErrorCode,
    message: string,
    extras: { status?: number; payload?: unknown } = {},
  ) {
    super(message);
    this.name = 'LocalRuntimeRequestError';
    this.code = code;
    this.stage = 'local_execute';
    this.status = extras.status;
    this.payload = extras.payload;
  }
}

function resolveLocalRuntimeUrl(): string {
  return DEFAULT_LOCAL_RUNTIME_URL;
}

function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || '';
  return /Safari/i.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR/i.test(userAgent);
}

function buildLocalRuntimeFetchFailureMessage(): {
  code: LocalRuntimeErrorCode;
  message: string;
} {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    if (isSafariBrowser()) {
      return {
        code: 'LOCAL_RUNTIME_BROWSER_BLOCKED',
        message:
          '当前浏览器可能拦截了 HTTPS Dashboard 页面访问本地 http://127.0.0.1:3101。请优先使用 Chrome 或 Edge，或确认 Safari 已允许访问本地运行时。',
      };
    }
    return {
      code: 'LOCAL_RUNTIME_BROWSER_BLOCKED',
      message:
        '当前 HTTPS Dashboard 页面无法访问本地 http://127.0.0.1:3101。请确认浏览器允许当前页面访问本地运行时，或改用兼容 localhost 直连的浏览器。',
    };
  }

  return {
    code: 'LOCAL_RUNTIME_UNREACHABLE',
    message:
      '无法连接到本地 Runtime Server（http://127.0.0.1:3101）。请确认 stealth-engine/server.js 已在当前电脑启动。',
  };
}

async function callLocalRuntime<T>(
  path: string,
  init: RequestInit,
  options: LocalRuntimeRequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);

  try {
    const headers = new Headers(init.headers || {});
    headers.set('Content-Type', 'application/json');

    const authToken = getAuthToken();
    if (authToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    if (options.runtimeApiKey && !headers.has('x-runtime-key')) {
      headers.set('x-runtime-key', options.runtimeApiKey);
    }

    const response = await fetch(`${resolveLocalRuntimeUrl()}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new LocalRuntimeRequestError(
        'LOCAL_RUNTIME_HTTP_ERROR',
        typeof payload?.error === 'string'
          ? payload.error
          : `Local runtime request failed: HTTP ${response.status}`,
        {
          status: response.status,
          payload,
        },
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof LocalRuntimeRequestError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new LocalRuntimeRequestError(
        'LOCAL_RUNTIME_TIMEOUT',
        '本地 Runtime Server 响应超时，请确认当前电脑上的运行时与浏览器依赖正常。',
      );
    }

    const failure = buildLocalRuntimeFetchFailureMessage();
    throw new LocalRuntimeRequestError(failure.code, failure.message, {
      payload: error instanceof Error ? { cause: error.message } : { cause: String(error) },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkLocalRuntimeHealth(runtimeApiKey?: string): Promise<{ ok: boolean }> {
  return await callLocalRuntime<{ ok: boolean }>(
    '/health',
    { method: 'GET' },
    { runtimeApiKey, timeoutMs: 10_000 },
  );
}

export async function startLocalRuntimeSession(
  payload: Record<string, unknown>,
  runtimeApiKey?: string,
) {
  return await callLocalRuntime<Record<string, unknown>>(
    '/session/start',
    {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        __dashboardBaseUrl: getApiBase(),
      }),
    },
    { runtimeApiKey, timeoutMs: 60_000 },
  );
}

export async function stopLocalRuntimeSession(
  payload: Record<string, unknown>,
  runtimeApiKey?: string,
) {
  return await callLocalRuntime<Record<string, unknown>>(
    '/session/stop',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { runtimeApiKey, timeoutMs: 15_000 },
  );
}

export async function runLocalRuntimeAction(
  payload: Record<string, unknown>,
  runtimeApiKey?: string,
) {
  return await callLocalRuntime<Record<string, unknown>>(
    '/session/action',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { runtimeApiKey, timeoutMs: 30_000 },
  );
}

export async function testLocalBrowserProxy(
  payload: Record<string, unknown>,
  runtimeApiKey?: string,
) {
  return await callLocalRuntime<Record<string, unknown>>(
    '/proxy/test-browser',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { runtimeApiKey, timeoutMs: 45_000 },
  );
}
