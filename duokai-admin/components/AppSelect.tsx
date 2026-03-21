'use client';

import type { SelectHTMLAttributes } from 'react';

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
};

export default function AppSelect({ label, className = '', id, children, ...props }: Props) {
  const selectId = id || props.name;

  return (
    <div className="space-y-2">
      {label ? (
        <label className="text-sm text-white/75" htmlFor={selectId}>
          {label}
        </label>
      ) : null}
      <select
        id={selectId}
        className={[
          'h-12 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 text-white outline-none transition duration-200',
          'focus:border-cyan-400/60 focus:bg-neutral-950 focus:shadow-[0_0_0_4px_rgba(34,211,238,0.12)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
