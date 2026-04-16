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
import { AnimatePresence, motion } from 'framer-motion'
import { MoreHorizontal, Play, Square, Copy, ArrowRightLeft, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import type { EnvironmentListItem } from '../../lib/desktop-types'
import { EXPANDABLE_TRANSITION, EXPANDABLE_VARIANTS } from '../../lib/motion'

function StatusBadge({
  status,
  statusTone,
  launchPhaseLabel,
  isLaunching,
  labels,
}: {
  status: EnvironmentListItem['status']
  statusTone?: EnvironmentListItem['statusTone']
  launchPhaseLabel: string
  isLaunching: boolean
  labels: {
    running: string
    error: string
    blocked: string
    idle: string
    stopped: string
  }
}) {
  const isStoppedState = status === 'idle' || status === 'stopped'
  const tone = isLaunching
    ? 'primary'
    : status === 'running'
      ? 'success'
      : statusTone === 'blocked'
        ? 'danger'
        : status === 'error'
          ? 'warning'
        : isStoppedState
          ? 'warning'
          : 'neutral'

  const label = isLaunching
    ? launchPhaseLabel
    : status === 'running'
      ? labels.running
      : statusTone === 'blocked'
        ? labels.blocked
        : status === 'error'
          ? labels.error
        : status === 'idle'
          ? labels.idle
          : labels.stopped

  return (
    <Badge
      tone={tone}
      className={`justify-center px-4 py-2 text-sm ${isStoppedState ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/55 dark:text-amber-200 dark:ring-amber-900/80' : ''}`}
    >
      <span
        className={`rounded-full ${
          status === 'running'
            ? 'h-2.5 w-2.5 bg-emerald-500 animate-[duokai-breathe_1.3s_ease-in-out_infinite]'
            : isLaunching
              ? 'h-2.5 w-2.5 bg-blue-500 animate-pulse'
              : statusTone === 'blocked'
                ? 'h-2.5 w-2.5 bg-rose-500'
                : status === 'error'
                  ? 'h-2.5 w-2.5 bg-amber-500'
                : 'h-3.5 w-3.5 bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.22)] dark:bg-amber-300 dark:shadow-[0_0_0_4px_rgba(251,191,36,0.14)]'
        }`}
      />
      {label}
    </Badge>
  )
}

function getSyncBadgeTone(statusClassName: NonNullable<EnvironmentListItem['sync']>['className']) {
  switch (statusClassName) {
    case 'synced':
      return {
        container:
          'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/55 dark:text-emerald-200 dark:ring-emerald-900/80',
        label: 'text-emerald-700 dark:text-emerald-200',
        detail: 'text-emerald-600 dark:text-emerald-300',
      }
    case 'error':
      return {
        container:
          'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/55 dark:text-rose-200 dark:ring-rose-900/80',
        label: 'text-rose-700 dark:text-rose-200',
        detail: 'text-rose-600 dark:text-rose-300',
      }
    case 'conflict':
      return {
        container:
          'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/55 dark:text-amber-200 dark:ring-amber-900/80',
        label: 'text-amber-700 dark:text-amber-200',
        detail: 'text-amber-600 dark:text-amber-300',
      }
    case 'pending':
    case 'syncing':
      return {
        container:
          'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/55 dark:text-blue-200 dark:ring-blue-900/80',
        label: 'text-blue-700 dark:text-blue-200',
        detail: 'text-blue-600 dark:text-blue-300',
      }
    default:
      return {
        container:
          'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-slate-800/90 dark:text-slate-300 dark:ring-slate-700/80',
        label: 'text-slate-700 dark:text-slate-200',
        detail: 'text-slate-500 dark:text-slate-400',
      }
  }
}

function getMetaBadgeClasses(kind: EnvironmentListItem['metaBadges'][number]['key']) {
  switch (kind) {
    case 'proxy':
      return 'bg-blue-50/90 text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/55 dark:text-blue-200 dark:ring-blue-900/80'
    case 'purpose':
      return 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-800/90 dark:text-slate-200 dark:ring-slate-700/80'
    default:
      return 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-slate-800/90 dark:text-slate-300 dark:ring-slate-700/80'
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
  onUploadConfig,
  onPullConfig,
  onUploadStorageState,
  onPullStorageState,
  onLaunch,
  onStop,
  onDelete,
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
  onUploadConfig: () => void
  onPullConfig: () => void
  onUploadStorageState: () => void
  onPullStorageState: () => void
  onLaunch: () => void
  onStop: () => void
  onDelete: () => void
  onMoveToNurture: () => void
  onMoveToOperation: () => void
}) {
  const { t } = useTranslation('desktop')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const canStop = item.status === 'running' || item.status === 'queued' || item.status === 'starting'
  const launchBlocked = item.status === 'error' && item.statusTone === 'blocked'
  const actionLabel = canStop
    ? t('environment.row.actions.stop')
    : item.status === 'error'
      ? t('environment.row.actions.retryLaunch')
      : t('environment.row.actions.launch')
  const actionIcon = useMemo(() => (canStop ? <Square size={16} /> : <Play size={16} />), [canStop])
  const syncTone = item.sync ? getSyncBadgeTone(item.sync.className) : null

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
    <div className="border-b border-slate-100 bg-white px-4 py-3 hover:bg-blue-50/50">
      <div className={`flex flex-wrap gap-4 ${expanded ? 'items-start' : 'items-center'}`}>
        <div className={`flex min-w-0 flex-1 gap-4 ${expanded ? 'items-start' : 'items-center'}`}>
          <Checkbox checked={selected} onChange={onToggleSelect} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-900">{item.name}</div>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
              {item.metaBadges.map((badge) => (
                <span
                  key={badge.key}
                  className={`inline-flex h-7 items-center rounded-full px-3 text-[11px] font-medium ${
                    badge.key === 'id' ? 'font-mono uppercase' : ''
                  } ${getMetaBadgeClasses(badge.key)}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
            {item.sync ? (
              <div className="mt-2">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] ${syncTone?.container || ''}`}
                >
                  <span className={`font-medium ${syncTone?.label || ''}`}>{item.sync.label}</span>
                  <span className={syncTone?.detail || ''}>{item.sync.detail}</span>
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-4 self-center">
          <div className="flex min-h-[92px] min-w-[132px] items-center justify-center self-center">
            <StatusBadge
              status={item.status}
              statusTone={item.statusTone}
              launchPhaseLabel={item.launchPhaseLabel}
              isLaunching={item.isLaunching}
              labels={{
                running: t('environment.row.status.running'),
                error: t('environment.row.status.launchFailed'),
                blocked: t('environment.row.status.blocked'),
                idle: t('environment.row.status.idle'),
                stopped: t('environment.row.status.stopped'),
              }}
            />
          </div>

          <div className="grid grid-cols-[minmax(92px,auto)_minmax(92px,auto)_minmax(104px,auto)_minmax(104px,auto)] grid-rows-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="min-w-[92px] row-start-1 col-start-1"
              onClick={onUploadConfig}
            >
              {t('environment.row.actions.upload')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="min-w-[92px] row-start-2 col-start-1"
              onClick={onEdit}
            >
              {t('environment.row.actions.edit')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="min-w-[92px] row-start-1 col-start-2"
              onClick={onPullConfig}
            >
              {t('environment.row.actions.pull')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-w-[92px] row-start-2 col-start-2"
              onClick={onToggleExpanded}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {expanded ? t('environment.row.actions.collapse') : t('environment.row.actions.details')}
            </Button>
            <Button
              variant={canStop ? 'danger' : launchBlocked ? 'secondary' : 'primary'}
              size="sm"
              className="min-w-[104px] row-span-2 row-start-1 col-start-3 h-full min-h-[92px]"
              onClick={canStop ? onStop : onLaunch}
              disabled={launchBlocked}
            >
              {actionIcon}
              {actionLabel}
            </Button>
            <div ref={menuRef} className="row-span-2 row-start-1 col-start-4">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex h-full min-h-[92px] min-w-[104px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-700/90 dark:hover:text-white"
                  onClick={() => setMenuOpen((current) => !current)}
                >
                  <MoreHorizontal size={16} />
                  {t('environment.row.actions.more')}
                </DropdownMenuTrigger>
                <AnimatePresence>
                  <DropdownMenuContent open={menuOpen}>
                    <DropdownMenuItem
                      onClick={() => {
                        setMenuOpen(false)
                        onUploadStorageState()
                      }}
                    >
                      <ArrowRightLeft size={14} />
                      <span className="ml-2">{t('environment.row.actions.uploadStorageState')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setMenuOpen(false)
                        onPullStorageState()
                      }}
                    >
                      <ArrowRightLeft size={14} />
                      <span className="ml-2">{t('environment.row.actions.pullStorageState')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setMenuOpen(false)
                        onClone()
                      }}
                    >
                      <Copy size={14} />
                      <span className="ml-2">{t('environment.row.actions.clone')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setMenuOpen(false)
                        onDelete()
                      }}
                      className="text-rose-600 focus:text-rose-700 dark:text-rose-300 dark:focus:text-rose-200"
                    >
                      <Trash2 size={14} />
                      <span className="ml-2">{t('environment.row.actions.delete')}</span>
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
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
            </div>
            {item.runtimeSync && item.runtimeSync.length > 0 ? (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {item.runtimeSync.map((entry) => {
                  const tone = getSyncBadgeTone(entry.className)
                  return (
                    <div
                      key={entry.key}
                      className={`rounded-2xl px-4 py-3 ring-1 ring-inset ${tone.container}`}
                    >
                      <div className={`text-[11px] font-medium uppercase tracking-[0.12em] ${tone.label}`}>
                        {entry.label}
                      </div>
                      <div className={`mt-2 text-sm ${tone.detail}`}>{entry.detail}</div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
