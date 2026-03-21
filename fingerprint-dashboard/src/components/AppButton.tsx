'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
};

const variantClassMap: Record<Variant, string> = {
  primary:
    'bg-blue-500 text-white hover:-translate-y-0.5 hover:bg-blue-400 shadow-lg shadow-blue-500/20',
  secondary:
    'border border-slate-700 bg-slate-900/80 text-slate-100 hover:border-slate-500 hover:bg-slate-800/80',
  ghost:
    'text-slate-300 hover:bg-slate-800/70 hover:text-white',
  danger:
    'border border-red-500/20 bg-red-500/10 text-red-300 hover:border-red-400/40 hover:bg-red-500/15',
};

const sizeClassMap: Record<Size, string> = {
  sm: 'h-10 px-3 text-sm font-medium rounded-xl',
  md: 'h-11 px-4 text-sm font-semibold rounded-xl',
  lg: 'h-14 px-4 text-base font-semibold rounded-2xl',
};

export default function AppButton({
  children,
  className = '',
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center transition duration-200 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60',
        variantClassMap[variant],
        sizeClassMap[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </button>
  );
}
