'use client';

import { Loader2, Pencil, Play, Smartphone, StopCircle, Trash2 } from 'lucide-react';
import AppButton from '@/components/AppButton';
import EmptyState from '@/components/EmptyState';
import GlassCard from '@/components/GlassCard';
import IpUsageSummary from '@/components/IpUsageSummary';
import ProfileSecuritySummary from '@/components/ProfileSecuritySummary';
import ProfileStorageStateEditor from '@/components/ProfileStorageStateEditor';
import ProfileSyncSummary from '@/components/ProfileSyncSummary';
import ProxyNodeCell from '@/components/ProxyNodeCell';
import type { Profile } from '@/lib/dashboard-types';
import { getProfileSyncSummary, getSyncSummaryClass } from '@/lib/dashboard-formatters';

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

export default function MobileProfileTable({
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
  return (
    <GlassCard title="手机隔离环境">
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
                  <EmptyState icon={Smartphone} title="暂无手机环境" desc="创建专属的移动端指纹环境，骗过任何严苛的反作弊系统。" />
                </td>
              </tr>
            ) : (
              profiles.map((profile) => (
                <tr key={profile.id} className="group transition-colors hover:bg-slate-800/20">
                  <td className="py-3.5 font-mono text-xs text-slate-500">{profile.id.split('-')[0]}</td>
                  <td className="flex items-center space-x-2 py-3.5 text-sm font-medium">
                    <Smartphone size={13} className="text-purple-400" />
                    <span className="text-purple-100">{profile.name}</span>
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
                            ? 'bg-purple-500/15 text-purple-400'
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
                    <div className="mt-2">
                      <ProfileSecuritySummary profile={profile} compact />
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
                        <span>{isStartingProfile(profile.id) ? '启动中' : '唤醒真机'}</span>
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
  );
}
