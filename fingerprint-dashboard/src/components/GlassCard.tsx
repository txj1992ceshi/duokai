'use client';

import { ReactNode } from 'react';

type Props = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export default function GlassCard({ title, children, className = '' }: Props) {
  return (
    <div className={`glass rounded-xl p-5 ${className}`}>
      {title ? (
        <h3 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">
          {title}
        </h3>
      ) : null}
      {children}
    </div>
  );
}
