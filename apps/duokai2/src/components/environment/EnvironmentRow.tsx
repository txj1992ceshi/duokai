import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@duokai/ui'
import { AnimatePresence } from 'framer-motion'
import { motion } from 'framer-motion'
import { MoreHorizontal, Pencil, Play, Square, Copy, ArrowRightLeft, ChevronDown, ChevronUp } from 'lucide-react'
import type { EnvironmentListItem } from '../../lib/desktop-types'
import { EXPANDABLE_TRANSITION, EXPANDABLE_VARIANTS } from '../../lib/motion'

function StatusBadge({
  status,
  launchPhaseLabel,
  isLaunching,
  labels,
}: {
  status: EnvironmentListItem['status']
  launchPhaseLabel: string
  isLaunching: boolean
  labels: {
    running: string
    error: string
    idle: string
    stopped: string
  }
}) {
  const tone = isLaunching
    ? 'primary'
    : status === 'running'
      ? 'success'
      : status === 'error'
        ? 'danger'
        : 'neutral'

  const label = isLaunching
    ? launchPhaseLabel
    : status === 'running'
      ? labels.running
      : status === 'error'
        ? labels.error
        : status === 'idle'
          ? labels.idle
          : labels.stopped

  return (
    <Badge tone={tone} className="px-3 py-1.5 text-xs">
      <span
        className={`h-2 w-2 rounded-full ${
          status === 'running'
            ? 'bg-emerald-500 animate-[duokai-breathe_1.3s_ease-in-out_infinite]'
            : isLaunching
              ? 'bg-blue-500 animate-pulse'
              : status === 'error'
                ? 'bg-rose-500'
                : 'bg-slate-400'
        }`}
      />
      {label}
    </Badge>
  )
}

function getStorageBadgeTone(statusClassName: NonNullable<EnvironmentListItem['storage']>['className']) {
  switch (statusClassName) {
    case 'synced':
      return {
        container: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
        label: 'text-emerald-700',
        detail: 'text-emerald-600',
      }
    case 'error':
      return {
        container: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
        label: 'text-rose-700',
        detail: 'text-rose-600',
      }
    case 'conflict':
      return {
        container: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
        label: 'text-amber-700',
        detail: 'text-amber-600',
      }
    case 'pending':
      return {
        container: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
        label: 'text-blue-700',
        detail: 'text-blue-600',
      }
    default:
      return {
        container: 'bg-slate-100 text-slate-500',
        label: 'text-slate-700',
        detail: 'text-slate-500',
      }
  }
}

export function EnvironmentRow({
  item,
  expanded,
  selected,
  onToggleSelect,
  onToggleExpanded,
  onEdit,
  onClone,
  onLaunch,
  onStop,
  onMoveToNurture,
  onMoveToOperation,
}: {
  item: EnvironmentListItem
  expanded: boolean
  selected: boolean
  onToggleSelect: () => void
  onToggleExpanded: () => void
  onEdit: () => void
  onClone: () => void
  onLaunch: () => void
  onStop: () => void
  onMoveToNurture: () => void
  onMoveToOperation: () => void
}) {
  const { t } = useTranslation('desktop')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const canStop = item.status === 'running' || item.status === 'queued' || item.status === 'starting'
  const actionLabel = canStop
    ? t('environment.row.actions.stop')
    : item.status === 'error'
      ? t('environment.row.actions.retryLaunch')
      : t('environment.row.actions.launch')
  const actionIcon = useMemo(() => (canStop ? <Square size={16} /> : <Play size={16} />), [canStop])
  const copy =
    t('common.backToCenter') === '返回环境中心'
      ? {
          details: '详情',
          collapse: '收起',
        }
      : {
          details: 'Details',
          collapse: 'Collapse',
        }

  const storageTone = item.storage ? getStorageBadgeTone(item.storage.className) : null

  useEffect(() => {
    if (!menuOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [menuOpen])

  return (
    <div
      className="border-b border-slate-100 bg-white px-4 py-3 hover:bg-blue-50/50"
    >
      <div className={`flex flex-wrap gap-4 ${expanded ? 'items-start' : 'items-center'}`}>
        <div className={`flex min-w-0 flex-1 gap-4 ${expanded ? 'items-start' : 'items-center'}`}>
          <Checkbox checked={selected} onChange={onToggleSelect} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="truncate text-sm font-semibold text-slate-900">{item.name}</div>
              <Badge className="shrink-0 bg-slate-100 font-mono uppercase text-slate-500">{item.idLabel}</Badge>
              <Badge tone="primary" className="shrink-0">{item.proxyLabel}</Badge>
              <Badge className="shrink-0">{item.groupLabel}</Badge>
            </div>
            <div className="mt-1 line-clamp-1 text-sm text-slate-500">{item.summary}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>{item.lifecycle}</span>
              <span>{item.tagLabel}</span>
              {item.storage ? (
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] ${storageTone?.container || ''}`}>
                  <span className={`font-medium ${storageTone?.label || ''}`}>{item.storage.label}</span>
                  <span className={storageTone?.detail || ''}>{item.storage.detail}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className={`ml-auto flex shrink-0 flex-wrap justify-end gap-2 ${expanded ? 'items-start pt-1' : 'items-center self-center'}`}>
          <Button variant="ghost" size="sm" onClick={onToggleExpanded}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {expanded ? copy.collapse : copy.details}
          </Button>
          <StatusBadge
            status={item.status}
            launchPhaseLabel={item.launchPhaseLabel}
            isLaunching={item.isLaunching}
            labels={{
              running: t('environment.row.status.running'),
              error: t('environment.row.status.error'),
              idle: t('environment.row.status.idle'),
              stopped: t('environment.row.status.stopped'),
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-500"
            onClick={onEdit}
            aria-label={t('environment.row.actions.editAria')}
          >
            <Pencil size={16} />
          </Button>
          <Button
            variant={canStop ? 'danger' : 'primary'}
            size="sm"
            className="min-w-[96px]"
            onClick={canStop ? onStop : onLaunch}
          >
            {actionIcon}
            {actionLabel}
          </Button>
          <div ref={menuRef}>
            <DropdownMenu>
            <DropdownMenuTrigger
              className="h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              onClick={() => setMenuOpen((current) => !current)}
            >
              <MoreHorizontal size={18} />
            </DropdownMenuTrigger>
            <AnimatePresence>
              <DropdownMenuContent open={menuOpen}>
                <DropdownMenuItem
                  onClick={() => {
                    setMenuOpen(false)
                    onClone()
                  }}
                >
                  <Copy size={14} />
                  <span className="ml-2">{t('environment.row.actions.clone')}</span>
                </DropdownMenuItem>
                {item.canMoveToNurture ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setMenuOpen(false)
                      onMoveToNurture()
                    }}
                  >
                    <ArrowRightLeft size={14} />
                    <span className="ml-2">{t('environment.row.actions.moveToNurture')}</span>
                  </DropdownMenuItem>
                ) : null}
                {item.canMoveToOperation ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setMenuOpen(false)
                      onMoveToOperation()
                    }}
                  >
                    <ArrowRightLeft size={14} />
                    <span className="ml-2">{t('environment.row.actions.moveToOperation')}</span>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </AnimatePresence>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="details"
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={EXPANDABLE_VARIANTS}
            transition={EXPANDABLE_TRANSITION}
            className="overflow-hidden border-t border-slate-100 pt-4"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Identity</div>
            <div className="mt-2 text-sm text-slate-700">{item.identity}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Locale</div>
            <div className="mt-2 text-sm text-slate-700">{item.locale}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Hardware</div>
            <div className="mt-2 text-sm text-slate-700">{item.hardware}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Lifecycle</div>
            <div className="mt-2 text-sm text-slate-700">{item.lifecycle}</div>
          </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
