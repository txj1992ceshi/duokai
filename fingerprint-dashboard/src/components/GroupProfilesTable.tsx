'use client';

import { ChevronRight, Globe, Loader2, MonitorSmartphone, Pencil, Play, Smartphone, StopCircle, Trash2 } from 'lucide-react';
import AppButton from '@/components/AppButton';
import EmptyState from '@/components/EmptyState';
import GlassCard from '@/components/GlassCard';
import IpUsageSummary from '@/components/IpUsageSummary';
import ProfileStorageStateEditor from '@/components/ProfileStorageStateEditor';
import ProfileSyncSummary from '@/components/ProfileSyncSummary';
import ProxyNodeCell from '@/components/ProxyNodeCell';
import type { GroupItem, Profile } from '@/lib/dashboard-types';
import { getProfileSyncSummary, getSyncSummaryClass } from '@/lib/dashboard-formatters';

type Props = {
  loading: boolean;
  selectedGroup: GroupItem | null;
  profiles: Profile[];
  storageStateMap: Record<string, boolean>;
  storageStateInput: Record<string, string>;
  storageStateEditorOpen: Record<string, boolean>;
  isStartingProfile: (profileId: string) => boolean;
  isRunningProfile: (profile: Profile) => boolean;
  onBack: () => void;
  onCreateProfile: () => void;
  onStartSession: (profile: Profile) => void;
  onStopSession: (profile: Profile) => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileId: string) => void;
  onToggleStorageStateEditor: (profileId: string) => void;
  onChangeStorageStateInput: (profileId: string, value: string) => void;
  onSyncLoginState: (profileId: string) => void;
  onLoadSyncedLoginState: (profileId: string) => void;
};

export default function GroupProfilesTable({
  loading,
  selectedGroup,
  profiles,
  storageStateMap,
  storageStateInput,
  storageStateEditorOpen,
  isStartingProfile,
  isRunningProfile,
  onBack,
  onCreateProfile,
  onStartSession,
  onStopSession,
  onEditProfile,
  onDeleteProfile,
  onToggleStorageStateEditor,
  onChangeStorageStateInput,
  onSyncLoginState,
  onLoadSyncedLoginState,
}: Props) {
  return (
    <div className="animate-in slide-in-from-right-2 duration-300">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <AppButton onClick={onBack} variant="secondary" size="sm" className="h-8 w-8 px-0">
            <ChevronRight className="rotate-180" size={16} strokeWidth={2.5} />
          </AppButton>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold">{selectedGroup?.name || '分组视图'}</h3>
              <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400">
                分组视图
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">管理该分组下的所有隔离环境</p>
          </div>
        </div>
        <AppButton onClick={onCreateProfile} variant="primary" size="sm">
          <span>新建环境入组</span>
        </AppButton>
      </div>

      <GlassCard>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-slate-500">
              <tr>
                <th className="pb-3 text-xs font-semibold">识别 ID</th>
                <th className="pb-3 text-xs font-semibold">环境名称</th>
                <th className="pb-3 text-xs font-semibold">代理节点</th>
                <th className="pb-3 text-xs font-semibold">指纹种子</th>
                <th className="pb-3 text-xs font-semibold">状态</th>
                <th className="pb-3 text-right text-xs font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Loader2 size={20} className="mx-auto animate-spin text-slate-500" />
                  </td>
                </tr>
              ) : profiles.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={Globe} title="该分组下暂无环境" desc="点击右上角「新建环境入组」开始分配。" />
                  </td>
                </tr>
              ) : (
                profiles.map((profile) => (
                  <tr key={profile.id} className="group transition-colors hover:bg-slate-800/20">
                    <td className="py-3.5 font-mono text-xs text-slate-500">{profile.id.split('-')[0]}</td>
                    <td className="flex items-center space-x-2 py-3.5 text-sm font-medium">
                      {profile.isMobile ? (
                        <Smartphone size={13} className="text-purple-400" />
                      ) : (
                        <MonitorSmartphone size={13} className="text-slate-500" />
                      )}
                      <span className={profile.isMobile ? 'text-purple-100' : ''}>{profile.name}</span>
                    </td>
                    <td className="py-3.5">
                      <ProxyNodeCell profile={profile} />
                    </td>
                    <td className="py-3.5 font-mono text-xs text-slate-400">
                      {profile.seed ? profile.seed.slice(0, 8) : '—'}
                    </td>
                    <td className="py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          isStartingProfile(profile.id)
                            ? 'bg-amber-500/15 text-amber-400'
                            : profile.status === 'Running'
                              ? profile.isMobile
                                ? 'bg-purple-500/15 text-purple-400'
                                : 'bg-green-500/15 text-green-400'
                              : 'bg-slate-700/50 text-slate-400'
                        }`}
                      >
                        {isStartingProfile(profile.id) ? '启动中' : profile.status === 'Ready' ? '就绪' : profile.status}
                      </span>
                      <div className="mt-2 break-all text-[10px] text-slate-500">
                        <ProfileSyncSummary
                          profile={profile}
                          syncSummary={getProfileSyncSummary(profile)}
                          syncSummaryClass={getSyncSummaryClass(getProfileSyncSummary(profile))}
                          storageStateSynced={!!storageStateMap[profile.id]}
                        />
                      </div>
                      <div className="mt-2">
                        <IpUsageSummary profile={profile} compact />
                      </div>
                    </td>
                    <td className="flex justify-end space-x-1 py-3.5 text-right">
                      {isRunningProfile(profile) ? (
                        <AppButton
                          onClick={() => onStopSession(profile)}
                          variant="danger"
                          size="sm"
                          className="bg-red-600/80 text-white hover:bg-red-600"
                        >
                          <StopCircle size={10} />
                          <span>停止</span>
                        </AppButton>
                      ) : (
                        <AppButton
                          onClick={() => onStartSession(profile)}
                          disabled={isStartingProfile(profile.id)}
                          variant={isStartingProfile(profile.id) ? 'secondary' : 'primary'}
                          size="sm"
                          className={isStartingProfile(profile.id) ? 'bg-amber-600/80 text-amber-50' : 'bg-blue-600/80 hover:bg-blue-600'}
                        >
                          {isStartingProfile(profile.id) ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                          <span>{isStartingProfile(profile.id) ? '启动中' : profile.isMobile ? '唤醒真机' : '打开'}</span>
                        </AppButton>
                      )}
                      <AppButton onClick={() => onEditProfile(profile)} variant="ghost" size="sm" className="h-8 w-8 px-0">
                        <Pencil size={13} />
                      </AppButton>
                      <ProfileStorageStateEditor
                        profileId={profile.id}
                        open={!!storageStateEditorOpen[profile.id]}
                        value={storageStateInput[profile.id] || ''}
                        onToggle={() => onToggleStorageStateEditor(profile.id)}
                        onChange={(value) => onChangeStorageStateInput(profile.id, value)}
                        onSync={() => onSyncLoginState(profile.id)}
                        onLoad={() => onLoadSyncedLoginState(profile.id)}
                      />
                      <AppButton
                        onClick={() => onDeleteProfile(profile.id)}
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 px-0 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 size={13} />
                      </AppButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
