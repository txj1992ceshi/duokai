import type { ButtonHTMLAttributes } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '../lib/cn'
import { UI_BUTTON_HOVER, UI_BUTTON_TAP } from '../lib/motion'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--duokai-primary)] text-white shadow-sm hover:bg-[var(--duokai-primary-strong)]',
  secondary:
    'border border-[var(--duokai-border)] bg-[var(--duokai-button-secondary)] text-[var(--duokai-text)] hover:bg-[var(--duokai-button-secondary-hover)]',
  ghost:
    'border border-transparent bg-[var(--duokai-button-ghost)] text-[var(--duokai-text-muted)] hover:bg-[var(--duokai-button-ghost-hover)] hover:text-[var(--duokai-text)]',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-[var(--duokai-control-height-sm)] px-[var(--duokai-control-px-sm)] text-[calc(0.875rem*var(--duokai-font-scale))]',
  md: 'h-[var(--duokai-control-height-md)] px-[var(--duokai-control-px-md)] text-[calc(0.875rem*var(--duokai-font-scale))]',
  lg: 'h-[var(--duokai-control-height-lg)] px-[var(--duokai-control-px-lg)] text-[calc(0.875rem*var(--duokai-font-scale))]',
  icon: 'h-[var(--duokai-control-height-md)] w-[var(--duokai-control-height-md)] p-0',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({
  className,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  const prefersReducedMotion = useReducedMotion()
  const motionProps = props as Record<string, unknown>
  return (
    <motion.button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--duokai-radius-md)] font-medium transition-[background-color,color,border-color,box-shadow,transform] disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--duokai-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--duokai-surface)]',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      whileHover={props.disabled || prefersReducedMotion ? undefined : UI_BUTTON_HOVER}
      whileTap={props.disabled || prefersReducedMotion ? undefined : UI_BUTTON_TAP}
      {...motionProps}
    />
  )
}
