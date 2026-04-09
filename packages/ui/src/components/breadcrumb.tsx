import type { HTMLAttributes } from 'react'
import { Fragment } from 'react'
import { cn } from '../lib/cn'

export interface BreadcrumbItem {
  label: string
  current?: boolean
}

export function Breadcrumb({
  items,
  className,
}: HTMLAttributes<HTMLElement> & { items: BreadcrumbItem[] }) {
  return (
    <nav className={cn('flex items-center gap-2 text-sm text-[var(--duokai-text-muted)]', className)} aria-label="Breadcrumb">
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${index}`}>
          {index > 0 ? <span>/</span> : null}
          <span className={cn(item.current ? 'font-semibold text-[var(--duokai-text)]' : '')}>{item.label}</span>
        </Fragment>
      ))}
    </nav>
  )
}
