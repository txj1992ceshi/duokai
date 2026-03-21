'use client';

import { ReactNode } from 'react';

type Props = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
};

export default function DetailCard({
  title,
  subtitle,
  children,
  className = '',
}: Props) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/35 p-5 ${className}`.trim()}>
      {title || subtitle ? (
        <div className="mb-4">
          {title ? <div className="text-sm font-semibold text-slate-100">{title}</div> : null}
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
