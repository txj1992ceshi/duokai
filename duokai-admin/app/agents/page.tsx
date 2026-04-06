'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { adminFetch } from '@/lib/api-client';
import { readAdminAuth } from '@/lib/require-admin-client';
import AppButton from '@/components/AppButton';
import ErrorBanner from '@/components/ErrorBanner';
import SuccessBanner from '@/components/SuccessBanner';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';

type AgentStatus = 'ONLINE' | 'OFFLINE' | 'DISABLED';
type TaskStatus = 'PENDING' | 'RECEIVED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
type TaskType =
  | 'PROFILE_START'
  | 'PROFILE_STOP'
  | 'WORKSPACE_SNAPSHOT'
  | 'WORKSPACE_RESTORE'
  | 'PROFILE_VERIFY'
  | 'OPEN_PLATFORM';

type AgentItem = {
  agentId: string;
  name: string;
  status: AgentStatus;
  lastSeenAt?: string | null;
  pendingTasks: number;
  syncVersion?: number;
  lastConfigSyncedAt?: string | null;
  hostInfo?: Record<string, unknown> | null;
  runtimeSummary?: {
    runningProfileCount: number;
    queuedProfileCount: number;
    startingProfileCount: number;
    effectiveRuntimeMode?: string;
    supportedRuntimeModes?: string[];
    degraded: boolean;
    degradeReason?: string;
    lockState?: string;
  } | null;
  runtimeStatus?: {
    profileIsolationSummaries?: Array<{
      profileId: string;
      name: string;
      trustedSnapshotStatus: string;
      lastQuickIsolationCheckSuccess: boolean | null;
      lastQuickIsolationCheckAt?: string;
      activeRuntimeLockState: string;
      workspaceHealthStatus: string;
      workspaceConsistencyStatus: string;
      lastValidationLevel: string;
      lastValidationMessage?: string;
    }>;
    [key: string]: unknown;
  } | null;
};

type TaskItem = {
  taskId: string;
  agentId: string;
  type: TaskType;
  status: TaskStatus;
  createdAt?: string;
  errorCode?: string;
  errorMessage?: string;
  payload?: Record<string, unknown> | null;
  diagnostics?: Record<string, unknown> | null;
};

type TaskEventItem = {
  id: string;
  taskId: string;
  agentId: string;
  status: TaskStatus;
  createdAt?: string;
  detail?: unknown;
};

type FailureSummaryItem = {
  type: TaskType | string;
  errorCode: string;
  count: number;
  lastAt?: string | null;
};

type AgentHealthSummaryItem = {
  agentId: string;
  status: AgentStatus;
  lastSeenAt?: string | null;
  windowMinutes: number;
  finished: {
    total: number;
    succeeded: number;
    failed: number;
    cancelled: number;
    successRatePercent: number;
  };
  stuckRunning: number;
  lastTask?: {
    taskId: string;
    status: TaskStatus | string;
    updatedAt?: string | null;
    errorCode?: string;
    errorMessage?: string;
  } | null;
};

type ProxyUsageItem = {
  id: string;
  name: string;
  sharingMode: string;
  maxProfilesPerIp: number;
  maxConcurrentRunsPerIp: number;
  boundProfilesCount: number;
  activeLeasesCount: number;
  runningProfilesCount: number;
  affectedProfiles?: Array<{
    profileId: string;
    name: string;
  }>;
};

type MetricsData = {
  windowMinutes: number;
  runningTimeoutMinutes: number;
  heartbeat: {
    totalAgents: number;
    activeAgents: number;
    activeRatePercent: number;
  };
  tasks: {
    totalFinishedInWindow: number;
    succeeded: number;
    failed: number;
    cancelled: number;
    successRatePercent: number;
    stuckRunning: number;
  };
};

type BatchActionLogItem = {
  id: string;
  adminUserId: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  detail?: unknown;
  createdAt?: string | null;
};
type BatchActionFilter = 'all' | 'agent.task.batch_create' | 'agent.revoke.batch' | 'agent.task.cancel_stuck';
type BatchActionTimeRange = '1h' | '24h' | '7d' | 'all';

const BATCH_ACTION_FILTER_OPTIONS: BatchActionFilter[] = [
  'all',
  'agent.task.batch_create',
  'agent.revoke.batch',
  'agent.task.cancel_stuck',
];
const BATCH_ACTION_TIME_RANGE_OPTIONS: BatchActionTimeRange[] = ['1h', '24h', '7d', 'all'];

function parseBatchActionFilter(value: string | null): BatchActionFilter {
  return BATCH_ACTION_FILTER_OPTIONS.includes(value as BatchActionFilter)
    ? (value as BatchActionFilter)
    : 'all';
}

function parseBatchActionTimeRange(value: string | null): BatchActionTimeRange {
  return BATCH_ACTION_TIME_RANGE_OPTIONS.includes(value as BatchActionTimeRange)
    ? (value as BatchActionTimeRange)
    : '24h';
}

const taskTypes: TaskType[] = [
  'PROFILE_START',
  'PROFILE_STOP',
  'WORKSPACE_SNAPSHOT',
  'WORKSPACE_RESTORE',
  'PROFILE_VERIFY',
  'OPEN_PLATFORM',
];

function AgentsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialBatchActionFilter = parseBatchActionFilter(searchParams.get('action'));
  const initialBatchActionTimeRange = parseBatchActionTimeRange(searchParams.get('range'));
  const initialBatchActionAdminEmail = String(searchParams.get('adminEmail') || '').trim().toLowerCase();
  const initialRiskOnly = searchParams.get('riskOnly') === '1';
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newAgentName, setNewAgentName] = useState('');
  const [taskAgentId, setTaskAgentId] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('PROFILE_START');
  const [taskPayload, setTaskPayload] = useState('{\n  "profileId": ""\n}');
  const [taskEvents, setTaskEvents] = useState<TaskEventItem[]>([]);
  const [taskEventFilterTaskId, setTaskEventFilterTaskId] = useState('');
  const [failureSummary, setFailureSummary] = useState<FailureSummaryItem[]>([]);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [healthSummary, setHealthSummary] = useState<AgentHealthSummaryItem[]>([]);
  const [proxyUsage, setProxyUsage] = useState<ProxyUsageItem[]>([]);
  const [riskOnly, setRiskOnly] = useState(initialRiskOnly);
  const [recentBatchActions, setRecentBatchActions] = useState<BatchActionLogItem[]>([]);
  const [batchActionFilter, setBatchActionFilter] = useState<BatchActionFilter>(initialBatchActionFilter);
  const [batchActionTimeRange, setBatchActionTimeRange] = useState<BatchActionTimeRange>(initialBatchActionTimeRange);
  const [batchActionAdminEmailInput, setBatchActionAdminEmailInput] = useState(initialBatchActionAdminEmail);
  const [batchActionAdminEmail, setBatchActionAdminEmail] = useState(initialBatchActionAdminEmail);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  function renderEventDetail(detail: unknown): string {
    if (!detail || typeof detail !== 'object') return '-';
    try {
      const text = JSON.stringify(detail);
      return text.length > 120 ? `${text.slice(0, 120)}...` : text;
    } catch {
      return '[unserializable]';
    }
  }

  function renderTaskDiagnostics(task: TaskItem): string {
    const chunks: string[] = [];
    if (task.errorCode) {
      chunks.push(task.errorCode);
    }
    if (task.payload && typeof task.payload === 'object') {
      const ipUsageMode = String(task.payload.ipUsageMode || '').trim();
      const proxySharingMode = String(task.payload.proxySharingMode || '').trim();
      const leaseValidationCode = String(
        (task.payload.leaseValidation as Record<string, unknown> | undefined)?.code || '',
      ).trim();
      if (ipUsageMode) chunks.push(`ipUsage=${ipUsageMode}`);
      if (proxySharingMode) chunks.push(`sharing=${proxySharingMode}`);
      if (leaseValidationCode) chunks.push(`lease=${leaseValidationCode}`);
    }
    if (task.diagnostics && typeof task.diagnostics === 'object') {
      const action = String(task.diagnostics.action || '').trim();
      const level = String(task.diagnostics.level || '').trim();
      const reason = String(task.diagnostics.reason || '').trim();
      const snapshotId = String(task.diagnostics.snapshotId || '').trim();
      const targetUrl = String(task.diagnostics.targetUrl || '').trim();
      if (action) chunks.push(`action=${action}`);
      if (level) chunks.push(`level=${level}`);
      if (reason) chunks.push(`reason=${reason}`);
      if (snapshotId) chunks.push(`snapshot=${snapshotId}`);
      if (targetUrl) chunks.push(`url=${targetUrl}`);
    }
    if (!chunks.length) {
      return '-';
    }
    const text = chunks.join(' | ');
    return text.length > 160 ? `${text.slice(0, 160)}...` : text;
  }

  function renderAgentIsolationSummary(agent: AgentItem): string {
    const summaries = Array.isArray(agent.runtimeStatus?.profileIsolationSummaries)
      ? agent.runtimeStatus?.profileIsolationSummaries
      : [];
    if (!summaries?.length) {
      return '-';
    }

    const risky = summaries.filter((item) => {
      const trusted = String(item.trustedSnapshotStatus || '').toLowerCase();
      const lockState = String(item.activeRuntimeLockState || '').toLowerCase();
      const health = String(item.workspaceHealthStatus || '').toLowerCase();
      const consistency = String(item.workspaceConsistencyStatus || '').toLowerCase();
      const quickFailed = item.lastQuickIsolationCheckSuccess === false;
      return (
        trusted === 'invalid' ||
        trusted === 'stale' ||
        lockState === 'stale-lock' ||
        health === 'broken' ||
        consistency === 'block' ||
        quickFailed
      );
    });

    const targets = (risky.length > 0 ? risky : summaries).slice(0, 3);
    const rendered = targets.map((item) => {
      const flags: string[] = [];
      if (item.trustedSnapshotStatus) flags.push(`trust=${item.trustedSnapshotStatus}`);
      if (item.activeRuntimeLockState && item.activeRuntimeLockState !== 'unlocked') {
        flags.push(`lock=${item.activeRuntimeLockState}`);
      }
      if (item.lastQuickIsolationCheckSuccess === false) flags.push('quick=failed');
      if (item.workspaceConsistencyStatus === 'block') flags.push('consistency=block');
      else if (item.workspaceConsistencyStatus === 'warn') flags.push('consistency=warn');
      if (item.workspaceHealthStatus === 'broken') flags.push('health=broken');
      else if (item.workspaceHealthStatus === 'warning') flags.push('health=warning');
      return `${item.name || item.profileId}: ${flags.join(', ') || 'healthy'}`;
    });

    const extra = risky.length > targets.length ? ` +${risky.length - targets.length}` : '';
    return `${rendered.join(' | ')}${extra}`;
  }

  function prefillTaskComposer(
    agentId: string,
    type: TaskType,
    payload: Record<string, unknown>,
    successMessage: string,
  ): void {
    setTaskAgentId(agentId);
    setTaskType(type);
    setTaskPayload(JSON.stringify(payload, null, 2));
    setSuccess(successMessage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function buildTaskSuggestedPreset(task: TaskItem):
    | { label: string; type: TaskType; payload: Record<string, unknown> }
    | null {
    const profileId = String(task.payload?.profileId || task.diagnostics?.profileId || '').trim();
    const snapshotId = String(task.payload?.snapshotId || task.diagnostics?.snapshotId || '').trim();
    const targetUrl = String(task.payload?.targetUrl || task.diagnostics?.targetUrl || '').trim();
    const errorCode = String(task.errorCode || '').trim().toUpperCase();

    if (!profileId) {
      return null;
    }
    if (errorCode === 'POLICY_BLOCK') {
      return {
        label: '填充 Verify',
        type: 'PROFILE_VERIFY',
        payload: { profileId },
      };
    }
    if (errorCode === 'RUNTIME_LOCK_EXISTS') {
      return {
        label: '填充 Stop',
        type: 'PROFILE_STOP',
        payload: { profileId },
      };
    }
    if (
      (errorCode === 'SNAPSHOT_MISMATCH' ||
        errorCode === 'SNAPSHOT_RESTORE_FAILED' ||
        errorCode === 'WORKSPACE_RESTORE_BLOCKED') &&
      snapshotId
    ) {
      return {
        label: '填充 Restore',
        type: 'WORKSPACE_RESTORE',
        payload: { profileId, snapshotId },
      };
    }
    if (errorCode === 'TASK_TIMEOUT' || errorCode === 'EXECUTION_ERROR') {
      return {
        label: '填充重试',
        type: task.type,
        payload: {
          ...(profileId ? { profileId } : {}),
          ...(snapshotId ? { snapshotId } : {}),
          ...(targetUrl ? { targetUrl } : {}),
        },
      };
    }
    return null;
  }

  function getSuggestedAction(errorCode: string, diagnostics?: Record<string, unknown> | null): string {
    const code = String(errorCode || '').trim().toUpperCase();
    const reason = String(diagnostics?.reason || '').trim().toLowerCase();
    if (!code) return '-';

    if (code === 'RUNTIME_LOCK_EXISTS') {
      return '检查目标设备是否仍在运行；若已异常退出，先清理 stale lock 后再重试启动。';
    }
    if (code === 'LEASE_COOLDOWN') {
      return '等待 IP 冷却结束，或为该 Profile 重新分配 dedicated IP。';
    }
    if (code === 'PROXY_ASSET_COOLDOWN') {
      return '代理资产仍在冷却中，等待 cooldown 结束或切换新的可用 proxy asset。';
    }
    if (code === 'IP_USAGE_MODE_NOT_ALLOWED') {
      return '当前平台/用途策略不允许所选 IP 使用模式，请调整为 dedicated 或修改策略。';
    }
    if (code === 'PROXY_SHARING_UNSUPPORTED') {
      return '当前 proxy asset 不支持 shared 模式，请更换支持 shared/hybrid 的资产或切回 dedicated。';
    }
    if (code === 'DEDICATED_IP_CONFLICT') {
      return '当前 IP 已被其他受保护环境占用，请释放原租约或分配新的 dedicated IP。';
    }
    if (code === 'SHARED_IP_PROFILE_LIMIT' || code === 'SHARED_IP_CONCURRENT_LIMIT') {
      return '当前 shared IP 已达到平台或资产上限，请切换新 IP、释放占用，或降低并发运行数。';
    }
    if (code === 'POLICY_BLOCK') {
      if (reason.includes('validation')) {
        return '先执行 Verify，修复环境一致性或策略冲突后再启动。';
      }
      return '检查 profile 策略、workspace 状态和代理一致性，修复后再重试。';
    }
    if (code === 'SNAPSHOT_MISMATCH') {
      return '优先恢复 last-known-good snapshot，再重新验证并启动。';
    }
    if (code === 'SNAPSHOT_RESTORE_FAILED' || code === 'WORKSPACE_RESTORE_BLOCKED') {
      return '检查 snapshot 是否损坏或与当前 workspace 不兼容，必要时回滚到更早恢复点。';
    }
    if (code === 'PROFILE_NOT_FOUND') {
      return '确认控制面与本机配置已同步，必要时重新拉取 profile 清单。';
    }
    if (code === 'TASK_TIMEOUT') {
      return '检查本机桌面端是否卡住、代理是否超时，必要时停止残留 runtime 后重试。';
    }
    if (code === 'TASK_CANCELLED') {
      return '确认是否为人工取消；若不是，请检查重复任务或调度冲突。';
    }
    if (code === 'EXECUTION_ERROR') {
      return '查看任务事件 Detail 和本机 runtime 日志，定位具体执行异常。';
    }
    return '查看任务事件 Detail 与设备状态，再决定是重试、恢复 snapshot 还是更换代理/IP。';
  }

  function renderSuggestedAction(task: TaskItem): string {
    return getSuggestedAction(task.errorCode || '', task.diagnostics || null);
  }

  function renderFailureSuggestedAction(item: FailureSummaryItem): string {
    return getSuggestedAction(item.errorCode);
  }

  function buildTaskDebugContext(task: TaskItem): string {
    const relatedEvents = taskEvents.filter((item) => item.taskId === task.taskId).slice(0, 8);
    const lines = [
      `Task ID: ${task.taskId}`,
      `Agent ID: ${task.agentId}`,
      `Type: ${task.type}`,
      `Status: ${task.status}`,
      `Error Code: ${task.errorCode || '-'}`,
      `Error Message: ${task.errorMessage || '-'}`,
      `Suggested Action: ${renderSuggestedAction(task)}`,
      `Payload: ${JSON.stringify(task.payload || {}, null, 2)}`,
      `Diagnostics: ${JSON.stringify(task.diagnostics || {}, null, 2)}`,
      'Recent Events:',
      ...(relatedEvents.length
        ? relatedEvents.map(
            (item) =>
              `- ${item.createdAt || '-'} | ${item.status} | ${JSON.stringify(item.detail || {}, null, 0)}`,
          )
        : ['- No related task events loaded in current view']),
    ];
    return lines.join('\n');
  }

  async function handleCopyTaskDebugContext(task: TaskItem): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildTaskDebugContext(task));
      setSuccess(`已复制任务排障上下文：${task.taskId}`);
    } catch {
      setError('复制任务排障上下文失败');
    }
  }

  async function handleFocusTaskEvents(taskId: string): Promise<void> {
    setError('');
    try {
      const res = await adminFetch(`/api/admin/agents/tasks/events?taskId=${encodeURIComponent(taskId)}&limit=80`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '加载任务事件失败');
      }
      setTaskEvents(Array.isArray(data.events) ? data.events : []);
      setTaskEventFilterTaskId(taskId);
      setSuccess(`已聚焦任务事件：${taskId}`);
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载任务事件失败');
    }
  }

  async function handleClearTaskEventFocus(): Promise<void> {
    setError('');
    try {
      const res = await adminFetch('/api/admin/agents/tasks/events?limit=80');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '加载任务事件失败');
      }
      setTaskEvents(Array.isArray(data.events) ? data.events : []);
      setTaskEventFilterTaskId('');
      setSuccess('已恢复显示最近任务事件');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载任务事件失败');
    }
  }

  function renderBatchActionDetail(detail: unknown): string {
    if (!detail || typeof detail !== 'object') return '-';
    try {
      const text = JSON.stringify(detail);
      return text.length > 140 ? `${text.slice(0, 140)}...` : text;
    } catch {
      return '[unserializable]';
    }
  }

  const loadAll = useCallback(async () => {
    if (!authChecked) return;
    setError('');
    setLoading(true);
    try {
      const rangeHoursParam =
        batchActionTimeRange === '1h'
          ? '1'
          : batchActionTimeRange === '24h'
            ? '24'
            : batchActionTimeRange === '7d'
              ? '168'
              : '0';
      const adminEmailParam = batchActionAdminEmail.trim().toLowerCase();
      const actionsParams = new URLSearchParams({
        limit: '120',
        rangeHours: rangeHoursParam,
      });
      if (adminEmailParam) {
        actionsParams.set('adminEmail', adminEmailParam);
      }
      if (batchActionFilter !== 'all') {
        actionsParams.set('action', batchActionFilter);
      }
      const actionsUrl = `/api/admin/agents/actions/recent?${actionsParams.toString()}`;
      const [agentsRes, tasksRes, eventsRes, failuresRes, metricsRes, healthRes, actionsRes, proxyUsageRes] = await Promise.all([
        adminFetch('/api/admin/agents'),
        adminFetch('/api/admin/agents/tasks?limit=50'),
        adminFetch('/api/admin/agents/tasks/events?limit=80'),
        adminFetch('/api/admin/agents/tasks/failures-summary'),
        adminFetch('/api/admin/agents/metrics?windowMinutes=60&runningTimeoutMinutes=10'),
        adminFetch('/api/admin/agents/health-summary?windowMinutes=60&runningTimeoutMinutes=10'),
        adminFetch(actionsUrl),
        adminFetch('/api/admin/agents/proxy-usage'),
      ]);
      const agentsData = await agentsRes.json();
      const tasksData = await tasksRes.json();
      const eventsData = await eventsRes.json();
      const failuresData = await failuresRes.json();
      const metricsData = await metricsRes.json();
      const healthData = await healthRes.json();
      const actionsData = await actionsRes.json();
      const proxyUsageData = await proxyUsageRes.json();

      if (!agentsRes.ok || !agentsData.success) {
        throw new Error(agentsData.error || '加载 Agent 列表失败');
      }
      if (!tasksRes.ok || !tasksData.success) {
        throw new Error(tasksData.error || '加载任务列表失败');
      }
      if (!eventsRes.ok || !eventsData.success) {
        throw new Error(eventsData.error || '加载任务事件失败');
      }
      if (!failuresRes.ok || !failuresData.success) {
        throw new Error(failuresData.error || '加载失败聚合失败');
      }
      if (!metricsRes.ok || !metricsData.success) {
        throw new Error(metricsData.error || '加载灰度指标失败');
      }
      if (!healthRes.ok || !healthData.success) {
        throw new Error(healthData.error || '加载设备健康摘要失败');
      }
      if (!actionsRes.ok || !actionsData.success) {
        throw new Error(actionsData.error || '加载批量操作日志失败');
      }
      if (!proxyUsageRes.ok || !proxyUsageData.success) {
        throw new Error(proxyUsageData.error || '加载代理占用视图失败');
      }

      setAgents(Array.isArray(agentsData.agents) ? agentsData.agents : []);
      setTasks(Array.isArray(tasksData.tasks) ? tasksData.tasks : []);
      setTaskEvents(Array.isArray(eventsData.events) ? eventsData.events : []);
      setFailureSummary(Array.isArray(failuresData.failures) ? failuresData.failures : []);
      setMetrics(metricsData.metrics || null);
      setHealthSummary(Array.isArray(healthData.agents) ? healthData.agents : []);
      setRecentBatchActions(Array.isArray(actionsData.actions) ? actionsData.actions : []);
      setProxyUsage(Array.isArray(proxyUsageData.proxyAssets) ? proxyUsageData.proxyAssets : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [authChecked, batchActionAdminEmail, batchActionFilter, batchActionTimeRange]);

  useEffect(() => {
    const auth = readAdminAuth();
    if (!auth.ok) {
      router.replace('/login');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    void loadAll();
    if (!autoRefreshEnabled) return;
    const timer = setInterval(() => {
      void loadAll();
    }, 5000);
    return () => clearInterval(timer);
  }, [authChecked, autoRefreshEnabled, loadAll]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(''), 2400);
    return () => window.clearTimeout(timer);
  }, [success]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBatchActionAdminEmail(batchActionAdminEmailInput.trim().toLowerCase());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [batchActionAdminEmailInput]);
  useEffect(() => {
    const nextFilter = parseBatchActionFilter(searchParams.get('action'));
    const nextRange = parseBatchActionTimeRange(searchParams.get('range'));
    const nextAdminEmail = String(searchParams.get('adminEmail') || '').trim().toLowerCase();
    const nextRiskOnly = searchParams.get('riskOnly') === '1';
    if (nextFilter !== batchActionFilter) setBatchActionFilter(nextFilter);
    if (nextRange !== batchActionTimeRange) setBatchActionTimeRange(nextRange);
    if (nextAdminEmail !== batchActionAdminEmail) setBatchActionAdminEmail(nextAdminEmail);
    if (nextAdminEmail !== batchActionAdminEmailInput) setBatchActionAdminEmailInput(nextAdminEmail);
    if (nextRiskOnly !== riskOnly) setRiskOnly(nextRiskOnly);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!authChecked) return;
    const params = new URLSearchParams(searchParams.toString());
    if (batchActionFilter === 'all') params.delete('action');
    else params.set('action', batchActionFilter);
    if (batchActionTimeRange === '24h') params.delete('range');
    else params.set('range', batchActionTimeRange);
    if (batchActionAdminEmail) params.set('adminEmail', batchActionAdminEmail);
    else params.delete('adminEmail');
    if (riskOnly) params.set('riskOnly', '1');
    else params.delete('riskOnly');

    const next = params.toString();
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [
    authChecked,
    batchActionAdminEmail,
    batchActionFilter,
    batchActionTimeRange,
    pathname,
    riskOnly,
    router,
    searchParams,
  ]);

  const onlineCount = useMemo(() => agents.filter((item) => item.status === 'ONLINE').length, [agents]);
  const healthMap = useMemo(() => {
    const map = new Map<string, AgentHealthSummaryItem>();
    for (const item of healthSummary) {
      map.set(item.agentId, item);
    }
    return map;
  }, [healthSummary]);
  const riskyAgentCount = useMemo(
    () =>
      healthSummary.filter(
        (item) =>
          item.stuckRunning > 0 ||
          (item.finished.total > 0 && item.finished.successRatePercent < 95)
      ).length,
    [healthSummary]
  );
  const riskyAgentIds = useMemo(
    () =>
      healthSummary
        .filter(
          (item) =>
            item.status !== 'DISABLED' &&
            (item.stuckRunning > 0 ||
              (item.finished.total > 0 && item.finished.successRatePercent < 95))
        )
        .map((item) => item.agentId),
    [healthSummary]
  );
  const displayedAgents = useMemo(() => {
    if (!riskOnly) return agents;
    const riskySet = new Set(riskyAgentIds);
    return agents.filter((item) => riskySet.has(item.agentId));
  }, [agents, riskOnly, riskyAgentIds]);
  const displayedBatchActions = useMemo(() => recentBatchActions, [recentBatchActions]);
  const estimatedStuckTaskCount = useMemo(() => {
    if (!healthSummary.length) return 0;
    const targetSet = riskOnly ? new Set(riskyAgentIds) : null;
    return healthSummary.reduce((total, item) => {
      if (targetSet && !targetSet.has(item.agentId)) return total;
      return total + Number(item.stuckRunning || 0);
    }, 0);
  }, [healthSummary, riskOnly, riskyAgentIds]);
  const slo = useMemo(() => {
    if (!metrics) return null;
    const heartbeatPass =
      metrics.heartbeat.totalAgents === 0 ? true : metrics.heartbeat.activeRatePercent >= 99;
    const taskPass =
      metrics.tasks.totalFinishedInWindow === 0 ? true : metrics.tasks.successRatePercent >= 95;
    const stuckPass = metrics.tasks.stuckRunning === 0;
    return {
      heartbeatPass,
      taskPass,
      stuckPass,
      allPass: heartbeatPass && taskPass && stuckPass,
    };
  }, [metrics]);

  async function handleRegisterAgent() {
    setError('');
    try {
      const res = await adminFetch('/api/admin/agents/register', {
        method: 'POST',
        body: JSON.stringify({ name: newAgentName.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '注册失败');
      }
      const code = String(data.registrationCode || '');
      window.alert(`Agent 已创建。\nagentId: ${data.agent?.agentId}\nregistrationCode: ${code}`);
      setSuccess(`已创建 Agent：${data.agent?.agentId || '-'}`);
      setNewAgentName('');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '注册失败');
    }
  }

  async function handleRevoke(agentId: string) {
    setError('');
    try {
      const res = await adminFetch(`/api/admin/agents/${encodeURIComponent(agentId)}/revoke`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '吊销失败');
      }
      setSuccess(`已吊销 Agent：${agentId}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '吊销失败');
    }
  }

  async function handleCreateTask() {
    setError('');
    try {
      const payload = taskPayload.trim() ? JSON.parse(taskPayload) : {};
      const res = await adminFetch('/api/admin/agents/tasks', {
        method: 'POST',
        body: JSON.stringify({
          agentId: taskAgentId.trim(),
          type: taskType,
          payload,
          idempotencyKey: `${taskAgentId.trim()}-${taskType}-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '下发任务失败');
      }
      setSuccess(`任务已下发：${data?.task?.taskId || ''}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '下发任务失败');
    }
  }

  async function handleCancel(taskId: string) {
    setError('');
    try {
      const res = await adminFetch(`/api/admin/agents/tasks/${encodeURIComponent(taskId)}/cancel`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '取消任务失败');
      }
      setSuccess(`已取消任务：${taskId}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '取消任务失败');
    }
  }

  async function handleBatchRiskSyncPull() {
    setError('');
    if (!riskyAgentIds.length) {
      setSuccess('当前无风险 Agent，无需批量拉取。');
      return;
    }
    try {
      const res = await adminFetch('/api/admin/agents/tasks/batch', {
        method: 'POST',
        body: JSON.stringify({
          agentIds: riskyAgentIds,
          type: 'SETTINGS_SYNC',
          payload: { action: 'pull_snapshot' },
          idempotencyKeyPrefix: `risk-pull-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '批量下发失败');
      }
      const createdCount = Number(data?.result?.created?.length || 0);
      const skippedCount = Number(data?.result?.skipped?.length || 0);
      setSuccess(`批量拉取已下发：创建 ${createdCount}，跳过 ${skippedCount}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '批量下发失败');
    }
  }

  async function handleBatchRevokeRiskAgents() {
    setError('');
    if (!riskyAgentIds.length) {
      setSuccess('当前无风险 Agent，无需批量吊销。');
      return;
    }
    const confirmed = window.confirm(
      `确认批量吊销风险 Agent 吗？\n预计影响设备数：${riskyAgentIds.length}\n吊销后设备将无法继续拉取任务。`
    );
    if (!confirmed) {
      return;
    }
    try {
      const res = await adminFetch('/api/admin/agents/revoke/batch', {
        method: 'POST',
        body: JSON.stringify({ agentIds: riskyAgentIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '批量吊销失败');
      }
      const revokedCount = Array.isArray(data?.result?.revoked) ? data.result.revoked.length : 0;
      const skippedCount = Array.isArray(data?.result?.skipped) ? data.result.skipped.length : 0;
      setSuccess(`批量吊销完成：吊销 ${revokedCount}，跳过 ${skippedCount}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '批量吊销失败');
    }
  }

  async function handleBatchCancelStuckTasks() {
    setError('');
    const targetAgentCount = riskOnly ? riskyAgentIds.length : healthSummary.length;
    const confirmed = window.confirm(
      `确认批量取消卡住任务吗？\n目标设备数：${targetAgentCount}\n预计取消任务数：${estimatedStuckTaskCount}\n超时阈值：RUNNING 超过 10 分钟。`
    );
    if (!confirmed) {
      return;
    }
    try {
      const targetAgentIds = riskOnly ? riskyAgentIds : [];
      const res = await adminFetch('/api/admin/agents/tasks/cancel-stuck', {
        method: 'POST',
        body: JSON.stringify({
          runningTimeoutMinutes: 10,
          agentIds: targetAgentIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '批量取消卡住任务失败');
      }
      const cancelledCount = Array.isArray(data?.result?.cancelled) ? data.result.cancelled.length : 0;
      setSuccess(`批量取消卡住任务完成：取消 ${cancelledCount} 个任务`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '批量取消卡住任务失败');
    }
  }

  function handleExportBatchActionsJson() {
    const rows = displayedBatchActions;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `agent-batch-actions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSuccess(`已导出 ${rows.length} 条批量操作记录`);
  }

  function handleResetBatchActionFilters() {
    setBatchActionFilter('all');
    setBatchActionTimeRange('24h');
    setBatchActionAdminEmailInput('');
    setBatchActionAdminEmail('');
    setSuccess('批量操作筛选已重置');
  }

  async function handleCopyCurrentFilterLink() {
    try {
      const href = window.location.href;
      await navigator.clipboard.writeText(href);
      setSuccess('已复制当前筛选链接');
    } catch {
      setError('复制链接失败，请手动复制地址栏');
    }
  }

  async function handleCopyFilterQueryOnly() {
    try {
      const query = window.location.search || '';
      await navigator.clipboard.writeText(query || '?');
      setSuccess('已复制筛选参数串');
    } catch {
      setError('复制参数串失败，请手动复制地址栏参数');
    }
  }

  if (!authChecked) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent 管控"
        description="设备注册、任务下发、状态追踪"
        aside={
          <div className="flex flex-wrap gap-2">
            <AppButton
              onClick={() => setRiskOnly((value) => !value)}
              variant="secondary"
            >
              {riskOnly ? '显示全部 Agent' : '仅看风险 Agent'}
            </AppButton>
            <AppButton
              onClick={handleBatchRiskSyncPull}
              variant="secondary"
              disabled={loading || riskyAgentIds.length === 0}
            >
              风险 Agent 批量拉取配置 ({riskyAgentIds.length})
            </AppButton>
            <AppButton
              onClick={handleBatchRevokeRiskAgents}
              variant="secondary"
              disabled={loading || riskyAgentIds.length === 0}
            >
              风险 Agent 批量吊销 ({riskyAgentIds.length})
            </AppButton>
            <AppButton
              onClick={handleBatchCancelStuckTasks}
              variant="secondary"
              disabled={loading}
            >
              批量取消卡住任务 ({estimatedStuckTaskCount})
            </AppButton>
            <AppButton
              onClick={() => setAutoRefreshEnabled((value) => !value)}
              variant="secondary"
            >
              {autoRefreshEnabled ? '自动刷新: 开' : '自动刷新: 关'}
            </AppButton>
            <AppButton onClick={loadAll} variant="secondary">
              立即刷新
            </AppButton>
          </div>
        }
      />

      <ErrorBanner message={error} />
      {!error ? <SuccessBanner message={success} /> : null}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <StatCard label="Agent 总数" value={agents.length} />
        <StatCard label="在线 Agent" value={onlineCount} accentClassName="text-green-400" />
        <StatCard label="任务总数(当前页)" value={tasks.length} />
        <StatCard label="待执行任务" value={tasks.filter((item) => item.status === 'PENDING').length} />
        <StatCard
          label="风险 Agent"
          value={riskyAgentCount}
          accentClassName={riskyAgentCount === 0 ? 'text-green-400' : 'text-amber-300'}
        />
        <StatCard
          label="最近1h任务成功率"
          value={metrics ? `${metrics.tasks.successRatePercent}%` : '-'}
          accentClassName={metrics && metrics.tasks.successRatePercent >= 95 ? 'text-green-400' : 'text-amber-300'}
        />
        <StatCard
          label="RUNNING超10分钟"
          value={metrics ? metrics.tasks.stuckRunning : '-'}
          accentClassName={metrics && metrics.tasks.stuckRunning === 0 ? 'text-green-400' : 'text-rose-300'}
        />
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-300">
        {metrics ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              心跳活跃率（2分钟窗口）: <span className="text-neutral-100">{metrics.heartbeat.activeRatePercent}%</span>{' '}
              ({metrics.heartbeat.activeAgents}/{metrics.heartbeat.totalAgents})
            </div>
            <div>
              最近 {metrics.windowMinutes} 分钟完成任务: <span className="text-neutral-100">{metrics.tasks.totalFinishedInWindow}</span>
              ，成功 {metrics.tasks.succeeded}，失败 {metrics.tasks.failed}，取消 {metrics.tasks.cancelled}
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  slo?.allPass ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                灰度总状态: {slo?.allPass ? 'PASS' : 'WARN'}
              </span>
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  slo?.heartbeatPass ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                心跳≥99%: {slo?.heartbeatPass ? 'PASS' : 'WARN'}
              </span>
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  slo?.taskPass ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                成功率≥95%: {slo?.taskPass ? 'PASS' : 'WARN'}
              </span>
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  slo?.stuckPass ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                无卡死RUNNING: {slo?.stuckPass ? 'PASS' : 'WARN'}
              </span>
            </div>
          </div>
        ) : (
          <div>灰度指标加载中...</div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
          <h2 className="text-sm font-semibold">注册 Agent</h2>
          <input
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            placeholder="可选：设备名称"
            value={newAgentName}
            onChange={(event) => setNewAgentName(event.target.value)}
          />
          <AppButton onClick={handleRegisterAgent} disabled={loading}>
            创建并生成注册码
          </AppButton>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
          <h2 className="text-sm font-semibold">下发任务</h2>
          <input
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            placeholder="agentId"
            value={taskAgentId}
            onChange={(event) => setTaskAgentId(event.target.value)}
          />
          <select
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            value={taskType}
            onChange={(event) => setTaskType(event.target.value as TaskType)}
          >
            {taskTypes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <textarea
            className="h-28 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs"
            value={taskPayload}
            onChange={(event) => setTaskPayload(event.target.value)}
          />
          <AppButton onClick={handleCreateTask} disabled={loading || !taskAgentId.trim()}>
            下发任务
          </AppButton>
        </section>
      </div>

      <DataTable>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400">批量动作筛选</span>
            <select
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
              value={batchActionFilter}
              onChange={(event) => setBatchActionFilter(event.target.value as BatchActionFilter)}
            >
              <option value="all">全部</option>
              <option value="agent.task.batch_create">批量下发任务</option>
              <option value="agent.revoke.batch">批量吊销设备</option>
              <option value="agent.task.cancel_stuck">批量取消卡住任务</option>
            </select>
            <select
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
              value={batchActionTimeRange}
              onChange={(event) => setBatchActionTimeRange(event.target.value as BatchActionTimeRange)}
            >
              <option value="1h">近1小时</option>
              <option value="24h">近24小时</option>
              <option value="7d">近7天</option>
              <option value="all">全部</option>
            </select>
            <input
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
              placeholder="按操作人邮箱筛选"
              value={batchActionAdminEmailInput}
              onChange={(event) => setBatchActionAdminEmailInput(event.target.value)}
            />
          </div>
          <AppButton variant="secondary" onClick={handleExportBatchActionsJson} disabled={!displayedBatchActions.length}>
            导出 JSON ({displayedBatchActions.length})
          </AppButton>
          <AppButton variant="secondary" onClick={handleCopyCurrentFilterLink}>
            复制筛选链接
          </AppButton>
          <AppButton variant="secondary" onClick={handleCopyFilterQueryOnly}>
            复制参数串
          </AppButton>
          <AppButton variant="secondary" onClick={handleResetBatchActionFilters}>
            重置筛选
          </AppButton>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-800/60 text-neutral-300">
              <tr>
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">运行模式/锁</th>
                <th className="px-4 py-3 text-left">隔离信号</th>
                <th className="px-4 py-3 text-left">最近心跳</th>
                <th className="px-4 py-3 text-left">最近1h成功率</th>
                <th className="px-4 py-3 text-left">卡住RUNNING</th>
                <th className="px-4 py-3 text-left">最近任务</th>
                <th className="px-4 py-3 text-left">配置版本</th>
                <th className="px-4 py-3 text-left">最近配置同步</th>
                <th className="px-4 py-3 text-left">待执行</th>
                <th className="px-4 py-3 text-left">操作</th>
              </tr>
          </thead>
          <tbody>
            {displayedAgents.length ? (
              displayedAgents.map((item) => {
                const health = healthMap.get(item.agentId);
                const successRate = health?.finished?.total
                  ? `${health.finished.successRatePercent}%`
                  : '-';
                const lastTaskText = health?.lastTask?.taskId
                  ? `${health.lastTask.taskId} (${health.lastTask.status || '-'})`
                  : '-';
                const runtimeModeText = item.runtimeSummary?.effectiveRuntimeMode || '-';
                const lockStateText = item.runtimeSummary?.lockState || '-';
                const degradedText = item.runtimeSummary?.degraded
                  ? item.runtimeSummary?.degradeReason || '已降级'
                  : '';
                return (
                  <tr key={item.agentId} className="border-t border-neutral-800">
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.name || item.agentId}</div>
                      <div className="text-xs text-neutral-400">{item.agentId}</div>
                    </td>
                    <td className="px-4 py-3">{item.status}</td>
                    <td className="px-4 py-3 text-xs text-neutral-300">
                      <div>{runtimeModeText}</div>
                      <div className={lockStateText === 'stale-lock' ? 'text-amber-300' : 'text-neutral-500'}>
                        lock: {lockStateText}
                      </div>
                      {degradedText ? <div className="text-amber-300">{degradedText}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-300">{renderAgentIsolationSummary(item)}</td>
                    <td className="px-4 py-3">{item.lastSeenAt || '-'}</td>
                    <td
                      className={`px-4 py-3 ${
                        health && health.finished.total > 0 && health.finished.successRatePercent < 95
                          ? 'text-amber-300'
                          : ''
                      }`}
                    >
                      {successRate}
                    </td>
                    <td className={`px-4 py-3 ${health && health.stuckRunning > 0 ? 'text-rose-300' : ''}`}>
                      {health ? health.stuckRunning : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-300">{lastTaskText}</td>
                    <td className="px-4 py-3">{item.syncVersion ?? 0}</td>
                    <td className="px-4 py-3">{item.lastConfigSyncedAt || '-'}</td>
                    <td className="px-4 py-3">{item.pendingTasks}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <AppButton
                          variant="secondary"
                          onClick={() => {
                            void handleRevoke(item.agentId);
                          }}
                          disabled={item.status === 'DISABLED'}
                        >
                          吊销
                        </AppButton>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="px-4 py-4" colSpan={11}>
                  <EmptyState
                    title={riskOnly ? '当前无风险 Agent' : '暂无 Agent'}
                    description={riskOnly ? '当前窗口内全部 Agent 健康状态正常。' : '先注册一个 Agent，然后在桌面端接入。'}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTable>

      <DataTable>
        <table className="w-full text-sm">
          <thead className="bg-neutral-800/60 text-neutral-300">
            <tr>
              <th className="px-4 py-3 text-left">任务ID</th>
              <th className="px-4 py-3 text-left">Agent</th>
              <th className="px-4 py-3 text-left">类型</th>
              <th className="px-4 py-3 text-left">状态</th>
              <th className="px-4 py-3 text-left">错误</th>
              <th className="px-4 py-3 text-left">诊断</th>
              <th className="px-4 py-3 text-left">建议动作</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length ? (
              tasks.map((item) => {
                const preset = buildTaskSuggestedPreset(item);
                return (
                  <tr key={item.taskId} className="border-t border-neutral-800">
                    <td className="px-4 py-3">{item.taskId}</td>
                    <td className="px-4 py-3">{item.agentId}</td>
                    <td className="px-4 py-3">{item.type}</td>
                    <td className="px-4 py-3">{item.status}</td>
                    <td className="px-4 py-3">{item.errorMessage || '-'}</td>
                    <td className="px-4 py-3 text-xs text-neutral-400">{renderTaskDiagnostics(item)}</td>
                    <td className="px-4 py-3 text-xs text-neutral-300">{renderSuggestedAction(item)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {preset ? (
                          <AppButton
                            variant="secondary"
                            onClick={() => {
                              prefillTaskComposer(
                                item.agentId,
                                preset.type,
                                preset.payload,
                                `已预填任务：${preset.label} (${item.taskId})`,
                              );
                            }}
                          >
                            {preset.label}
                          </AppButton>
                        ) : null}
                        <AppButton
                          variant="secondary"
                          onClick={() => {
                            void handleFocusTaskEvents(item.taskId);
                          }}
                        >
                          查看事件
                        </AppButton>
                        <AppButton
                          variant="secondary"
                          onClick={() => {
                            void handleCopyTaskDebugContext(item);
                          }}
                        >
                          复制排障上下文
                        </AppButton>
                        <AppButton
                          variant="secondary"
                          disabled={item.status === 'SUCCEEDED' || item.status === 'FAILED' || item.status === 'CANCELLED'}
                          onClick={() => {
                            void handleCancel(item.taskId);
                          }}
                        >
                          取消
                        </AppButton>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="px-4 py-4" colSpan={8}>
                  <EmptyState title="暂无任务" description="下发任务后会在这里显示执行状态。" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTable>

      <div className="grid gap-4 md:grid-cols-2">
        <DataTable>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 px-4 py-3 text-xs text-neutral-400">
            <div>
              {taskEventFilterTaskId
                ? `当前仅显示任务 ${taskEventFilterTaskId} 的事件`
                : '当前显示最近任务事件'}
            </div>
            {taskEventFilterTaskId ? (
              <AppButton variant="secondary" onClick={() => { void handleClearTaskEventFocus(); }}>
                清除事件聚焦
              </AppButton>
            ) : null}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-neutral-800/60 text-neutral-300">
              <tr>
                <th className="px-4 py-3 text-left">失败类型</th>
                <th className="px-4 py-3 text-left">错误码</th>
                <th className="px-4 py-3 text-left">次数</th>
                <th className="px-4 py-3 text-left">最后出现</th>
                <th className="px-4 py-3 text-left">建议动作</th>
              </tr>
            </thead>
            <tbody>
              {failureSummary.length ? (
                failureSummary.map((item, index) => (
                  <tr
                    key={`${item.type}-${item.errorCode}-${index}`}
                    className={`border-t border-neutral-800 ${
                      item.errorCode === 'RUNTIME_LOCK_EXISTS' || item.errorCode === 'SNAPSHOT_MISMATCH'
                        ? 'text-amber-300'
                        : item.errorCode === 'POLICY_BLOCK' || item.errorCode === 'LEASE_COOLDOWN'
                          ? 'text-rose-300'
                          : ''
                    }`}
                  >
                    <td className="px-4 py-3">{item.type}</td>
                    <td className="px-4 py-3 font-medium">{item.errorCode}</td>
                    <td className="px-4 py-3">{item.count}</td>
                    <td className="px-4 py-3">{item.lastAt || '-'}</td>
                    <td className="px-4 py-3 text-xs text-neutral-300">{renderFailureSuggestedAction(item)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-4" colSpan={5}>
                    <EmptyState title="暂无失败聚合" description="当前没有失败任务。" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </DataTable>

      <DataTable>
        <table className="w-full text-sm">
          <thead className="bg-neutral-800/60 text-neutral-300">
            <tr>
              <th className="px-4 py-3 text-left">Proxy Asset</th>
              <th className="px-4 py-3 text-left">Sharing</th>
              <th className="px-4 py-3 text-left">Profiles / Max</th>
              <th className="px-4 py-3 text-left">Runs / Max</th>
              <th className="px-4 py-3 text-left">Active Leases</th>
              <th className="px-4 py-3 text-left">Affected Profiles</th>
            </tr>
          </thead>
          <tbody>
            {proxyUsage.length ? (
              proxyUsage.map((item) => (
                <tr key={item.id} className="border-t border-neutral-800">
                  <td className="px-4 py-3">
                    <div className="font-medium">{item.name || item.id}</div>
                    <div className="text-xs text-neutral-500">{item.id}</div>
                  </td>
                  <td className="px-4 py-3">{item.sharingMode}</td>
                  <td className="px-4 py-3">
                    {item.boundProfilesCount} / {item.maxProfilesPerIp}
                  </td>
                  <td className="px-4 py-3">
                    {item.runningProfilesCount} / {item.maxConcurrentRunsPerIp}
                  </td>
                  <td className="px-4 py-3">{item.activeLeasesCount}</td>
                  <td className="px-4 py-3 text-xs text-neutral-300">
                    {item.affectedProfiles?.length
                      ? item.affectedProfiles
                          .map((profile) => `${profile.name} (${profile.profileId.slice(0, 8)})`)
                          .join(', ')
                      : '-'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-4" colSpan={6}>
                  <EmptyState title="暂无 Proxy Asset 占用信息" description="绑定租约或 proxy asset 后会在这里显示共享能力和当前占用。" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTable>

      <DataTable>
        <table className="w-full text-sm">
            <thead className="bg-neutral-800/60 text-neutral-300">
              <tr>
                <th className="px-4 py-3 text-left">时间</th>
                <th className="px-4 py-3 text-left">任务ID</th>
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">Detail</th>
              </tr>
            </thead>
            <tbody>
              {taskEvents.length ? (
                taskEvents.map((item) => (
                  <tr key={item.id} className="border-t border-neutral-800">
                    <td className="px-4 py-3">{item.createdAt || '-'}</td>
                    <td className="px-4 py-3">{item.taskId}</td>
                    <td className="px-4 py-3">{item.agentId}</td>
                    <td className="px-4 py-3">{item.status}</td>
                    <td className="px-4 py-3 text-xs text-neutral-400">{renderEventDetail(item.detail)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-4" colSpan={5}>
                    <EmptyState title="暂无任务事件" description="任务执行后会记录状态事件。" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </DataTable>
      </div>

      <DataTable>
        <table className="w-full text-sm">
          <thead className="bg-neutral-800/60 text-neutral-300">
            <tr>
              <th className="px-4 py-3 text-left">时间</th>
              <th className="px-4 py-3 text-left">操作人</th>
              <th className="px-4 py-3 text-left">动作</th>
              <th className="px-4 py-3 text-left">目标</th>
              <th className="px-4 py-3 text-left">详情</th>
            </tr>
          </thead>
          <tbody>
            {displayedBatchActions.length ? (
              displayedBatchActions.map((item) => (
                <tr key={item.id} className="border-t border-neutral-800">
                  <td className="px-4 py-3">{item.createdAt || '-'}</td>
                  <td className="px-4 py-3">{item.adminEmail || item.adminUserId || '-'}</td>
                  <td className="px-4 py-3">{item.action}</td>
                  <td className="px-4 py-3">{item.targetLabel || item.targetId || '-'}</td>
                  <td className="px-4 py-3 text-xs text-neutral-400">{renderBatchActionDetail(item.detail)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-4" colSpan={5}>
                  <EmptyState
                    title={batchActionFilter === 'all' ? '暂无批量操作记录' : '当前筛选无结果'}
                    description="执行批量操作后会在这里显示最近审计记录。"
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-400">加载 Agent 页面...</div>}>
      <AgentsPageContent />
    </Suspense>
  );
}
