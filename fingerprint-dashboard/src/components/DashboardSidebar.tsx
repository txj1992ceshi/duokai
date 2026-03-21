'use client';

import { FingerprintIcon, ShieldCheck, User } from 'lucide-react';
import SidebarNavItem from '@/components/SidebarNavItem';
import type { CurrentUserSummary, DashboardTab } from '@/lib/dashboard-types';

type NavItem = {
  icon: React.ElementType;
  label: DashboardTab;
};

type Props = {
  activeTab: DashboardTab;
  navItems: NavItem[];
  currentUser: CurrentUserSummary;
  onChangeTab: (tab: DashboardTab) => void;
};

export default function DashboardSidebar({
  activeTab,
  navItems,
  currentUser,
  onChangeTab,
}: Props) {
  return (
    <div className="flex w-60 flex-col border-r border-slate-800/80 bg-[#111318]">
      <div className="flex items-center space-x-3 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-lg shadow-blue-500/30">
          <FingerprintIcon size={16} strokeWidth={2} />
        </div>
        <span className="text-base font-bold tracking-tight">
          军伙工作台<span className="text-blue-500">Core</span>
        </span>
      </div>

      <div className="mx-5 mb-4 h-px bg-slate-800/80" />

      <nav className="flex-1 space-y-0.5 px-1">
        {navItems.map(({ icon, label }) => (
          <SidebarNavItem
            key={label}
            icon={icon}
            label={label}
            active={activeTab === label}
            onClick={() => onChangeTab(label)}
          />
        ))}
      </nav>

      <div className="border-t border-slate-800/80 p-4">
        <div className="flex cursor-pointer items-center space-x-3 rounded-lg px-2 py-2 hover:bg-slate-800/50">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
            <User size={13} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">
              {currentUser?.name || currentUser?.email || currentUser?.username || '高级版用户'}
            </p>
            <p className="text-[10px] text-slate-500">
              {currentUser?.role ? `${currentUser.role} 权限` : '内部授权'}
            </p>
          </div>
          <ShieldCheck size={13} className="flex-shrink-0 text-green-500" />
        </div>
      </div>
    </div>
  );
}
