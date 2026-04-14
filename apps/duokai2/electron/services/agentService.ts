import { setTimeout as sleep } from 'node:timers/promises';
import { isRecoverableNetworkFailure } from './networkErrorRecovery';

type AgentTaskStatus = 'RECEIVED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
type AgentTaskType =
  | 'PROFILE_START'
  | 'PROFILE_STOP'
  | 'WORKSPACE_SNAPSHOT'
  | 'WORKSPACE_RESTORE'
  | 'PROFILE_VERIFY'
  | 'OPEN_PLATFORM';

type AgentTask = {
  taskId: string;
  type: AgentTaskType;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
};

export type AgentServiceState = {
  enabled: boolean;
  writable: boolean;
  connected: boolean;
  agentId: string;
  protocolVersion: '1';
  lastHeartbeatAt: string | null;
  lastError: string;
  lastErrorCode?: string;
  lastErrorKind?: 'network' | 'auth' | 'task' | 'unknown';
  lastRecoverableFailureSource?: 'request' | 'global-network' | 'unknown';
  lastRecoverableFailureAt?: string | null;
  consecutiveFailures: number;
  lastTaskId: string | null;
  lastTaskStatus: AgentTaskStatus | null;
  lastTaskFinishedAt: string | null;
};

export type RemoteConfigSnapshot = {
  syncVersion: number;
  profiles: unknown[];
  proxies: unknown[];
  templates: unknown[];
  cloudPhones: unknown[];
  settings: Record<string, unknown>;
};

type PushMode = 'replace' | 'merge';

type TaskExecutionResult = {
  status: Exclude<AgentTaskStatus, 'RECEIVED'>;
  errorCode?: string;
  errorMessage?: string;
  outputRef?: string;
  diagnostics?: Record<string, unknown>;
};

type AgentServiceOptions = {
  apiBase: string;
  agentId: string;
  registrationCode: string;
  agentVersion: string;
  capabilities: string[];
  getRuntimeStatus: () => Record<string, unknown>;
  getHostInfo: () => Record<string, unknown>;
  executeTask: (task: AgentTask) => Promise<TaskExecutionResult>;
  onStateChange?: (state: AgentServiceState) => void;
};

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeDiagnostics(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function classifyExecutionFailure(error: unknown): Pick<TaskExecutionResult, 'errorCode' | 'errorMessage' | 'diagnostics'> {
  const message = readErrorMessage(error).trim() || 'Task execution failed';
  const normalized = message.toLowerCase();

  if (normalized.includes('profile not found')) {
    return { errorCode: 'PROFILE_NOT_FOUND', errorMessage: message, diagnostics: { reason: 'profile-missing' } };
  }
  if (normalized.includes('workspace') && normalized.includes('validation failed')) {
    return { errorCode: 'WORKSPACE_RESTORE_BLOCKED', errorMessage: message, diagnostics: { reason: 'workspace-restore-blocked' } };
  }
  if (normalized.includes('snapshot') && normalized.includes('restore')) {
    return { errorCode: 'SNAPSHOT_RESTORE_FAILED', errorMessage: message, diagnostics: { reason: 'snapshot-restore-failed' } };
  }
  if (normalized.includes('trusted') && normalized.includes('snapshot')) {
    return { errorCode: 'SNAPSHOT_MISMATCH', errorMessage: message, diagnostics: { reason: 'trusted-snapshot-mismatch' } };
  }
  if (normalized.includes('lock')) {
    return { errorCode: 'RUNTIME_LOCK_EXISTS', errorMessage: message, diagnostics: { reason: 'runtime-lock' } };
  }
  if (normalized.includes('cancelled')) {
    return { errorCode: 'TASK_CANCELLED', errorMessage: message, diagnostics: { reason: 'cancelled' } };
  }
  if (normalized.includes('timeout')) {
    return { errorCode: 'TASK_TIMEOUT', errorMessage: message, diagnostics: { reason: 'timeout' } };
  }
  if (normalized.includes('proxy') && normalized.includes('cooldown')) {
    return { errorCode: 'LEASE_COOLDOWN', errorMessage: message, diagnostics: { reason: 'lease-cooldown' } };
  }
  if (normalized.includes('validation')) {
    return { errorCode: 'POLICY_BLOCK', errorMessage: message, diagnostics: { reason: 'validation-block' } };
  }

  return {
    errorCode: 'EXECUTION_ERROR',
    errorMessage: message,
    diagnostics: { reason: 'unknown' },
  };
}

const DEFAULT_TASK_TIMEOUT_MS = Math.max(5_000, Number(process.env.AGENT_TASK_TIMEOUT_MS || 120_000));
const ACK_MAX_RETRIES = Math.max(1, Number(process.env.AGENT_ACK_MAX_RETRIES || 3));
const DEFAULT_REQUEST_TIMEOUT_MS = Math.max(5_000, Number(process.env.AGENT_REQUEST_TIMEOUT_MS || 20_000));

function readErrorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    if ('code' in error && typeof error.code === 'string' && error.code.trim()) {
      return error.code.trim();
    }
    if ('cause' in error && error.cause && typeof error.cause === 'object' && 'code' in error.cause && typeof error.cause.code === 'string' && error.cause.code.trim()) {
      return error.cause.code.trim();
    }
  }
  return '';
}

function isRecoverableAgentNetworkFailure(input: { message: string; code?: string; status?: number | null }): boolean {
  return isRecoverableNetworkFailure(input);
}

class AgentRequestError extends Error {
  readonly status: number;
  readonly payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>, message: string) {
    super(message);
    this.name = 'AgentRequestError';
    this.status = status;
    this.payload = payload;
  }
}

export class AgentNetworkError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly path: string;
  readonly method: string;
  readonly recoverable = true;

  constructor(
    path: string,
    method: string,
    message: string,
    options: { code?: string; status?: number | null } = {}
  ) {
    super(message);
    this.name = 'AgentNetworkError';
    this.path = path;
    this.method = method;
    this.code = String(options.code || '').trim() || 'AGENT_NETWORK_ERROR';
    this.status = options.status ?? null;
  }
}

export class AgentService {
  private readonly apiBase: string;
  private readonly agentId: string;
  private registrationCode: string;
  private readonly agentVersion: string;
  private readonly capabilities: string[];
  private readonly getRuntimeStatus: () => Record<string, unknown>;
  private readonly getHostInfo: () => Record<string, unknown>;
  private readonly executeTask: (task: AgentTask) => Promise<TaskExecutionResult>;
  private readonly onStateChange?: (state: AgentServiceState) => void;
  private accessToken = '';
  private refreshToken = '';
  private stopped = false;
  private loopPromise: Promise<void> | null = null;
  private state: AgentServiceState;
  private backoffMs = 1000;
  private syncVersion = 0;
  private readonly taskTimeoutMs = DEFAULT_TASK_TIMEOUT_MS;

  constructor(options: AgentServiceOptions) {
    this.apiBase = options.apiBase.replace(/\/$/, '');
    this.agentId = options.agentId.trim();
    this.registrationCode = options.registrationCode.trim();
    this.agentVersion = options.agentVersion;
    this.capabilities = options.capabilities;
    this.getRuntimeStatus = options.getRuntimeStatus;
    this.getHostInfo = options.getHostInfo;
    this.executeTask = options.executeTask;
    this.onStateChange = options.onStateChange;
    this.state = {
      enabled: Boolean(this.apiBase && this.agentId && this.registrationCode),
      writable: false,
      connected: false,
      agentId: this.agentId,
      protocolVersion: '1',
      lastHeartbeatAt: null,
      lastError: '',
      consecutiveFailures: 0,
      lastTaskId: null,
      lastTaskStatus: null,
      lastTaskFinishedAt: null,
    };
  }

  private setState(next: Partial<AgentServiceState>) {
    this.state = { ...this.state, ...next };
    this.onStateChange?.(this.state);
  }

  getState() {
    return this.state;
  }

  getSyncVersion() {
    return this.syncVersion;
  }

  start() {
    if (!this.state.enabled || this.loopPromise) {
      return;
    }
    this.stopped = false;
    this.loopPromise = this.runLoop();
  }

  async stop() {
    this.stopped = true;
    this.setState({ connected: false, writable: false });
    await this.loopPromise;
    this.loopPromise = null;
  }

  private async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('Content-Type', 'application/json');
    headers.set('x-agent-protocol-version', '1');
    if (this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }
    const method = String(init.method || 'GET').toUpperCase();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('Request timeout')), DEFAULT_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.apiBase}${path}`, { ...init, headers, signal: controller.signal });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok || payload.success === false) {
        const message = String(payload.error || `${response.status} ${response.statusText}`).trim() || 'Agent request failed';
        if (response.status === 401) {
          throw new AgentRequestError(response.status, payload, message);
        }
        if (
          response.status >= 500 ||
          isRecoverableAgentNetworkFailure({ message, status: response.status })
        ) {
          throw new AgentNetworkError(path, method, message, { status: response.status, code: `HTTP_${response.status}` });
        }
        throw new AgentRequestError(response.status, payload, message);
      }
      return payload;
    } catch (error) {
      if (error instanceof AgentRequestError || error instanceof AgentNetworkError) {
        throw error;
      }
      const message = readErrorMessage(error).trim() || 'Agent request failed';
      const code = readErrorCode(error);
      if (isRecoverableAgentNetworkFailure({ message, code })) {
        throw new AgentNetworkError(path, method, message, { code });
      }
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  private markRecoverableNetworkFailure(error: AgentNetworkError) {
    this.setState({
      connected: false,
      writable: false,
      lastError: error.message,
      lastErrorCode: error.code,
      lastErrorKind: 'network',
      lastRecoverableFailureSource: 'request',
      lastRecoverableFailureAt: new Date().toISOString(),
      consecutiveFailures: this.state.consecutiveFailures + 1,
    });
  }

  handleGlobalRecoverableNetworkError(details: { message: string; code?: string }) {
    const nextTimestamp = new Date().toISOString();
    this.setState({
      connected: false,
      writable: false,
      lastError: details.message,
      lastErrorCode: String(details.code || '').trim(),
      lastErrorKind: 'network',
      lastRecoverableFailureSource: 'global-network',
      lastRecoverableFailureAt: nextTimestamp,
      consecutiveFailures: this.state.consecutiveFailures + 1,
    });
  }

  private markRecovered() {
    this.setState({
      connected: true,
      writable: true,
      lastHeartbeatAt: new Date().toISOString(),
      lastError: '',
      lastErrorCode: '',
      lastErrorKind: 'unknown',
      lastRecoverableFailureSource: 'unknown',
      lastRecoverableFailureAt: this.state.lastRecoverableFailureAt ?? null,
      consecutiveFailures: 0,
    });
  }

  private async refreshAccessToken() {
    const body = this.refreshToken
      ? {
          agentId: this.agentId,
          refreshToken: this.refreshToken,
        }
      : {
          agentId: this.agentId,
          registrationCode: this.registrationCode,
        };

    const payload = await this.request('/api/agent/v1/auth/token', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    this.accessToken = String(payload.accessToken || '');
    this.refreshToken = String(payload.refreshToken || '');
    if (!this.accessToken || !this.refreshToken) {
      throw new Error('Auth response missing tokens');
    }
    this.registrationCode = '';
  }

  private async sendHeartbeat() {
    await this.request('/api/agent/v1/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        agentId: this.agentId,
        agentVersion: this.agentVersion,
        capabilities: this.capabilities,
        hostInfo: this.getHostInfo(),
        runtimeStatus: this.getRuntimeStatus(),
        timestamp: new Date().toISOString(),
      }),
    });
    this.markRecovered();
  }

  private async ack(task: AgentTask, status: AgentTaskStatus, detail: Partial<TaskExecutionResult> = {}) {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= ACK_MAX_RETRIES; attempt += 1) {
      try {
        await this.request(`/api/agent/v1/tasks/${encodeURIComponent(task.taskId)}/ack`, {
          method: 'POST',
          body: JSON.stringify({
            taskId: task.taskId,
            status,
            idempotencyKey: detail.outputRef
              ? `${task.taskId}-${status}-${detail.outputRef}`
              : `${task.taskId}-${status}`,
            errorCode: detail.errorCode || '',
            errorMessage: detail.errorMessage || '',
            outputRef: detail.outputRef || '',
            diagnostics: sanitizeDiagnostics(detail.diagnostics) || undefined,
            startedAt: status === 'RUNNING' ? new Date().toISOString() : undefined,
            endedAt:
              status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED'
                ? new Date().toISOString()
                : undefined,
          }),
        });
        return;
      } catch (error) {
        lastError = error;
        if (attempt >= ACK_MAX_RETRIES) {
          break;
        }
        await sleep(Math.min(1200 * attempt, 5000));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('ACK failed');
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async pullAndRun() {
    const pullPayload = await this.request('/api/agent/v1/tasks/pull', {
      method: 'POST',
      body: JSON.stringify({ timeoutMs: 12000 }),
    });
    const task = (pullPayload.task || null) as AgentTask | null;
    if (!task) {
      return;
    }

    this.setState({
      lastTaskId: task.taskId,
      lastTaskStatus: 'RECEIVED',
      lastTaskFinishedAt: null,
    });
    await this.ack(task, 'RUNNING');
    try {
      const result = await this.withTimeout(
        this.executeTask(task),
        this.taskTimeoutMs,
        `Task execution timeout after ${this.taskTimeoutMs}ms`
      );
      await this.ack(task, result.status, result);
      this.setState({
        lastTaskId: task.taskId,
        lastTaskStatus: result.status,
        lastTaskFinishedAt: new Date().toISOString(),
      });
    } catch (error) {
      const failure = classifyExecutionFailure(error);
      await this.ack(task, 'FAILED', {
        errorCode: failure.errorCode,
        errorMessage: failure.errorMessage,
        diagnostics: failure.diagnostics,
      });
      this.setState({
        lastTaskId: task.taskId,
        lastTaskStatus: 'FAILED',
        lastTaskFinishedAt: new Date().toISOString(),
      });
    }
  }

  private async runLoop() {
    while (!this.stopped) {
      try {
        if (!this.accessToken) {
          await this.refreshAccessToken();
        }
        await this.sendHeartbeat();
        await this.pullAndRun();
        this.backoffMs = 1000;
      } catch (error) {
        const message = readErrorMessage(error);
        if (error instanceof AgentNetworkError) {
          this.markRecoverableNetworkFailure(error);
        } else {
          this.setState({
            connected: false,
            writable: false,
            lastError: message,
            lastErrorCode: readErrorCode(error),
            lastErrorKind:
              error instanceof AgentRequestError && error.status === 401
                ? 'auth'
                : 'unknown',
            lastRecoverableFailureSource: 'unknown',
            consecutiveFailures: this.state.consecutiveFailures + 1,
          });
        }
        if (
          (error instanceof AgentRequestError && error.status === 401) ||
          /refresh|token|unauthorized|401/i.test(message)
        ) {
          this.accessToken = '';
        }
        await sleep(this.backoffMs);
        this.backoffMs = Math.min(this.backoffMs * 2, 20000);
      }
    }
  }

  async pullConfigSnapshot() {
    if (!this.state.enabled) {
      return null;
    }
    if (!this.accessToken) {
      await this.refreshAccessToken();
    }
    let payload: Record<string, unknown>;
    try {
      payload = await this.request('/api/agent/v1/config/snapshot', {
        method: 'GET',
      });
    } catch (error) {
      if (error instanceof AgentNetworkError) {
        this.markRecoverableNetworkFailure(error);
      }
      throw error;
    }
    const snapshot = (payload.snapshot || null) as RemoteConfigSnapshot | null;
    if (snapshot) {
      this.syncVersion = Number(snapshot.syncVersion || 0);
    }
    return snapshot;
  }

  async pushConfigSnapshot(
    snapshot: Omit<RemoteConfigSnapshot, 'syncVersion'>,
    options: { mode?: PushMode } = {}
  ) {
    if (!this.state.enabled) {
      return null;
    }
    if (!this.accessToken) {
      await this.refreshAccessToken();
    }
    const submit = async () =>
      this.request('/api/agent/v1/config/push', {
        method: 'POST',
        body: JSON.stringify({
          mode: options.mode || 'replace',
          syncVersion: this.syncVersion,
          profiles: snapshot.profiles,
          proxies: snapshot.proxies,
          templates: snapshot.templates,
          cloudPhones: snapshot.cloudPhones,
          settings: snapshot.settings,
        }),
      });

    try {
      const payload = await submit();
      this.syncVersion = Number(payload.syncVersion || this.syncVersion);
      return this.syncVersion;
    } catch (error) {
      if (error instanceof AgentNetworkError) {
        this.markRecoverableNetworkFailure(error);
      }
      if (error instanceof AgentRequestError && error.status === 409) {
        const remote = (error.payload.snapshot || null) as { syncVersion?: unknown } | null;
        const remoteVersion = Number(remote?.syncVersion || 0);
        if (remoteVersion > 0) {
          this.syncVersion = remoteVersion;
          const payload = await submit();
          this.syncVersion = Number(payload.syncVersion || this.syncVersion);
          return this.syncVersion;
        }
      }
      throw error;
    }
  }
}
