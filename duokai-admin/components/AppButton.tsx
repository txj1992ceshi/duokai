'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
};

const variantClassMap: Record<Variant, string> = {
  primary:
    'bg-white text-black hover:-translate-y-0.5 hover:bg-neutral-100 active:translate-y-0',
  secondary:
    'border border-neutral-700 bg-transparent text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800/70',
  danger:
    'border border-red-900 bg-red-950/30 text-red-300 hover:border-red-700 hover:bg-red-950/50',
  ghost:
    'bg-transparent text-neutral-300 hover:bg-neutral-800/60 hover:text-white',
};

const sizeClassMap: Record<Size, string> = {
  sm: 'h-9 rounded-lg px-3 text-sm',
  md: 'h-10 rounded-xl px-4 text-sm',
  lg: 'h-14 rounded-2xl px-4 text-base',
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
        'inline-flex items-center justify-center font-medium transition duration-200 disabled:cursor-not-allowed disabled:opacity-50',
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
