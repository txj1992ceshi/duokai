'use client';

import { ReactNode, SelectHTMLAttributes } from 'react';

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  children: ReactNode;
};

export default function AppSelect({
  label,
  children,
  className = '',
  ...props
}: Props) {
  return (
    <label className="block space-y-2">
      {label ? <span className="text-sm text-white/75">{label}</span> : null}
      <select
        className={[
          'h-11 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-sm text-white outline-none transition',
          'focus:border-blue-400/60 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.12)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
