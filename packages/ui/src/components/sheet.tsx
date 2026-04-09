import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../lib/cn'
import { UI_SHEET_OVERLAY_TRANSITION, UI_SHEET_PANEL_TRANSITION } from '../lib/motion'

export function Sheet({
  open,
  children,
}: {
  open: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}) {
  if (typeof document === 'undefined') {
    return null
  }
  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <>
          {children}
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

export function SheetOverlay({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const style = { WebkitAppRegion: 'no-drag', ...props.style } as CSSProperties
  const motionProps = props as Record<string, unknown>
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={UI_SHEET_OVERLAY_TRANSITION}
      className={cn('fixed inset-0 z-40 bg-slate-950/22', className)}
      {...motionProps}
      style={style}
    />
  )
}

export function SheetContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const style = { WebkitAppRegion: 'no-drag', ...props.style } as CSSProperties
  const motionProps = props as Record<string, unknown>
  return (
    <motion.div
      initial={{ opacity: 0, x: 120, scale: 0.985 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 96, scale: 0.992 }}
      transition={UI_SHEET_PANEL_TRANSITION}
      className={cn(
        'fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col overflow-hidden border-l border-[var(--duokai-border)] bg-[var(--duokai-surface)] shadow-[var(--duokai-shadow-lg)]',
        className,
      )}
      {...motionProps}
      style={style}
    />
  )
}

export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-[var(--duokai-border)] px-5 py-4', className)} {...props} />
}

export function SheetTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('m-0 text-lg font-semibold text-[var(--duokai-text)]', className)} {...props} />
}

export function SheetDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 mb-0 text-sm text-[var(--duokai-text-muted)]', className)} {...props} />
}
