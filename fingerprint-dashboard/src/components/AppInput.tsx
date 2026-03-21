'use client';

import { InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export default function AppInput({ label, className = '', ...props }: Props) {
  return (
    <label className="block space-y-2">
      {label ? <span className="text-sm text-white/75">{label}</span> : null}
      <input
        className={[
          'h-14 w-full rounded-2xl border border-white/12 bg-slate-950/55 px-4 text-white outline-none transition duration-200 placeholder:text-white/35',
          'focus:border-blue-400/60 focus:bg-slate-950/70 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.12)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
    </label>
  );
}
