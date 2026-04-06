'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock3,
  HardDriveDownload,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import AppButton from '@/components/AppButton';
import type { Profile, WorkspaceSnapshotRecord } from '@/lib/dashboard-types';

type Props = {
  profile: Profile;
  snapshots: WorkspaceSnapshotRecord[];
  loading: boolean;
  errorMessage: string;
  onRefresh: () => void;
};

function formatDate(value?: string) {
  if (!value) return '从未';
  return new Date(value).toLocaleString();
}

function formatSnapshotId(snapshotId?: string) {
  const value = String(snapshotId || '').trim();
  if (!value) return '从未';
  return value.length > 16 ? value.slice(0, 16) : value;
}

function getSnapshotTone(snapshot: WorkspaceSnapshotRecord) {
  if (snapshot.consistencySummary.status === 'block') {
    return 'border-red-500/20 bg-red-500/10 text-red-300';
  }
  if (
    snapshot.healthSummary.status === 'warning' ||
    snapshot.consistencySummary.status === 'warn'
  ) {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
  }
  if (snapshot.validatedStartAt) {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
  }
  return 'border-slate-700 bg-slate-900/70 text-slate-300';
}

type DiffRow = {
  label: string;
  category: 'template' | 'runtime' | 'path' | 'override' | 'migration';
  currentValue: string;
  snapshotValue: string;
  changed: boolean;
};

function stringifyValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value || '').trim() || '—';
}

export default function WorkspaceSnapshotPanel({
  profile,
  snapshots,
  loading,
  errorMessage,
  onRefresh,
}: Props) {
  const workspace = profile.workspace;
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('');
  const effectiveSelectedSnapshotId =
    selectedSnapshotId && snapshots.some((snapshot) => snapshot.snapshotId === selectedSnapshotId)
      ? selectedSnapshotId
      : snapshots[0]?.snapshotId || '';
  const selectedSnapshot =
    snapshots.find((snapshot) => snapshot.snapshotId === effectiveSelectedSnapshotId) ||
    snapshots[0] ||
    null;

  const diffRows = useMemo<DiffRow[]>(() => {
    if (!selectedSnapshot || !workspace) {
      return [];
    }

    const snapshotWorkspace = selectedSnapshot.workspaceMetadata;
    const rows: DiffRow[] = [
      {
        label: 'Template fingerprint',
        category: 'template',
        currentValue: workspace.templateBinding.templateFingerprintHash || '—',
        snapshotValue: snapshotWorkspace.templateBinding?.templateFingerprintHash || '—',
        changed:
          (workspace.templateBinding.templateFingerprintHash || '') !==
          (snapshotWorkspace.templateBinding?.templateFingerprintHash || ''),
      },
      {
        label: 'Template revision',
        category: 'template',
        currentValue: workspace.templateBinding.templateRevision || '—',
        snapshotValue: snapshotWorkspace.templateBinding?.templateRevision || '—',
        changed:
          (workspace.templateBinding.templateRevision || '') !==
          (snapshotWorkspace.templateBinding?.templateRevision || ''),
      },
      {
        label: 'Migration state',
        category: 'migration',
        currentValue: workspace.migrationState || '—',
        snapshotValue: snapshotWorkspace.migrationState || '—',
        changed: (workspace.migrationState || '') !== (snapshotWorkspace.migrationState || ''),
      },
      {
        label: 'Browser family',
        category: 'runtime',
        currentValue: workspace.resolvedEnvironment.browserFamily || '—',
        snapshotValue: snapshotWorkspace.resolvedEnvironment?.browserFamily || '—',
        changed:
          (workspace.resolvedEnvironment.browserFamily || '') !==
          (snapshotWorkspace.resolvedEnvironment?.browserFamily || ''),
      },
      {
        label: 'Browser version range',
        category: 'runtime',
        currentValue: workspace.resolvedEnvironment.browserMajorVersionRange || '—',
        snapshotValue: snapshotWorkspace.resolvedEnvironment?.browserMajorVersionRange || '—',
        changed:
          (workspace.resolvedEnvironment.browserMajorVersionRange || '') !==
          (snapshotWorkspace.resolvedEnvironment?.browserMajorVersionRange || ''),
      },
      {
        label: 'Browser language',
        category: 'runtime',
        currentValue: workspace.resolvedEnvironment.browserLanguage || '—',
        snapshotValue: snapshotWorkspace.resolvedEnvironment?.browserLanguage || '—',
        changed:
          (workspace.resolvedEnvironment.browserLanguage || '') !==
          (snapshotWorkspace.resolvedEnvironment?.browserLanguage || ''),
      },
      {
        label: 'Timezone',
        category: 'runtime',
        currentValue: workspace.resolvedEnvironment.timezone || '—',
        snapshotValue: snapshotWorkspace.resolvedEnvironment?.timezone || '—',
        changed:
          (workspace.resolvedEnvironment.timezone || '') !==
          (snapshotWorkspace.resolvedEnvironment?.timezone || ''),
      },
      {
        label: 'Resolution',
        category: 'runtime',
        currentValue: workspace.resolvedEnvironment.resolution || '—',
        snapshotValue: snapshotWorkspace.resolvedEnvironment?.resolution || '—',
        changed:
          (workspace.resolvedEnvironment.resolution || '') !==
          (snapshotWorkspace.resolvedEnvironment?.resolution || ''),
      },
      {
        label: 'WebRTC policy',
        category: 'runtime',
        currentValue: workspace.resolvedEnvironment.webrtcPolicy || '—',
        snapshotValue: snapshotWorkspace.resolvedEnvironment?.webrtcPolicy || '—',
        changed:
          (workspace.resolvedEnvironment.webrtcPolicy || '') !==
          (snapshotWorkspace.resolvedEnvironment?.webrtcPolicy || ''),
      },
      {
        label: 'IPv6 policy',
        category: 'runtime',
        currentValue: workspace.resolvedEnvironment.ipv6Policy || '—',
        snapshotValue: snapshotWorkspace.resolvedEnvironment?.ipv6Policy || '—',
        changed:
          (workspace.resolvedEnvironment.ipv6Policy || '') !==
          (snapshotWorkspace.resolvedEnvironment?.ipv6Policy || ''),
      },
      {
        label: 'Launch args',
        category: 'runtime',
        currentValue: stringifyValue(workspace.resolvedEnvironment.launchArgs),
        snapshotValue: stringifyValue(snapshotWorkspace.resolvedEnvironment?.launchArgs),
        changed:
          stringifyValue(workspace.resolvedEnvironment.launchArgs) !==
          stringifyValue(snapshotWorkspace.resolvedEnvironment?.launchArgs),
      },
      {
        label: 'Downloads path',
        category: 'path',
        currentValue: workspace.paths.downloadsDir || '—',
        snapshotValue: snapshotWorkspace.paths?.downloadsDir || '—',
        changed:
          (workspace.paths.downloadsDir || '') !== (snapshotWorkspace.paths?.downloadsDir || ''),
      },
      {
        label: 'Profile root',
        category: 'path',
        currentValue: workspace.paths.profileDir || '—',
        snapshotValue: snapshotWorkspace.paths?.profileDir || '—',
        changed: (workspace.paths.profileDir || '') !== (snapshotWorkspace.paths?.profileDir || ''),
      },
      {
        label: 'Declared overrides',
        category: 'override',
        currentValue: JSON.stringify(workspace.declaredOverrides || {}),
        snapshotValue: JSON.stringify(snapshotWorkspace.declaredOverrides || {}),
        changed:
          JSON.stringify(workspace.declaredOverrides || {}) !==
          JSON.stringify(snapshotWorkspace.declaredOverrides || {}),
      },
    ];

    return rows;
  }, [selectedSnapshot, workspace]);

  const changedDiffRows = diffRows.filter((row) => row.changed);
  const categorizedDiffRows = useMemo(() => {
    const groups: Record<DiffRow['category'], DiffRow[]> = {
      template: [],
      runtime: [],
      path: [],
      override: [],
      migration: [],
    };
    for (const row of changedDiffRows) {
      groups[row.category].push(row);
    }
    return groups;
  }, [changedDiffRows]);
  const auditVerdict = useMemo(() => {
    if (!selectedSnapshot) {
      return {
        tone: 'border-slate-700 bg-slate-900/70 text-slate-300',
        label: '未选择快照',
        detail: '请选择一个 snapshot 查看当前 workspace 的审计结论。',
      };
    }

    if (
      workspace?.consistencySummary.status === 'block' ||
      selectedSnapshot.consistencySummary.status === 'block'
    ) {
      return {
        tone: 'border-red-500/20 bg-red-500/10 text-red-300',
        label: '阻断级漂移',
        detail: '当前 workspace 或目标快照存在 consistency block，恢复前需要先处理硬阻断项。',
      };
    }

    if (
      workspace?.healthSummary.status === 'broken' ||
      selectedSnapshot.healthSummary.status === 'broken'
    ) {
      return {
        tone: 'border-red-500/20 bg-red-500/10 text-red-300',
        label: '健康状态异常',
        detail: '至少一侧 workspace 健康状态为 broken，建议先修复本地环境再考虑恢复。',
      };
    }

    if (categorizedDiffRows.path.length > 0 || categorizedDiffRows.template.length > 0) {
      return {
        tone: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
        label: '高风险差异',
        detail: '模板绑定或关键路径已经变化，这类差异通常会影响恢复后的可启动性和一致性。',
      };
    }

    if (changedDiffRows.length > 0) {
      return {
        tone: 'border-blue-500/20 bg-blue-500/10 text-blue-200',
        label: '可审阅差异',
        detail: '存在 runtime 或 override 变化，适合继续结合 health/consistency 消息人工判断。',
      };
    }

    return {
      tone: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
      label: '与快照高度一致',
      detail: '当前 workspace 关键字段与所选 snapshot 保持一致，没有发现显著 drift。',
    };
  }, [categorizedDiffRows, changedDiffRows.length, selectedSnapshot, workspace]);
  const recommendedActions = useMemo(() => {
    if (!selectedSnapshot) {
      return ['先选择一个 snapshot，再查看恢复或巡检建议。'];
    }

    const actions: string[] = [];

    if (
      workspace?.consistencySummary.status === 'block' ||
      selectedSnapshot.consistencySummary.status === 'block'
    ) {
      actions.push('先处理 consistency block 项，再考虑恢复或回滚。');
    }

    if (
      workspace?.healthSummary.status === 'broken' ||
      selectedSnapshot.healthSummary.status === 'broken'
    ) {
      actions.push('先做本地 workspace 巡检，确认 profileDir、meta 和 migration 状态恢复正常。');
    }

    if (categorizedDiffRows.path.length > 0) {
      actions.push('优先检查 workspace 路径是否仍在受管目录下，尤其是 profile/downloads/extensions/meta。');
    }

    if (categorizedDiffRows.template.length > 0) {
      actions.push('优先核对 template fingerprint 和 template revision，确认模板绑定没有漂移。');
    }

    if (categorizedDiffRows.override.length > 0) {
      actions.push('复查 declared overrides 是否仍在允许白名单内，避免 override 漂移放大。');
    }

    if (categorizedDiffRows.runtime.length > 0 && categorizedDiffRows.path.length === 0) {
      actions.push('可先比对 runtime drift，再决定是恢复 snapshot 还是保留当前环境继续运行。');
    }

    if (selectedSnapshot.validatedStartAt && changedDiffRows.length === 0) {
      actions.push('该快照已经过启动验证且当前高度一致，适合作为优先恢复参考。');
    }

    if (actions.length === 0) {
      actions.push('当前没有发现明显高风险差异，可继续结合业务场景决定是否恢复或保留现状。');
    }

    return actions;
  }, [categorizedDiffRows, changedDiffRows.length, selectedSnapshot, workspace]);

  const categoryMeta: Record<
    DiffRow['category'],
    { label: string; tone: string }
  > = {
    template: {
      label: 'Template drift',
      tone: 'border-red-500/20 bg-red-500/10 text-red-200',
    },
    runtime: {
      label: 'Runtime drift',
      tone: 'border-blue-500/20 bg-blue-500/10 text-blue-200',
    },
    path: {
      label: 'Path drift',
      tone: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
    },
    override: {
      label: 'Override drift',
      tone: 'border-violet-500/20 bg-violet-500/10 text-violet-200',
    },
    migration: {
      label: 'Migration drift',
      tone: 'border-slate-600 bg-slate-800/70 text-slate-200',
    },
  };

  if (!workspace) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-4 text-sm text-slate-400">
        当前环境还是旧文档，暂时没有 workspace 快照摘要。
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Workspace Snapshots
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Dashboard 端只读展示当前环境的 snapshot 索引、last known good 和最近恢复记录。
          </p>
        </div>
        <AppButton type="button" onClick={onRefresh} variant="secondary" size="sm">
          {loading ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          <span>{loading ? '刷新中' : '刷新'}</span>
        </AppButton>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <Clock3 size={12} />
            最近快照
          </div>
          <div className="font-mono text-sm text-slate-100">
            {formatSnapshotId(workspace.snapshotSummary.lastSnapshotId)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {formatDate(workspace.snapshotSummary.lastSnapshotAt)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <ShieldCheck size={12} />
            Last Known Good
          </div>
          <div className="font-mono text-sm text-slate-100">
            {formatSnapshotId(workspace.snapshotSummary.lastKnownGoodSnapshotId)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {formatDate(workspace.snapshotSummary.lastKnownGoodSnapshotAt)}
          </div>
          {workspace.snapshotSummary.lastKnownGoodStatus === 'invalid' ? (
            <div className="mt-2 text-[11px] text-amber-300">
              Invalidated: {workspace.snapshotSummary.lastKnownGoodInvalidationReason || 'unknown'}
            </div>
          ) : null}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <RotateCcw size={12} />
            最近恢复
          </div>
          <div className="text-sm text-slate-100">
            {workspace.recovery.lastRecoveryReason || '无'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {formatDate(workspace.recovery.lastRecoveryAt)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <ShieldCheck size={12} />
            Isolation Trust
          </div>
          <div className="text-sm text-slate-100">
            {workspace.trustSummary.trustedSnapshotStatus || 'unknown'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {workspace.trustSummary.trustedLaunchVerifiedAt
              ? `Verified ${formatDate(workspace.trustSummary.trustedLaunchVerifiedAt)}`
              : '尚未建立可信启动基线'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <Clock3 size={12} />
            Quick Isolation
          </div>
          <div className="text-sm text-slate-100">
            {workspace.trustSummary.lastQuickIsolationCheckSuccess === false
              ? 'failed'
              : workspace.trustSummary.lastQuickIsolationCheckSuccess === true
                ? 'passed'
                : 'unknown'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {workspace.trustSummary.lastQuickIsolationCheckAt
              ? formatDate(workspace.trustSummary.lastQuickIsolationCheckAt)
              : '从未'}
          </div>
          {workspace.trustSummary.lastQuickIsolationCheckMessage ? (
            <div className="mt-2 text-[11px] text-amber-200">
              {workspace.trustSummary.lastQuickIsolationCheckMessage}
            </div>
          ) : null}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <AlertTriangle size={12} />
            Runtime Lock
          </div>
          <div className="text-sm text-slate-100">
            {workspace.trustSummary.activeRuntimeLock.state || 'unlocked'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {workspace.trustSummary.activeRuntimeLock.updatedAt
              ? formatDate(workspace.trustSummary.activeRuntimeLock.updatedAt)
              : '从未'}
          </div>
          {workspace.trustSummary.activeRuntimeLock.ownerDeviceId ? (
            <div className="mt-2 text-[11px] text-slate-500">
              Device {workspace.trustSummary.activeRuntimeLock.ownerDeviceId}
            </div>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
          {errorMessage}
        </div>
      ) : null}

      {snapshots.length > 0 ? (
        <div className="space-y-2">
          {snapshots.map((snapshot) => {
            const isKnownGood =
              snapshot.snapshotId === workspace.snapshotSummary.lastKnownGoodSnapshotId;
            return (
              <div
                key={snapshot.snapshotId}
                className={`rounded-xl border px-3 py-3 ${getSnapshotTone(snapshot)}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-semibold">
                      {formatSnapshotId(snapshot.snapshotId)}
                    </div>
                    <div className="mt-1 text-[11px] opacity-80">
                      创建于 {formatDate(snapshot.createdAt)}
                      {snapshot.validatedStartAt
                        ? ` · 启动验证 ${formatDate(snapshot.validatedStartAt)}`
                        : ''}
                    </div>
                  </div>
                  <div className="rounded-full border border-current/20 px-2.5 py-1 text-[10px] font-bold">
                    {isKnownGood ? '当前 last known good' : snapshot.consistencySummary.status}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] opacity-85">
                  <span className="inline-flex items-center gap-1">
                    <HardDriveDownload size={11} />
                    Storage v{snapshot.storageState.version || 0}
                  </span>
                  <span>Template rev {snapshot.templateRevision || '-'}</span>
                  <span>Dirs {snapshot.directoryManifest.length}</span>
                  <span>Health {snapshot.healthSummary.status}</span>
                </div>
                <div className="mt-3">
                  <AppButton
                    type="button"
                    variant={selectedSnapshot?.snapshotId === snapshot.snapshotId ? 'primary' : 'secondary'}
                    size="sm"
                    className={
                      selectedSnapshot?.snapshotId === snapshot.snapshotId
                        ? 'bg-blue-600/80 hover:bg-blue-600'
                        : ''
                    }
                    onClick={() => setSelectedSnapshotId(snapshot.snapshotId)}
                  >
                    <span>
                      {selectedSnapshot?.snapshotId === snapshot.snapshotId ? '正在查看' : '查看 diff'}
                    </span>
                  </AppButton>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-4 text-sm text-slate-400">
          {loading ? '正在加载 workspace 快照...' : '当前环境还没有同步到 control-plane 的 workspace 快照。'}
        </div>
      )}

      {selectedSnapshot ? (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Snapshot Diff
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                对比当前 workspace 与快照 {formatSnapshotId(selectedSnapshot.snapshotId)}，帮助判断 drift 和恢复风险。
              </p>
            </div>
            <div className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-[11px] text-slate-300">
              {changedDiffRows.length > 0 ? `${changedDiffRows.length} 项已变化` : '当前与快照一致'}
            </div>
          </div>

          <div className={`rounded-xl border px-4 py-3 ${auditVerdict.tone}`}>
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold">{auditVerdict.label}</div>
                <div className="mt-1 text-[11px] leading-relaxed opacity-90">{auditVerdict.detail}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Recommended Actions
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {recommendedActions.map((action) => (
                <span
                  key={action}
                  className="inline-flex rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-[11px] text-slate-300"
                >
                  {action}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                Changed Fields
              </div>
              {changedDiffRows.length > 0 ? (
                (Object.keys(categorizedDiffRows) as Array<DiffRow['category']>)
                  .filter((category) => categorizedDiffRows[category].length > 0)
                  .map((category) => (
                    <div key={category} className={`rounded-lg border p-3 ${categoryMeta[category].tone}`}>
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-90">
                        {categoryMeta[category].label}
                      </div>
                      <div className="mt-2 space-y-2">
                        {categorizedDiffRows[category].map((row) => (
                          <div key={row.label} className="rounded-lg border border-current/10 bg-black/10 p-2.5">
                            <div className="text-xs font-semibold">{row.label}</div>
                            <div className="mt-2 text-[11px] opacity-90">
                              Current: <span className="font-mono">{row.currentValue}</span>
                            </div>
                            <div className="mt-1 text-[11px] opacity-90">
                              Snapshot: <span className="font-mono">{row.snapshotValue}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
              ) : (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-[11px] text-emerald-300">
                  当前 workspace 关键字段与该 snapshot 一致。
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Current Health / Consistency
                </div>
                <div className="mt-2 text-[11px] text-slate-300">
                  Health: {workspace.healthSummary.status} · Consistency: {workspace.consistencySummary.status}
                </div>
                <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
                  {(workspace.healthSummary.messages || [])
                    .concat(workspace.consistencySummary.messages || [])
                    .slice(0, 6)
                    .map((message, index) => (
                      <li key={`current-${index}`}>• {message}</li>
                    ))}
                </ul>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Snapshot Health / Consistency
                </div>
                <div className="mt-2 text-[11px] text-slate-300">
                  Health: {selectedSnapshot.healthSummary.status} · Consistency: {selectedSnapshot.consistencySummary.status}
                </div>
                <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
                  {(selectedSnapshot.healthSummary.messages || [])
                    .concat(selectedSnapshot.consistencySummary.messages || [])
                    .slice(0, 6)
                    .map((message, index) => (
                      <li key={`snapshot-${index}`}>• {message}</li>
                    ))}
                </ul>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Snapshot Details
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-slate-400">
                  <div>Storage version: {selectedSnapshot.storageState.version || 0}</div>
                  <div>Storage hash: {selectedSnapshot.storageState.stateHash || '—'}</div>
                  <div>Template fingerprint: {selectedSnapshot.templateFingerprintHash || '—'}</div>
                  <div>Template revision: {selectedSnapshot.templateRevision || '—'}</div>
                  <div>Validated start: {formatDate(selectedSnapshot.validatedStartAt)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
