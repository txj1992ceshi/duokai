import type { HTMLAttributes, ReactNode } from 'react'
import { createContext, useContext, useMemo } from 'react'
import { cn } from '../lib/cn'

type TabsContextValue = {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const value = useContext(TabsContext)
  if (!value) {
    throw new Error('Tabs components must be used within <Tabs>.')
  }
  return value
}

export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
  className?: string
}) {
  const context = useMemo(() => ({ value, onValueChange }), [onValueChange, value])
  return (
    <TabsContext.Provider value={context}>
      <div className={cn('flex min-h-0 flex-col gap-[calc(16px*var(--duokai-layout-scale))]', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'inline-flex w-full gap-[calc(8px*var(--duokai-layout-scale))] rounded-[var(--duokai-radius-md)] border border-[var(--duokai-border)] bg-[color-mix(in_srgb,var(--duokai-surface-muted)_86%,var(--duokai-surface)_14%)] p-[calc(4px*var(--duokai-layout-scale))] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  value,
  className,
  children,
}: HTMLAttributes<HTMLButtonElement> & { value: string }) {
  const tabs = useTabsContext()
  const active = tabs.value === value
  return (
    <button
      type="button"
      className={cn(
        'flex-1 rounded-[var(--duokai-radius-sm)] px-[var(--duokai-control-px-sm)] py-[calc(8px*var(--duokai-layout-scale))] text-[calc(0.875rem*var(--duokai-font-scale))] font-medium transition-[background-color,color,box-shadow,transform]',
        active
          ? 'bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'text-[var(--duokai-text-muted)] hover:bg-[var(--duokai-surface)] hover:text-[var(--duokai-text)]',
        className,
      )}
      onClick={() => tabs.onValueChange(value)}
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { value: string }) {
  const tabs = useTabsContext()
  if (tabs.value !== value) {
    return null
  }
  return <div className={cn('animate-[duokai-fade-in_0.18s_ease-out]', className)} {...props} />
}
