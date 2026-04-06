'use client';

import {
  Activity,
  AlertCircle,
  Building,
  CheckCircle,
  Database,
  Globe,
  Loader2,
  MapPin,
  Network,
  Pencil,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import AppButton from '@/components/AppButton';
import AppInput from '@/components/AppInput';
import AppSelect from '@/components/AppSelect';
import IpUsageSummary from '@/components/IpUsageSummary';
import WorkspaceSnapshotPanel from '@/components/WorkspaceSnapshotPanel';
import type { GroupItem, Profile, WorkspaceSnapshotRecord } from '@/lib/dashboard-types';
import type {
  HostEnvironment,
  ProxyCheckStatus,
  ProxyProtocol,
  ProxyVerificationRecord,
} from '@/lib/proxyTypes';

type PlatformOption = {
  key: string;
  label: string;
};

type Props = {
  profile: Profile | null;
  groups: GroupItem[];
  proxyChecking: boolean;
  proxyBrowserChecking: boolean;
  controlPlaneOnly: boolean;
  proxyResult: ProxyVerificationRecord | null;
  proxyBrowserResult: ProxyVerificationRecord | null;
  workspaceSnapshots: WorkspaceSnapshotRecord[];
  workspaceSnapshotsLoading: boolean;
  workspaceSnapshotsError: string;
  platformOptions: readonly PlatformOption[];
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onProfileChange: (profile: Profile) => void;
  onCheckProxy: () => void;
  onBrowserCheckProxy: () => void;
  onAdoptCurrentProxyResult: () => void;
  onRefreshWorkspaceSnapshots: () => void;
  getPlatformUrl: (platform?: string) => string;
  buildProxyFromDraft: (draft: Partial<Profile>) => string;
  formatExpectedTarget: (profile: Pick<Profile, 'expectedProxyIp' | 'expectedProxyCountry' | 'expectedProxyRegion'>) => string;
  getHostEnvironmentLabel: (value?: HostEnvironment) => string;
  getCheckStatusLabel: (status?: ProxyCheckStatus | string) => string;
  getEntryTransportLabel: (transport?: string) => string;
  getExpectationMismatchMessage: (
    result: ProxyVerificationRecord | null | undefined,
    profile: Pick<Profile, 'expectedProxyIp' | 'expectedProxyCountry' | 'expectedProxyRegion'>
  ) => string;
};

export default function EditProfileModal({
  profile,
  groups,
  proxyChecking,
  proxyBrowserChecking,
  controlPlaneOnly,
  proxyResult,
  proxyBrowserResult,
  workspaceSnapshots,
  workspaceSnapshotsLoading,
  workspaceSnapshotsError,
  platformOptions,
  onClose,
  onSubmit,
  onProfileChange,
  onCheckProxy,
  onBrowserCheckProxy,
  onAdoptCurrentProxyResult,
  onRefreshWorkspaceSnapshots,
  getPlatformUrl,
  buildProxyFromDraft,
  formatExpectedTarget,
  getHostEnvironmentLabel,
  getCheckStatusLabel,
  getEntryTransportLabel,
  getExpectationMismatchMessage,
}: Props) {
  if (!profile) return null;
  const purpose = profile.purpose || 'operation';
  const ipUsageMode = profile.ipUsageMode || (purpose === 'register' ? 'dedicated' : 'shared');
  const sharedModeBlockedByPurpose = purpose === 'register' && ipUsageMode === 'shared';

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="my-auto flex max-h-[calc(100vh-2rem)] w-[520px] flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-[#141720] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center space-x-2">
            <Pencil size={15} className="text-blue-400" />
            <h2 className="text-sm font-bold">
              编辑环境: <span className="text-blue-400">{profile.name}</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-6">
            <AppInput
              label="环境名称"
              className="h-11 rounded-xl border-slate-700 bg-slate-900"
              type="text"
              value={profile.name}
              onChange={(e) => onProfileChange({ ...profile, name: e.target.value })}
            />

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-400">
                可选平台
              </label>
              <div className="grid grid-cols-2 gap-3">
                <AppSelect
                  className="h-11 rounded-xl border-slate-700 bg-slate-900"
                  value={profile.startupPlatform || 'none'}
                  onChange={(e) => {
                    const nextPlatform = e.target.value;
                    onProfileChange({
                      ...profile,
                      startupPlatform: nextPlatform,
                      startupUrl:
                        nextPlatform === 'custom' ? '' : getPlatformUrl(nextPlatform),
                    });
                  }}
                >
                  {platformOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </AppSelect>
                <AppInput
                  className={`h-11 rounded-xl ${
                    profile.startupPlatform === 'custom'
                      ? 'border-slate-700 bg-slate-900'
                      : 'border-slate-800 bg-slate-950/80 text-slate-400'
                  }`}
                  type="text"
                  value={
                    profile.startupPlatform === 'custom'
                      ? profile.startupUrl || ''
                      : getPlatformUrl(profile.startupPlatform) || ''
                  }
                  placeholder={
                    profile.startupPlatform === 'custom'
                      ? '输入平台地址，例如 https://web.whatsapp.com/'
                      : '选中平台后将自动生成地址'
                  }
                  readOnly={profile.startupPlatform !== 'custom'}
                  onChange={(e) =>
                    onProfileChange({ ...profile, startupUrl: e.target.value })
                  }
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                打开环境后，会默认进入当前所选平台。选择“自定义平台”时可填写任意站点地址。
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-300">
                <Network size={14} className="text-cyan-300" />
                IP 使用模式
              </div>
              <AppSelect
                className="h-11 rounded-xl border-slate-700 bg-slate-900"
                value={ipUsageMode}
                onChange={(e) =>
                  onProfileChange({
                    ...profile,
                    ipUsageMode: e.target.value as 'dedicated' | 'shared',
                  })
                }
              >
                <option value="dedicated">Dedicated IP（1 IP = 1 环境）</option>
                <option value="shared">Shared IP（1 IP = 多环境）</option>
              </AppSelect>
              <div className="mt-2 space-y-1 text-[11px] leading-relaxed">
                <p className="text-slate-500">
                  用户可以手动选择模式，但最终是否允许启动，仍由 control plane 按平台策略、代理共享能力、租约和冷却状态统一判定。
                </p>
                <p className="text-slate-500">
                  当前环境用途: <span className="text-slate-300">{purpose}</span>
                </p>
                <p className={sharedModeBlockedByPurpose ? 'text-amber-300' : 'text-slate-500'}>
                  {sharedModeBlockedByPurpose
                    ? '当前用途为 register。按默认策略，Shared IP 会在启动前被控制面明确拒绝。'
                    : ipUsageMode === 'shared'
                      ? 'Shared IP 仅在代理资产支持共享，且未超过 profile/run 上限时才允许启动。'
                      : 'Dedicated IP 会阻止同一 IP 被其他受保护环境复用。'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-300">
                <ShieldCheck size={14} className="text-emerald-300" />
                当前代理能力与占用
              </div>
              <IpUsageSummary profile={{ ...profile, ipUsageMode }} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-400">
                代理服务器
              </label>
              <div className="grid grid-cols-2 gap-3">
                <AppSelect
                  className="h-11 rounded-xl border-slate-700 bg-slate-900"
                  value={profile.proxyType || 'direct'}
                  onChange={(e) => {
                    onProfileChange({
                      ...profile,
                      proxyType: e.target.value as ProxyProtocol,
                      expectedProxyCountry: '',
                      expectedProxyRegion: '',
                    });
                  }}
                >
                  <option value="direct">直连（不设置代理）</option>
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                  <option value="socks5">SOCKS5</option>
                </AppSelect>
                <AppInput
                  className="h-11 rounded-xl border-slate-700 bg-slate-900"
                  type="text"
                  value={profile.proxyHost || ''}
                  placeholder="代理主机，例如 38.69.171.250"
                  onChange={(e) =>
                    onProfileChange({
                      ...profile,
                      proxyHost: e.target.value,
                      expectedProxyCountry: '',
                      expectedProxyRegion: '',
                    })
                  }
                  disabled={profile.proxyType === 'direct'}
                />
                <AppInput
                  className="h-11 rounded-xl border-slate-700 bg-slate-900"
                  type="text"
                  value={profile.proxyPort || ''}
                  placeholder="代理端口，例如 44001"
                  onChange={(e) =>
                    onProfileChange({
                      ...profile,
                      proxyPort: e.target.value,
                      expectedProxyCountry: '',
                      expectedProxyRegion: '',
                    })
                  }
                  disabled={profile.proxyType === 'direct'}
                />
                <AppInput
                  className="h-11 rounded-xl border-slate-700 bg-slate-900"
                  type="text"
                  value={profile.proxyUsername || ''}
                  placeholder="账号"
                  onChange={(e) =>
                    onProfileChange({
                      ...profile,
                      proxyUsername: e.target.value,
                      expectedProxyCountry: '',
                      expectedProxyRegion: '',
                    })
                  }
                  disabled={profile.proxyType === 'direct'}
                />
                <AppInput
                  className="col-span-2 h-11 rounded-xl border-slate-700 bg-slate-900"
                  type="text"
                  value={profile.proxyPassword || ''}
                  placeholder="密码"
                  onChange={(e) =>
                    onProfileChange({
                      ...profile,
                      proxyPassword: e.target.value,
                      expectedProxyCountry: '',
                      expectedProxyRegion: '',
                    })
                  }
                  disabled={profile.proxyType === 'direct'}
                />
                <AppInput
                  className="col-span-2 h-11 rounded-xl border-slate-700 bg-slate-900"
                  type="text"
                  value={profile.expectedProxyIp || ''}
                  placeholder="代理期望出口 IP，例如 104.241.144.46"
                  onChange={(e) =>
                    onProfileChange({ ...profile, expectedProxyIp: e.target.value })
                  }
                />
                <AppInput
                  className="h-11 rounded-xl border-slate-800 bg-slate-950/80 text-slate-400"
                  type="text"
                  value={profile.expectedProxyCountry || ''}
                  placeholder="由真实浏览器检测自动生成"
                  readOnly
                />
                <AppInput
                  className="h-11 rounded-xl border-slate-800 bg-slate-950/80 text-slate-400"
                  type="text"
                  value={profile.expectedProxyRegion || ''}
                  placeholder="由真实浏览器检测自动生成"
                  readOnly
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                控制层流量可以继续走宿主机当前网络/VPN；环境层流量必须通过当前环境代理出网。
                {profile.proxyTypeSource === 'inferred'
                  ? ' 当前代理协议来自旧数据推断，默认按 HTTP 处理，可手动切换为 HTTPS / SOCKS5。'
                  : ''}
                {' 当前机器会优先按宿主环境自动协商代理入口模式，再进行真实浏览器验证。'}
                {formatExpectedTarget(profile)
                  ? ` 当前严格期望出口: ${formatExpectedTarget(profile)}`
                  : ' 如需严格拦截 VPN 串流，请填写期望 IP，并先运行一次真实浏览器检测自动生成国家/地区。'}
              </p>
              {controlPlaneOnly ? (
                <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  当前是云端控制面模式。真实浏览器检测只能在桌面端本地运行，云端页面仅保留网关检测和配置管理。
                </div>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 break-all rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 font-mono text-[11px] text-slate-400">
                  {buildProxyFromDraft(profile) || '填写代理主机和端口后，将在这里生成代理串'}
                </div>
                <AppButton
                  type="button"
                  disabled={proxyChecking}
                  onClick={onCheckProxy}
                  variant="secondary"
                  size="sm"
                >
                  {proxyChecking ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Zap size={12} />
                  )}
                  <span>{proxyChecking ? '检测中' : '网关检测'}</span>
                </AppButton>
                <AppButton
                  type="button"
                  disabled={proxyBrowserChecking || controlPlaneOnly}
                  onClick={onBrowserCheckProxy}
                  variant="primary"
                  size="sm"
                  className="bg-blue-600/80 hover:bg-blue-600"
                >
                  {proxyBrowserChecking ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Globe size={12} />
                  )}
                  <span>{proxyBrowserChecking ? '检测中' : '真实浏览器检测'}</span>
                </AppButton>
              </div>
              {proxyResult ? (
                <div
                  className={`mt-2 rounded-lg p-3 text-[11px] ${
                    proxyResult.status === 'reachable'
                      ? 'border border-green-500/20 bg-green-500/10 text-green-400'
                      : 'border border-red-500/20 bg-red-500/10 text-red-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center space-x-2">
                      {proxyResult.status === 'reachable' ? (
                        <CheckCircle size={12} />
                      ) : (
                        <AlertCircle size={12} />
                      )}
                      <span>
                        控制层 / 网关检测: {getCheckStatusLabel(proxyResult.status)}
                      </span>
                    </div>
                    <span className="text-[10px] opacity-80">
                      耗时: {proxyResult.latencyMs ?? '-'}ms
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="flex items-center space-x-1">
                      <ShieldCheck size={10} />
                      <span>
                        协议:{' '}
                        {String(
                          proxyResult.proxyType || profile.proxyType || 'direct'
                        ).toUpperCase()}
                      </span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Globe size={10} />
                      <span>
                        宿主环境: {getHostEnvironmentLabel(proxyResult.hostEnvironment)}
                      </span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Network size={10} />
                      <span>
                        网关状态: {proxyResult.gatewayReachable ? '已触达' : '未触达'}
                      </span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Activity size={10} />
                      <span>
                        候选入口:{' '}
                        {getEntryTransportLabel(
                          proxyResult.candidateTransport ||
                            proxyResult.effectiveProxyTransport
                        )}
                      </span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Database size={10} />
                      <span>IP: {proxyResult.ip || '-'}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <MapPin size={10} />
                      <span>
                        归属地: {proxyResult.country || '-'} {proxyResult.city || ''}
                      </span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Building size={10} />
                      <span>{proxyResult.isp || proxyResult.error || '-'}</span>
                    </span>
                  </div>
                  {getExpectationMismatchMessage(proxyResult, profile) ? (
                    <div className="mt-2 text-amber-300">
                      {getExpectationMismatchMessage(proxyResult, profile)}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {proxyBrowserResult ? (
                <div
                  className={`mt-2 rounded-lg p-3 text-[11px] ${
                    proxyBrowserResult.status === 'verified'
                      ? 'border border-blue-500/20 bg-blue-500/10 text-blue-300'
                      : proxyBrowserResult.status === 'vpn_leak_suspected'
                        ? 'border border-amber-500/20 bg-amber-500/10 text-amber-300'
                        : 'border border-red-500/20 bg-red-500/10 text-red-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center space-x-2">
                      {proxyBrowserResult.status === 'verified' ? (
                        <CheckCircle size={12} />
                      ) : (
                        <AlertCircle size={12} />
                      )}
                      <span>
                        环境层 / 真实浏览器检测:{' '}
                        {getCheckStatusLabel(proxyBrowserResult.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] opacity-80">
                        耗时: {proxyBrowserResult.latencyMs ?? '-'}ms
                      </span>
                      <button
                        type="button"
                        disabled={!proxyBrowserResult.ip}
                        onClick={onAdoptCurrentProxyResult}
                        className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-blue-200 transition-colors hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        一键采用当前检测结果
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="flex items-center space-x-1">
                      <ShieldCheck size={10} />
                      <span>
                        协议:{' '}
                        {String(
                          proxyBrowserResult.proxyType ||
                            profile.proxyType ||
                            'direct'
                        ).toUpperCase()}
                      </span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Activity size={10} />
                      <span>
                        最终入口:{' '}
                        {getEntryTransportLabel(
                          proxyBrowserResult.effectiveProxyTransport
                        )}
                      </span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Globe size={10} />
                      <span>
                        宿主环境:{' '}
                        {getHostEnvironmentLabel(proxyBrowserResult.hostEnvironment)}
                      </span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Network size={10} />
                      <span>
                        环境状态:{' '}
                        {proxyBrowserResult.browserVerified ? '已就绪' : '未就绪'}
                      </span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Database size={10} />
                      <span>IP: {proxyBrowserResult.ip || '-'}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <MapPin size={10} />
                      <span>
                        归属地: {proxyBrowserResult.country || '-'}{' '}
                        {proxyBrowserResult.city || ''}
                      </span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Building size={10} />
                      <span>{proxyBrowserResult.isp || '-'}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Globe size={10} />
                      <span>来源: {proxyBrowserResult.provider || '-'}</span>
                    </span>
                    {proxyBrowserResult.httpProbe || proxyBrowserResult.httpsProbe ? (
                      <span className="col-span-2">
                        HTTP 探测:{' '}
                        {getCheckStatusLabel(proxyBrowserResult.httpProbe?.status)} ·
                        HTTPS 探测:{' '}
                        {getCheckStatusLabel(proxyBrowserResult.httpsProbe?.status)}
                      </span>
                    ) : null}
                    <span className="col-span-2">
                      {proxyBrowserResult.error ||
                        proxyBrowserResult.detail ||
                        '真实浏览器已确认当前环境出口与代理配置一致。'}
                    </span>
                    {proxyBrowserResult.expectedIp ||
                    proxyBrowserResult.expectedCountry ||
                    proxyBrowserResult.expectedRegion ? (
                      <span className="col-span-2">
                        期望出口:{' '}
                        {[
                          proxyBrowserResult.expectedIp,
                          proxyBrowserResult.expectedCountry,
                          proxyBrowserResult.expectedRegion,
                        ]
                          .filter(Boolean)
                          .join(' / ')}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <AppInput
              label="自定义 User Agent"
              className="h-11 rounded-xl border-slate-700 bg-slate-900"
              type="text"
              value={profile.ua || ''}
              placeholder="留空则自动生成"
              onChange={(e) => onProfileChange({ ...profile, ua: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <AppSelect
                  label="所属团队分组"
                  className="h-11 rounded-xl border-slate-700 bg-slate-900"
                  value={profile.groupId || ''}
                  onChange={(e) =>
                    onProfileChange({
                      ...profile,
                      groupId: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">(无分组)</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </AppSelect>
              </div>
              <AppInput
                label="指纹种子 (Seed)"
                className="h-11 rounded-xl border-slate-700 bg-slate-900 font-mono"
                type="text"
                value={profile.seed || ''}
                onChange={(e) => onProfileChange({ ...profile, seed: e.target.value })}
              />
            </div>

            <WorkspaceSnapshotPanel
              profile={profile}
              snapshots={workspaceSnapshots}
              loading={workspaceSnapshotsLoading}
              errorMessage={workspaceSnapshotsError}
              onRefresh={onRefreshWorkspaceSnapshots}
            />
          </div>

          <div className="flex shrink-0 justify-end space-x-2 border-t border-slate-800 bg-[#141720] px-6 py-4">
            <AppButton type="button" onClick={onClose} variant="secondary">
              取消
            </AppButton>
            <AppButton type="submit" variant="primary">
              <CheckCircle size={14} />
              <span>保存配置</span>
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
}
