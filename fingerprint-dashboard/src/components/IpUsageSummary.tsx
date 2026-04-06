'use client';

import type { Profile } from '@/lib/dashboard-types';

type Props = {
  profile: Profile;
  compact?: boolean;
};

export default function IpUsageSummary({ profile, compact = false }: Props) {
  const usageMode = profile.ipUsageMode || 'dedicated';
  const proxyAsset = profile.proxyAssetSummary;
  const activeLease = profile.activeLeaseSummary;
  const policy = profile.ipUsagePolicy;
  const block = profile.lastLaunchBlock;
  const sharedBlockedByPolicy =
    usageMode === 'shared' &&
    policy &&
    Array.isArray(policy.allowedIpUsageModes) &&
    !policy.allowedIpUsageModes.includes('shared');

  if (compact) {
    return (
      <div className="space-y-1 text-[11px] text-slate-500">
        <div>
          IP 模式 · <span className="text-slate-300">{usageMode === 'shared' ? 'Shared' : 'Dedicated'}</span>
          {proxyAsset ? (
            <>
              {' '}· 资产 <span className="text-slate-300">{proxyAsset.id.slice(0, 8)}</span>
            </>
          ) : null}
          {activeLease ? (
            <>
              {' '}· 租约 <span className="text-slate-300">{activeLease.state || '-'}</span>
            </>
          ) : null}
        </div>
        {block?.code ? (
          <div className="text-amber-300">最近阻断 · {block.code}</div>
        ) : null}
        {sharedBlockedByPolicy ? (
          <div className="text-amber-300">当前用途策略不允许 Shared IP</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-[11px] text-slate-400">
      <div>
        IP 使用模式 · <span className="text-slate-200">{usageMode === 'shared' ? 'Shared IP' : 'Dedicated IP'}</span>
      </div>
      {policy ? (
        <div>
          策略默认 · <span className="text-slate-200">{policy.defaultIpUsageMode}</span>
          {' '}· 允许 {policy.allowedIpUsageModes.join(' / ')}
        </div>
      ) : null}
      {proxyAsset ? (
        <div>
          代理能力 · <span className="text-slate-200">{proxyAsset.sharingMode}</span>
          {' '}· 绑定 {proxyAsset.boundProfilesCount}/{proxyAsset.maxProfilesPerIp}
          {' '}· 运行 {proxyAsset.runningProfilesCount}/{proxyAsset.maxConcurrentRunsPerIp}
        </div>
      ) : (
        <div>代理能力 · 未绑定 proxy asset</div>
      )}
      {activeLease ? (
        <div>
          当前租约 · <span className="text-slate-200">{activeLease.state || '-'}</span>
          {activeLease.deviceId ? <> · 设备 {activeLease.deviceId}</> : null}
        </div>
      ) : (
        <div>当前租约 · 无</div>
      )}
      {sharedBlockedByPolicy ? (
        <div className="text-amber-300">当前平台/用途策略不允许 Shared IP。</div>
      ) : null}
      {block?.code ? (
        <div className="text-amber-300">
          最近阻断 · {block.code}
          {block.message ? ` · ${block.message}` : ''}
        </div>
      ) : null}
    </div>
  );
}
