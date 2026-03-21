'use client';

import { TextareaHTMLAttributes } from 'react';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
};

export default function AppTextarea({
  label,
  className = '',
  ...props
}: Props) {
  return (
    <label className="block space-y-2">
      {label ? <span className="text-sm text-white/75">{label}</span> : null}
      <textarea
        className={[
          'min-h-40 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500',
          'focus:border-blue-400/60 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.12)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
    </label>
  );
}
