import type { HTMLAttributes, ReactNode } from 'react'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'

type DropdownMenuContextValue = {
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null)

function useDropdownMenuContext() {
  const value = useContext(DropdownMenuContext)
  if (!value) {
    throw new Error('DropdownMenu components must be used within <DropdownMenu>.')
  }
  return value
}

export function DropdownMenu({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  return (
    <DropdownMenuContext.Provider value={{ triggerRef }}>
      <div className={cn('relative inline-flex', className)} {...props}>
        {children}
      </div>
    </DropdownMenuContext.Provider>
  )
}

export function DropdownMenuTrigger({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLButtonElement>) {
  const { triggerRef } = useDropdownMenuContext()
  return (
    <button ref={triggerRef} type="button" className={cn('inline-flex', className)} {...props}>
      {children}
    </button>
  )
}

export function DropdownMenuContent({
  open,
  className,
  children,
}: HTMLAttributes<HTMLDivElement> & { open: boolean }) {
  const { triggerRef } = useDropdownMenuContext()
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !contentRef.current) {
      return
    }

    const updatePosition = () => {
      if (!triggerRef.current || !contentRef.current) {
        return
      }
      const triggerRect = triggerRef.current.getBoundingClientRect()
      const contentRect = contentRef.current.getBoundingClientRect()
      const nextLeft = Math.max(12, triggerRect.right - contentRect.width)
      const nextTop = triggerRect.bottom + 8
      setPosition({ top: nextTop, left: nextLeft })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, triggerRef])

  if (!open) {
    return null
  }
  return createPortal(
    <div
      ref={contentRef}
      className={cn(
        'duokai-scrollbar fixed z-[90] min-w-[180px] rounded-2xl border border-[var(--duokai-border)] bg-[var(--duokai-surface)] p-1 shadow-xl',
        className,
      )}
      style={
        position
          ? {
              top: position.top,
              left: position.left,
            }
          : {
              top: -9999,
              left: -9999,
            }
      }
    >
      {children}
    </div>,
    document.body,
  )
}

export function DropdownMenuItem({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-[var(--duokai-text-muted)] hover:bg-[var(--duokai-surface-muted)] hover:text-[var(--duokai-text)]',
        className,
      )}
      {...props}
    />
  )
}

export function useDropdownMenuState(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return { open, setOpen, ref }
}
