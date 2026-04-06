'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
  MonitorSmartphone,
  Pencil,
  Play,
  StopCircle,
  Trash2,
} from 'lucide-react';
import AppButton from '@/components/AppButton';
import EmptyState from '@/components/EmptyState';
import GlassCard from '@/components/GlassCard';
import IpUsageSummary from '@/components/IpUsageSummary';
import ProfileStorageStateEditor from '@/components/ProfileStorageStateEditor';
import ProfileSyncSummary from '@/components/ProfileSyncSummary';
import ProxyNodeCell from '@/components/ProxyNodeCell';
import type { Profile } from '@/lib/dashboard-types';
import {
  formatWorkspaceSnapshotSummary,
  getHostEnvironmentLabel,
  getProfileStatusLabel,
  getProfileStatusTone,
  getProfileSyncSummary,
  getStartupNavigationLabel,
  getStartupNavigationTone,
  getSyncSummaryClass,
} from '@/lib/dashboard-formatters';

type Props = {
  loading: boolean;
  profiles: Profile[];
  storageStateMap: Record<string, boolean>;
  storageStateInput: Record<string, string>;
  storageStateEditorOpen: Record<string, boolean>;
  isStartingProfile: (profileId: string) => boolean;
  isRunningProfile: (profile: Profile) => boolean;
  onStartSession: (profile: Profile) => void;
  onStopSession: (profile: Profile) => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileId: string) => void;
  onToggleStorageStateEditor: (profileId: string) => void;
  onChangeStorageStateInput: (profileId: string, value: string) => void;
  onSyncLoginState: (profileId: string) => void;
  onLoadSyncedLoginState: (profileId: string) => void;
};

export default function DesktopProfileList({
  loading,
  profiles,
  storageStateMap,
  storageStateInput,
  storageStateEditorOpen,
  isStartingProfile,
  isRunningProfile,
  onStartSession,
  onStopSession,
  onEditProfile,
  onDeleteProfile,
  onToggleStorageStateEditor,
  onChangeStorageStateInput,
  onSyncLoginState,
  onLoadSyncedLoginState,
}: Props) {
  const [detailsOpenMap, setDetailsOpenMap] = useState<Record<string, boolean>>({});

  function toggleDetails(profileId: string) {
    setDetailsOpenMap((prev) => ({ ...prev, [profileId]: !prev[profileId] }));
  }

  return (
    <GlassCard title="环境快速管理">
      <div className="space-y-3">
        {loading ? (
          <div className="py-12 text-center">
            <Loader2 size={20} className="mx-auto animate-spin text-slate-500" />
          </div>
        ) : profiles.length === 0 ? (
          <EmptyState icon={Globe} title="暂无浏览器环境" desc="点击右上角「新建环境」创建您的第一个桌面隔离环境。" />
        ) : (
          profiles.map((profile) => {
            const isStarting = isStartingProfile(profile.id);
            const detailsOpen = !!detailsOpenMap[profile.id];
            return (
              <div
                key={profile.id}
                className="rounded-2xl border border-slate-700/60 bg-slate-900/35 p-4 transition-all hover:border-slate-600 hover:bg-slate-900/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-500">{profile.id.split('-')[0]}</span>
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                        <MonitorSmartphone size={14} className="text-slate-500" />
                        {profile.name}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${getProfileStatusTone(profile, isStarting)}`}
                      >
                        {getProfileStatusLabel(profile, isStarting)}
                      </span>
                    </div>

                    {detailsOpen ? (
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,2.1fr)_160px_170px]">
                        <div className="rounded-xl border border-slate-800 bg-[#111722] px-3 py-3">
                          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">代理节点</div>
                          <ProxyNodeCell profile={profile} />
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-[#111722] px-3 py-3">
                          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">指纹种子</div>
                          <div className="font-mono text-sm text-slate-200">{profile.seed ? profile.seed.slice(0, 8) : '—'}</div>
                          {profile.lastHostEnvironment ? (
                            <div className="mt-2 text-[11px] text-slate-500">
                              宿主环境 · {getHostEnvironmentLabel(profile.lastHostEnvironment)}
                            </div>
                          ) : null}
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-[#111722] px-3 py-3">
                          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">平台状态</div>
                          <div className={`text-sm font-medium ${getStartupNavigationTone(profile)}`}>
                            {getStartupNavigationLabel(profile) || '平台页: 未指定'}
                          </div>
                          <div className="mt-1 break-all text-[11px] text-slate-500">
                            <ProfileSyncSummary
                              profile={profile}
                              syncSummary={getProfileSyncSummary(profile)}
                              syncSummaryClass={getSyncSummaryClass(getProfileSyncSummary(profile))}
                              storageStateSynced={!!storageStateMap[profile.id]}
                            />
                          </div>
                          {profile.lastResolvedProxyTransport ? (
                            <div className="mt-2 text-[11px] text-slate-500">
                              最终入口 · {String(profile.lastResolvedProxyTransport).toUpperCase()}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 rounded-xl border border-slate-800 bg-[#111722] px-3 py-3">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-300">
                          <span className="text-slate-500">代理</span>
                          <ProxyNodeCell profile={profile} />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-300">
                          <span className="text-slate-500">指纹</span>
                          <span>{profile.seed ? `Seed ${profile.seed.slice(0, 8)}` : '默认'}</span>
                          <span className={getStartupNavigationTone(profile)}>
                            {getStartupNavigationLabel(profile) || '平台页: 未指定'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          <ProfileSyncSummary
                            profile={profile}
                            syncSummary={getProfileSyncSummary(profile)}
                            syncSummaryClass={getSyncSummaryClass(getProfileSyncSummary(profile))}
                            storageStateSynced={!!storageStateMap[profile.id]}
                          />
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatWorkspaceSnapshotSummary(profile)}
                        </div>
                        <IpUsageSummary profile={profile} compact />
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1 self-center">
                    {isRunningProfile(profile) ? (
                      <AppButton
                        onClick={() => onStopSession(profile)}
                        variant="danger"
                        size="sm"
                        className="bg-red-600/85 text-white hover:bg-red-600"
                      >
                        <StopCircle size={12} />
                        <span>停止</span>
                      </AppButton>
                    ) : (
                      <AppButton
                        onClick={() => onStartSession(profile)}
                        disabled={isStarting}
                        variant={isStarting ? 'secondary' : 'primary'}
                        size="sm"
                        className={isStarting ? 'bg-amber-600/85 text-amber-50' : 'bg-blue-600/85 hover:bg-blue-600'}
                      >
                        {isStarting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                        <span>{isStarting ? '启动中' : '打开'}</span>
                      </AppButton>
                    )}
                    <AppButton onClick={() => onEditProfile(profile)} variant="secondary" size="sm">
                      <Pencil size={14} />
                      <span>编辑</span>
                    </AppButton>
                    <AppButton
                      onClick={() => toggleDetails(profile.id)}
                      variant="secondary"
                      size="sm"
                    >
                      {detailsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      <span>{detailsOpen ? '收起详情' : '详情'}</span>
                    </AppButton>
                    <AppButton
                      onClick={() => onDeleteProfile(profile.id)}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 px-0 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </AppButton>
                  </div>
                </div>
                {detailsOpen ? (
                  <div className="mt-3 border-t border-slate-800/80 pt-3">
                    <div className="mb-3 rounded-xl border border-slate-800 bg-[#111722] px-3 py-3">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">IP 使用状态</div>
                      <IpUsageSummary profile={profile} />
                    </div>
                    <ProfileStorageStateEditor
                      profileId={profile.id}
                      open={!!storageStateEditorOpen[profile.id]}
                      value={storageStateInput[profile.id] || ''}
                      onToggle={() => onToggleStorageStateEditor(profile.id)}
                      onChange={(value) => onChangeStorageStateInput(profile.id, value)}
                      onSync={() => onSyncLoginState(profile.id)}
                      onLoad={() => onLoadSyncedLoginState(profile.id)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </GlassCard>
  );
}
