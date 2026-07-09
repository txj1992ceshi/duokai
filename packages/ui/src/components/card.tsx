import type { HTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--duokai-radius-xl)] border border-[var(--duokai-border)] bg-[var(--duokai-surface-glass)] shadow-[var(--duokai-shadow-md)] backdrop-blur-xl',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-[calc(16px*var(--duokai-layout-scale))] p-[var(--duokai-card-padding)] pb-0', className)} {...props} />
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('m-0 text-[calc(1.125rem*var(--duokai-font-scale))] font-semibold text-[var(--duokai-text)]', className)} {...props} />
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('m-0 text-[calc(0.875rem*var(--duokai-font-scale))] text-[var(--duokai-text-muted)]', className)} {...props} />
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-[var(--duokai-card-padding)]', className)} {...props} />
}
