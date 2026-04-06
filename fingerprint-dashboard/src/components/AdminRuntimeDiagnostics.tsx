'use client';

import type {
  AdminAgentTaskSummary,
  AdminTaskFailureSummary,
  AdminTaskEventSummary,
  ProxyAssetSummary,
} from '@/lib/dashboard-types';

type AdminProxyUsageAsset = ProxyAssetSummary & {
  affectedProfiles?: Array<{ profileId: string; name: string }>;
};

type Props = {
  loading: boolean;
  error: string;
  tasks: AdminAgentTaskSummary[];
  events: AdminTaskEventSummary[];
  failures: AdminTaskFailureSummary[];
  proxyAssets: AdminProxyUsageAsset[];
};

function formatTime(value?: string | null) {
  if (!value) return 'unknown time';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'unknown time';
}

export default function AdminRuntimeDiagnostics({
  loading,
  error,
  tasks,
  events,
  failures,
  proxyAssets,
}: Props) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">运行审批诊断</h3>
        <p className="mt-1 text-xs leading-6 text-slate-500">
          查看最近 start/stop 任务的审批码、阻断原因和代理共享使用情况。
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/8 bg-slate-900/55 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div className="mb-1 text-sm font-semibold text-slate-100">最近控制任务</div>
            <div className="mb-4 text-xs text-slate-500">审批结果、租约校验和阻断 reason code 都会显示在这里。</div>
            {loading ? (
              <div className="text-sm text-slate-400">正在加载审批诊断…</div>
            ) : error ? (
              <div className="text-sm text-rose-300">{error}</div>
            ) : tasks.length === 0 ? (
              <div className="text-sm text-slate-500">暂无控制任务。</div>
            ) : (
              <div className="space-y-3">
                {tasks.slice(0, 8).map((task) => (
                  <div key={task.taskId} className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-100">
                        {task.type} · {task.summary?.profileId || 'unknown-profile'}
                      </div>
                      <div className="text-[11px] text-slate-400">{task.status}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-300">
                      {task.summary?.preLaunchDecisionCode ? (
                        <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-blue-200">
                          preflight {task.summary.preLaunchDecisionCode}
                        </span>
                      ) : null}
                      {task.summary?.leaseValidationCode ? (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200">
                          lease {task.summary.leaseValidationCode}
                        </span>
                      ) : null}
                      {task.summary?.blockedReasonCode &&
                      task.summary.blockedReasonCode !== 'APPROVED' &&
                      task.summary.blockedReasonCode !== 'LEASE_OK' ? (
                        <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-rose-200">
                          blocked {task.summary.blockedReasonCode}
                        </span>
                      ) : null}
                      {task.summary?.ipUsageMode ? (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                          {task.summary.ipUsageMode}
                        </span>
                      ) : null}
                      {task.summary?.proxySharingMode ? (
                        <span className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-1 text-fuchsia-200">
                          proxy {task.summary.proxySharingMode}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      agent {task.agentId} · {formatTime(task.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/8 bg-slate-900/55 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div className="mb-1 text-sm font-semibold text-slate-100">最近任务事件</div>
            <div className="mb-4 text-xs text-slate-500">最近 task event 中记录的 action、审批码和租约码。</div>
            {loading ? (
              <div className="text-sm text-slate-400">正在加载任务事件…</div>
            ) : events.length === 0 ? (
              <div className="text-sm text-slate-500">暂无任务事件。</div>
            ) : (
              <div className="space-y-2">
                {events.slice(0, 10).map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm text-slate-200">
                        {event.status} · {event.summary?.action || 'task'} · {event.summary?.profileId || event.taskId}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {event.summary?.preLaunchDecisionCode || '—'} / {event.summary?.leaseValidationCode || '—'}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500">{formatTime(event.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/8 bg-slate-900/55 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div className="mb-1 text-sm font-semibold text-slate-100">失败原因汇总</div>
            <div className="mb-4 text-xs text-slate-500">按 task type 和归一化 reason code 聚合最近失败任务。</div>
            {loading ? (
              <div className="text-sm text-slate-400">正在加载失败汇总…</div>
            ) : failures.length === 0 ? (
              <div className="text-sm text-slate-500">暂无失败任务汇总。</div>
            ) : (
              <div className="space-y-2">
                {failures.slice(0, 8).map((item) => (
                  <div
                    key={`${item.type}-${item.errorCode}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm text-slate-200">{item.type}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{item.errorCode}</div>
                    </div>
                    <div className="text-right text-[11px] text-slate-500">
                      <div>{item.count} failures</div>
                      <div>{formatTime(item.lastAt || null)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-slate-900/55 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
          <div className="mb-1 text-sm font-semibold text-slate-100">代理资产使用</div>
          <div className="mb-4 text-xs text-slate-500">当前 sharing mode、绑定数量、并发运行数量和受影响 profile。</div>
          {loading ? (
            <div className="text-sm text-slate-400">正在加载代理使用情况…</div>
          ) : proxyAssets.length === 0 ? (
            <div className="text-sm text-slate-500">暂无代理资产数据。</div>
          ) : (
            <div className="space-y-3">
              {proxyAssets.slice(0, 8).map((asset) => (
                <div key={asset.id} className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-100">{asset.name || asset.id}</div>
                    <div className="text-[11px] text-slate-400">{asset.sharingMode}</div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                    <div>profiles {asset.boundProfilesCount}/{asset.maxProfilesPerIp}</div>
                    <div>running {asset.runningProfilesCount}/{asset.maxConcurrentRunsPerIp}</div>
                    <div>leases {asset.activeLeasesCount}</div>
                    <div>affected {asset.affectedProfileIds.length}</div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    {(asset.affectedProfiles || []).slice(0, 4).map((item) => item.name || item.profileId).join(', ') ||
                      'No bound profiles'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
