'use client';

import { Bell, Plus } from 'lucide-react';
import AppButton from '@/components/AppButton';
import type { CurrentUserSummary, DashboardTab } from '@/lib/dashboard-types';

type Props = {
  activeTab: DashboardTab;
  runtimeOnline: boolean | null;
  currentUser: CurrentUserSummary;
  onOpenAdminUsers: () => void;
  onLogout: () => void;
  onCreateProfile: () => void;
  onNotify: () => void;
};

export default function DashboardTopbar({
  activeTab,
  runtimeOnline,
  currentUser,
  onOpenAdminUsers,
  onLogout,
  onCreateProfile,
  onNotify,
}: Props) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-800/80 bg-[#0f1117]/80 px-6 backdrop-blur-sm">
      <div className="flex items-center space-x-3">
        <h2 className="text-sm font-semibold text-slate-100">{activeTab}</h2>
        <div className="flex items-center space-x-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          <span className="text-[10px] font-bold tracking-wider text-green-500">面板在线</span>
        </div>
        <div
          className={`flex items-center space-x-1.5 rounded-full border px-2.5 py-1 ${
            runtimeOnline === true
              ? 'border-blue-500/20 bg-blue-500/10'
              : runtimeOnline === false
                ? 'border-red-500/20 bg-red-500/10'
                : 'border-slate-700 bg-slate-700/30'
          }`}
        >
          <div
            className={`h-1.5 w-1.5 rounded-full ${
              runtimeOnline === true
                ? 'animate-pulse bg-blue-400'
                : runtimeOnline === false
                  ? 'bg-red-500'
                  : 'bg-slate-500'
            }`}
          />
          <span
            className={`text-[10px] font-bold tracking-wider ${
              runtimeOnline === true
                ? 'text-blue-400'
                : runtimeOnline === false
                  ? 'text-red-400'
                  : 'text-slate-500'
            }`}
          >
            {runtimeOnline === true ? 'Runtime 就绪' : runtimeOnline === false ? 'Runtime 离线' : '检测中...'}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-xs text-slate-300">
          {currentUser?.name || currentUser?.email || currentUser?.username || '未知用户'}
          {currentUser?.role ? ` (${currentUser.role})` : ''}
        </div>
        {currentUser?.role === 'admin' ? (
          <AppButton
            onClick={onOpenAdminUsers}
            variant="secondary"
            size="sm"
            className="border-blue-700/60 text-blue-300 hover:border-blue-500 hover:bg-blue-900/30 hover:text-blue-100"
          >
            用户管理
          </AppButton>
        ) : null}
        <AppButton onClick={onLogout} variant="secondary" size="sm">
          退出登录
        </AppButton>
        <AppButton onClick={onCreateProfile} variant="primary" size="sm">
          <Plus size={13} />
          <span>{activeTab === '手机环境' ? '新建手机环境' : '新建环境'}</span>
        </AppButton>
        <AppButton onClick={onNotify} variant="ghost" size="sm" className="h-8 w-8 px-0">
          <Bell size={15} />
        </AppButton>
      </div>
    </header>
  );
}
