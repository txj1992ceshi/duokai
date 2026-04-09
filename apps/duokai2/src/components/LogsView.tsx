import { Badge, Button, Card } from '@duokai/ui'
import {
  translateLogCategory,
  translateLogLevel,
  type Dictionary,
  type LocaleCode,
} from '../i18n'
import i18nClient from '../lib/i18n-client'
import type { LogEntry } from '../shared/types'
import { EmptyState } from './feedback/EmptyState'

export function LogsView({
  locale,
  t,
  logs,
  formatDate,
  onClear,
  onBackToCenter,
}: {
  locale: LocaleCode
  t: Dictionary
  logs: LogEntry[]
  formatDate: (value: string | null) => string
  onClear: () => void
  onBackToCenter: () => void
}) {
  const desktopT = i18nClient.getFixedT(locale, 'desktop')

  return (
    <section className="space-y-6">
      <Card className="rounded-[28px] border border-slate-200 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="m-0 text-xl font-semibold text-slate-950">{t.logs.title}</h2>
            <p className="mt-1 mb-0 text-sm text-slate-500">
              {desktopT('headings.logs.description')}
            </p>
          </div>
          <Button variant="secondary" onClick={onClear}>
            {t.logs.clear}
          </Button>
        </div>
      </Card>

      {logs.length > 0 ? (
        <Card className="rounded-[28px] border border-slate-200 shadow-none">
          <div className="divide-y divide-slate-100">
            {logs.map((entry) => (
              <div
                key={entry.id}
                className="grid gap-3 px-5 py-4 md:grid-cols-[120px_180px_minmax(0,1fr)_180px] md:items-center"
              >
                <Badge
                  tone={
                    entry.level === 'error'
                      ? 'danger'
                      : entry.level === 'warn'
                        ? 'warning'
                        : entry.level === 'info'
                          ? 'primary'
                          : 'neutral'
                  }
                >
                  {translateLogLevel(locale, entry.level)}
                </Badge>
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
                  {translateLogCategory(locale, entry.category)}
                </div>
                <div className="text-sm text-slate-700">{entry.message}</div>
                <div className="text-xs text-slate-400 md:text-right">{formatDate(entry.createdAt)}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          title={desktopT('headings.logs.emptyTitle')}
          description={t.logs.empty}
          actionLabel={desktopT('headings.logs.backToCenter')}
          onAction={onBackToCenter}
        />
      )}
    </section>
  )
}
