'use client';

import type { TextareaHTMLAttributes } from 'react';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
};

export default function AppTextarea({ label, className = '', id, ...props }: Props) {
  const textareaId = id || props.name;

  return (
    <div className="space-y-2">
      {label ? (
        <label className="text-sm text-white/75" htmlFor={textareaId}>
          {label}
        </label>
      ) : null}
      <textarea
        id={textareaId}
        className={[
          'min-h-32 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none transition duration-200 placeholder:text-white/35',
          'focus:border-cyan-400/60 focus:bg-neutral-950 focus:shadow-[0_0_0_4px_rgba(34,211,238,0.12)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
    </div>
  );
}
