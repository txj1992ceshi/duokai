'use client';

import type { Profile } from '@/lib/dashboard-types';

type Props = {
  profile: Profile;
  compact?: boolean;
};

function formatTimestamp(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '';
}

export default function ProfileSecuritySummary({ profile, compact = false }: Props) {
  const workspace = profile.workspace;
  const trustSummary = workspace?.trustSummary;
  const consistencySummary = workspace?.consistencySummary;
  const snapshotSummary = workspace?.snapshotSummary;

  if (!workspace || !trustSummary || !consistencySummary || !snapshotSummary) {
    return (
      <div className={compact ? 'text-[11px] text-slate-500' : 'text-[11px] text-slate-400'}>
        安全摘要 · 未同步
      </div>
    );
  }

  const trustLabel =
    trustSummary.trustedSnapshotStatus === 'trusted'
      ? '可信'
      : trustSummary.trustedSnapshotStatus === 'stale'
        ? '基线过期'
        : trustSummary.trustedSnapshotStatus === 'invalid'
          ? '基线失效'
          : '未建基线';
  const quickCheckLabel =
    trustSummary.lastQuickIsolationCheckSuccess === false
      ? '快速隔离失败'
      : trustSummary.lastQuickIsolationCheckSuccess === true
        ? '快速隔离通过'
        : '未做快速隔离';
  const driftLabel =
    consistencySummary.status === 'block'
      ? 'Workspace 漂移阻断'
      : consistencySummary.status === 'warn'
        ? 'Workspace 漂移告警'
        : consistencySummary.status === 'pass'
          ? 'Workspace 一致'
          : 'Workspace 未校验';
  const snapshotLabel =
    snapshotSummary.lastKnownGoodStatus === 'valid'
      ? '最近可用快照有效'
      : snapshotSummary.lastKnownGoodStatus === 'invalid'
        ? '最近可用快照失效'
        : '无最近可用快照';
  const runtimeLockLabel =
    trustSummary.activeRuntimeLock.state === 'locked'
      ? `运行锁定中${trustSummary.activeRuntimeLock.ownerDeviceId ? ` · ${trustSummary.activeRuntimeLock.ownerDeviceId}` : ''}`
      : trustSummary.activeRuntimeLock.state === 'stale-lock'
        ? '检测到陈旧运行锁'
        : '无运行锁';

  if (compact) {
    return (
      <div className="space-y-1 text-[11px] text-slate-500">
        <div>
          信任 · <span className="text-slate-300">{trustLabel}</span>
          {' '}· <span className="text-slate-300">{driftLabel}</span>
        </div>
        <div>
          快照 · <span className="text-slate-300">{snapshotLabel}</span>
          {snapshotSummary.lastKnownGoodSnapshotAt ? (
            <> · <span className="text-slate-300">{formatTimestamp(snapshotSummary.lastKnownGoodSnapshotAt)}</span></>
          ) : null}
        </div>
        <div>
          检查 · <span className="text-slate-300">{quickCheckLabel}</span>
          {trustSummary.lastQuickIsolationCheckAt ? (
            <> · <span className="text-slate-300">{formatTimestamp(trustSummary.lastQuickIsolationCheckAt)}</span></>
          ) : null}
        </div>
        <div>
          锁状态 · <span className="text-slate-300">{runtimeLockLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-[11px] text-slate-400">
      <div>
        环境信任 · <span className="text-slate-200">{trustLabel}</span>
      </div>
      <div>
        Workspace 状态 · <span className="text-slate-200">{driftLabel}</span>
      </div>
      <div>
        快速隔离检查 · <span className="text-slate-200">{quickCheckLabel}</span>
        {trustSummary.lastQuickIsolationCheckAt ? ` · ${formatTimestamp(trustSummary.lastQuickIsolationCheckAt)}` : ''}
      </div>
      <div>
        最近可用快照 · <span className="text-slate-200">{snapshotLabel}</span>
        {snapshotSummary.lastKnownGoodSnapshotAt ? ` · ${formatTimestamp(snapshotSummary.lastKnownGoodSnapshotAt)}` : ''}
      </div>
      <div>
        当前运行锁 · <span className="text-slate-200">{runtimeLockLabel}</span>
      </div>
    </div>
  );
}
