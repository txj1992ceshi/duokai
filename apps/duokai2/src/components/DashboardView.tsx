import { Badge, Card } from '@duokai/ui'
import { translateLogCategory, type Dictionary, type LocaleCode } from '../i18n'
import type {
  CloudPhoneProviderHealth,
  LogEntry,
  RuntimeHostInfo,
  RuntimeStatus,
  TemplateRecord,
} from '../shared/types'

type LatestNetworkCheck = {
  profileName: string
  success: boolean | null
  ip: string
  country: string
  timezone: string
  message: string
  checkedAt: string
} | null

type SummaryCardItem = {
  label: string
  value: string | number
  detail: string
}

export function DashboardView({
  locale,
  t,
  summary,
  templates,
  defaultCloudPhoneProvider,
  defaultCloudPhoneProviderHealth,
  directoryInfo,
  runtimeHostInfo,
  runtimeStatus,
  latestNetworkCheck,
  logs,
  renderProviderLabel,
  formatDate,
}: {
  locale: LocaleCode
  t: Dictionary
  summary: {
    totalProfiles: number
    runningProfiles: number
    totalProxies: number
    onlineProxies: number
    totalCloudPhones: number
    runningCloudPhones: number
  }
  templates: TemplateRecord[]
  defaultCloudPhoneProvider: string
  defaultCloudPhoneProviderHealth: CloudPhoneProviderHealth | null
  directoryInfo: {
    chromiumExecutable?: string
  } | null
  runtimeHostInfo: RuntimeHostInfo | null
  runtimeStatus: RuntimeStatus | null
  latestNetworkCheck: LatestNetworkCheck
  logs: LogEntry[]
  renderProviderLabel: (providerKey: string) => string
  formatDate: (value: string | null) => string
}) {
  const copy =
    locale === 'zh-CN'
      ? {
          runtimeHost: '运行宿主',
          fallback: '降级',
          running: '运行中',
          queued: '排队',
          networkCheck: '网络检查',
          failed: '失败',
          ready: '正常',
          unresolved: '未解析',
          unknownCountry: '未知地区',
          timezonePending: '未生成时区',
          latestNetworkCheckHint: '最近一次代理/出口检查结果。',
        }
      : {
          runtimeHost: 'Runtime host',
          fallback: 'Fallback',
          running: 'Running',
          queued: 'Queued',
          networkCheck: 'Network check',
          failed: 'Failed',
          ready: 'Ready',
          unresolved: 'unresolved',
          unknownCountry: 'unknown',
          timezonePending: 'timezone pending',
          latestNetworkCheckHint: 'Latest proxy/egress check result.',
        }

  const summaryCards: SummaryCardItem[] = [
    {
      label: t.dashboard.profiles,
      value: summary.totalProfiles,
      detail: t.common.activeNow(summary.runningProfiles),
    },
    {
      label: t.dashboard.proxies,
      value: summary.totalProxies,
      detail: `${summary.onlineProxies} ${t.common.healthy}`,
    },
    {
      label: t.dashboard.templates,
      value: templates.length,
      detail: t.profiles.fromTemplate,
    },
    {
      label: t.cloudPhones.title,
      value: summary.totalCloudPhones,
      detail: t.common.activeNow(summary.runningCloudPhones),
    },
    {
      label: t.cloudPhones.defaultProviderHealth,
      value: defaultCloudPhoneProviderHealth
        ? defaultCloudPhoneProviderHealth.available
          ? t.common.ready
          : t.common.missing
        : t.common.loading,
      detail: defaultCloudPhoneProviderHealth?.message ?? renderProviderLabel(defaultCloudPhoneProvider),
    },
    {
      label: t.dashboard.chromium,
      value: directoryInfo?.chromiumExecutable ? t.common.ready : t.common.missing,
      detail: directoryInfo?.chromiumExecutable ?? t.dashboard.installChromium,
    },
  ]

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((item) => (
          <Card key={item.label} className="rounded-[24px] border border-slate-200 shadow-none">
            <div className="space-y-3 p-5">
              <div className="text-sm font-medium text-slate-500">{item.label}</div>
              <div className="text-3xl font-semibold tracking-tight text-slate-950">{item.value}</div>
              <div className="text-sm text-slate-500">{item.detail}</div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="rounded-[24px] border border-slate-200 shadow-none">
          <div className="space-y-4 p-5">
            <div>
              <div className="text-sm font-medium text-slate-500">{copy.runtimeHost}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={runtimeHostInfo?.available ? 'success' : 'warning'}>
                  {runtimeHostInfo
                    ? runtimeHostInfo.available
                      ? runtimeHostInfo.label
                      : copy.fallback
                    : t.common.loading}
                </Badge>
                <Badge tone="neutral">
                  {copy.running} {runtimeStatus?.runningProfileIds.length ?? 0}
                </Badge>
                <Badge tone="primary">
                  {copy.queued} {runtimeStatus?.queuedProfileIds.length ?? 0}
                </Badge>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              {runtimeHostInfo?.reason ?? t.common.loading}
            </div>
          </div>
        </Card>

        <Card className="rounded-[24px] border border-slate-200 shadow-none">
          <div className="space-y-4 p-5">
            <div>
              <div className="text-sm font-medium text-slate-500">{copy.networkCheck}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge
                  tone={
                    !latestNetworkCheck
                      ? 'neutral'
                      : latestNetworkCheck.success === false
                        ? 'danger'
                        : 'success'
                  }
                >
                  {!latestNetworkCheck
                    ? t.common.loading
                    : latestNetworkCheck.success === false
                      ? copy.failed
                      : copy.ready}
                </Badge>
                {latestNetworkCheck?.checkedAt ? (
                  <span className="text-xs text-slate-400">{formatDate(latestNetworkCheck.checkedAt)}</span>
                ) : null}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              {latestNetworkCheck
                ? `${latestNetworkCheck.profileName} · ${
                    latestNetworkCheck.ip || copy.unresolved
                  } · ${
                    latestNetworkCheck.country || copy.unknownCountry
                  } · ${
                    latestNetworkCheck.timezone || copy.timezonePending
                  }`
                : copy.latestNetworkCheckHint}
            </div>
          </div>
        </Card>
      </div>

      <Card className="rounded-[28px] border border-slate-200 shadow-none">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="m-0 text-lg font-semibold text-slate-950">{t.dashboard.recentLogs}</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {logs.slice(0, 8).map((entry) => (
            <div
              key={entry.id}
              className="grid gap-2 px-5 py-4 md:grid-cols-[180px_minmax(0,1fr)_180px] md:items-center"
            >
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
                {translateLogCategory(locale, entry.category)}
              </div>
              <div className="text-sm text-slate-700">{entry.message}</div>
              <div className="text-xs text-slate-400 md:text-right">{formatDate(entry.createdAt)}</div>
            </div>
          ))}
          {logs.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-slate-500">{t.dashboard.noLogs}</div>
          ) : null}
        </div>
      </Card>
    </section>
  )
}
