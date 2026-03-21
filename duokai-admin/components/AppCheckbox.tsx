'use client';

import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string;
};

export default function AppCheckbox({ label, className = '', id, ...props }: Props) {
  const inputId = id || props.name;

  return (
    <label
      htmlFor={inputId}
      className={`inline-flex items-center gap-2 text-sm text-neutral-200 ${className}`.trim()}
    >
      <input
        id={inputId}
        type="checkbox"
        className="h-4 w-4 rounded border border-neutral-600 bg-neutral-950 text-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
        {...props}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}
