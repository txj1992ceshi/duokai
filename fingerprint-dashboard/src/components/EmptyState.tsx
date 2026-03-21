'use client';

import React from 'react';

type Props = {
  icon: React.ElementType;
  title: string;
  desc: string;
};

export default function EmptyState({ icon: Icon, title, desc }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-slate-500">
      <div className="mb-5 rounded-2xl bg-slate-800/50 p-5">
        <Icon size={40} strokeWidth={1} className="text-slate-600" />
      </div>
      <h3 className="mb-2 text-base font-bold text-slate-400">{title}</h3>
      <p className="max-w-xs text-center text-sm">{desc}</p>
    </div>
  );
}
