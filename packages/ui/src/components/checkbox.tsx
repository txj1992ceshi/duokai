import type { InputHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export function Checkbox({
  className,
  type = 'checkbox',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        'h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500/30',
        className,
      )}
      {...props}
    />
  )
}
