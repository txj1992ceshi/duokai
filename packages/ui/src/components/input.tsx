import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type MouseEventHandler,
  type ReactNode,
  type ReactElement,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-2xl border border-[var(--duokai-border)] bg-[var(--duokai-surface)] px-4 text-sm text-[var(--duokai-text)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        'placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 focus:ring-offset-slate-50',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-[112px] w-full rounded-2xl border border-[var(--duokai-border)] bg-[var(--duokai-surface)] px-4 py-3 text-sm text-[var(--duokai-text)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        'placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 focus:ring-offset-slate-50',
        className,
      )}
      {...props}
    />
  )
}

type SelectOptionDescriptor = {
  value: string
  label: ReactNode
  disabled: boolean
}

type SelectMenuPosition = {
  top: number
  left: number
  width: number
}

function flattenSelectOptions(children: ReactNode): SelectOptionDescriptor[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) {
      return []
    }
    if (child.type !== 'option') {
      return []
    }
    const option = child as ReactElement<{ value?: string; disabled?: boolean; children?: ReactNode }>
    return [
      {
        value: String(option.props.value ?? ''),
        label: option.props.children,
        disabled: Boolean(option.props.disabled),
      },
    ]
  })
}

function buildSyntheticChangeEvent(value: string) {
  return {
    target: { value },
    currentTarget: { value },
  } as unknown as Parameters<NonNullable<SelectHTMLAttributes<HTMLSelectElement>['onChange']>>[0]
}

function getNextEnabledIndex(
  options: SelectOptionDescriptor[],
  startIndex: number,
  direction: 1 | -1,
): number {
  if (options.length === 0) {
    return -1
  }

  let index = startIndex
  for (let attempt = 0; attempt < options.length; attempt += 1) {
    index = (index + direction + options.length) % options.length
    if (!options[index]?.disabled) {
      return index
    }
  }

  return startIndex
}

export function Select({
  className,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  name,
  required,
  onBlur,
  onFocus,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = useMemo(() => flattenSelectOptions(children), [children])
  const isControlled = typeof value !== 'undefined'
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? ''))
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuPositionRef = useRef<SelectMenuPosition | null>(null)

  const currentValue = isControlled ? String(value ?? '') : internalValue
  const selectedOption =
    options.find((option) => option.value === currentValue) ??
    options.find((option) => option.value === String(defaultValue ?? '')) ??
    options[0] ??
    null

  const selectedIndex = selectedOption ? options.findIndex((option) => option.value === selectedOption.value) : -1

  useEffect(() => {
    if (isControlled) {
      return
    }
    if (!options.some((option) => option.value === internalValue)) {
      setInternalValue(options[0]?.value ?? '')
    }
  }, [internalValue, isControlled, options])

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const updateMenuPosition = () => {
      if (!triggerRef.current || !menuRef.current) {
        return
      }
      const rect = triggerRef.current.getBoundingClientRect()
      const nextPosition = {
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      }
      menuPositionRef.current = nextPosition
      menuRef.current.style.top = `${nextPosition.top}px`
      menuRef.current.style.left = `${nextPosition.left}px`
      menuRef.current.style.width = `${nextPosition.width}px`
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const fallbackIndex = options.findIndex((option) => !option.disabled)
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : fallbackIndex)
  }, [open, options, selectedIndex])

  const selectValue = (nextValue: string) => {
    if (!isControlled) {
      setInternalValue(nextValue)
    }
    onChange?.(buildSyntheticChangeEvent(nextValue))
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      setHighlightedIndex((current) =>
        getNextEnabledIndex(options, current < 0 ? selectedIndex : current, event.key === 'ArrowDown' ? 1 : -1),
      )
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const option = options[highlightedIndex]
      if (option && !option.disabled) {
        selectValue(option.value)
      }
      return
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  const triggerClasses = cn(
    'flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--duokai-border)_100%,var(--duokai-text-muted)_20%)] bg-[color-mix(in_srgb,var(--duokai-surface)_86%,var(--duokai-surface-muted)_14%)] px-4 text-left text-sm text-[var(--duokai-text)] shadow-[0_1px_2px_rgba(15,23,42,0.06),inset_0_0_0_1px_rgba(255,255,255,0.03)] transition-[border-color,box-shadow,background-color]',
    open
      ? 'border-blue-500 bg-[var(--duokai-surface-elevated)] shadow-[0_0_0_1px_rgba(59,130,246,0.28),0_0_0_4px_rgba(59,130,246,0.1)]'
      : 'hover:border-[color-mix(in_srgb,var(--duokai-border)_100%,var(--duokai-text-muted)_32%)] hover:bg-[var(--duokai-surface-elevated)]',
    'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 focus:ring-offset-slate-50',
    disabled ? 'cursor-not-allowed bg-[var(--duokai-surface-muted)] text-[var(--duokai-text-muted)]' : 'cursor-pointer',
    className,
  )

  const forwardedProps = props as Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onCopy'>
  const triggerMouseProps = forwardedProps as {
    id?: string
    title?: string
    tabIndex?: number
    'aria-label'?: string
    'aria-labelledby'?: string
    'data-testid'?: string
    onMouseEnter?: MouseEventHandler<HTMLButtonElement>
    onMouseLeave?: MouseEventHandler<HTMLButtonElement>
  }

  return (
    <>
      <div className="relative w-full">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          id={triggerMouseProps.id}
          title={triggerMouseProps.title}
          tabIndex={triggerMouseProps.tabIndex}
          aria-label={triggerMouseProps['aria-label']}
          aria-labelledby={triggerMouseProps['aria-labelledby']}
          data-testid={triggerMouseProps['data-testid']}
          className={triggerClasses}
          onBlur={onBlur as never}
          onFocus={onFocus as never}
          onMouseEnter={triggerMouseProps.onMouseEnter}
          onMouseLeave={triggerMouseProps.onMouseLeave}
          onClick={() => {
            if (!disabled) {
              if (!open && triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect()
                menuPositionRef.current = {
                  top: rect.bottom + 8,
                  left: rect.left,
                  width: rect.width,
                }
              }
              setOpen((current) => !current)
            }
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className="min-w-0 flex-1 truncate">{selectedOption?.label ?? ''}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open ? 'rotate-180' : '')}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 7.5 10 12.5 15 7.5" />
          </svg>
        </button>
        {name ? <input type="hidden" name={name} value={currentValue} required={required} /> : null}
      </div>
      {open && menuPositionRef.current && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-disabled={disabled}
              className="duokai-scrollbar fixed z-[80] max-h-64 overflow-auto rounded-2xl border border-[var(--duokai-border)] bg-[var(--duokai-surface)] p-1 shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
              style={{
                top: menuPositionRef.current.top,
                left: menuPositionRef.current.left,
                width: menuPositionRef.current.width,
              }}
            >
              {options.map((option, index) => {
                const isSelected = option.value === currentValue
                const isHighlighted = index === highlightedIndex
                return (
                  <button
                    key={`${option.value}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    className={cn(
                      'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition-colors',
                      option.disabled
                        ? 'cursor-not-allowed text-slate-300'
                        : isSelected
                            ? 'bg-blue-50 text-blue-700'
                          : isHighlighted
                            ? 'bg-[var(--duokai-surface-muted)] text-[var(--duokai-text)]'
                            : 'text-[var(--duokai-text)] hover:bg-[var(--duokai-surface-muted)] hover:text-[var(--duokai-text)]',
                    )}
                    onMouseEnter={() => {
                      if (!option.disabled) {
                        setHighlightedIndex(index)
                      }
                    }}
                    onClick={() => {
                      if (!option.disabled) {
                        selectValue(option.value)
                      }
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {isSelected ? (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        className="h-4 w-4 shrink-0 text-blue-600"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m5.5 10 3 3 6-6" />
                      </svg>
                    ) : null}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
