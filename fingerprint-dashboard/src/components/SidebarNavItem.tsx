'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';

type Props = {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
};

export default function SidebarNavItem({
  icon: Icon,
  label,
  active = false,
  onClick,
}: Props) {
  return (
    <div
      onClick={onClick}
      className={`group mx-2 flex cursor-pointer items-center space-x-3 rounded-lg px-5 py-2.5 transition-all duration-200 ${
        active
          ? 'border border-blue-500/30 bg-blue-600/20 text-blue-400'
          : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
      }`}
    >
      <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
      <span className="text-sm font-medium">{label}</span>
      {active ? <ChevronRight size={12} className="ml-auto opacity-50" /> : null}
    </div>
  );
}
