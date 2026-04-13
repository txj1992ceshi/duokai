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
          hostNetwork: '\u4e3b\u673a\u7f51\u7edc',
          controlPlane: '\u63a7\u5236\u9762',
          runtimeHost: '\u8fd0\u884c\u5bbf\u4e3b',
          environmentEgress: '\u73af\u5883\u51fa\u53e3\u68c0\u67e5',
          fallback: '\u964d\u7ea7',
          running: '\u8fd0\u884c\u4e2d',
          queued: '\u6392\u961f',
          offline: '\u79bb\u7ebf',
          degraded: '\u964d\u7ea7',
          pendingSync: '\u5f85\u8865\u4f20',
          failed: '\u5931\u8d25',
          ready: '\u6b63\u5e38',
          warning: '\u8b66\u544a',
          unresolved: '\u672a\u89e3\u6790',
          unknownCountry: '\u672a\u77e5\u5730\u533a',
          timezonePending: '\u65f6\u533a\u5f85\u5b9a',
          hostNetworkHint: '\u7b49\u5f85\u4e3b\u673a\u7f51\u7edc\u8bca\u65ad\u7ed3\u679c\u3002',
          latestNetworkCheckHint: '\u6700\u8fd1\u4e00\u6b21\u73af\u5883\u4ee3\u7406\u51fa\u53e3\u68c0\u67e5\u7ed3\u679c\u3002',
        }
      : {
          hostNetwork: 'Host network',
          controlPlane: 'Control plane',
          runtimeHost: 'Runtime host',
          environmentEgress: 'Environment egress',
          fallback: 'Fallback',
          running: 'Running',
          queued: 'Queued',
          offline: 'Offline',
          degraded: 'Degraded',
          pendingSync: 'Pending sync',
          failed: 'Failed',
          ready: 'Ready',
          warning: 'Warning',
          unresolved: 'unresolved',
          unknownCountry: 'unknown',
          timezonePending: 'timezone pending',
          hostNetworkHint: 'Waiting for host network diagnostics.',
          latestNetworkCheckHint: 'Latest environment proxy/egress check result.',
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

  const hostDiagnosticsTone =
    runtimeHostInfo?.networkDiagnostics?.level === 'block'
      ? 'danger'
      : runtimeHostInfo?.networkDiagnostics?.level === 'warn'
        ? 'warning'
        : runtimeHostInfo?.networkDiagnostics
          ? 'success'
          : 'neutral'

  const hostDiagnosticsLabel = !runtimeHostInfo?.networkDiagnostics
    ? t.common.loading
    : runtimeHostInfo.networkDiagnostics.level === 'block'
      ? copy.failed
      : runtimeHostInfo.networkDiagnostics.level === 'warn'
        ? copy.warning
        : copy.ready

  const controlPlaneTone =
    runtimeHostInfo?.controlPlaneStatus === 'offline'
      ? 'danger'
      : runtimeHostInfo?.controlPlaneStatus === 'degraded'
        ? 'warning'
        : 'success'

  const controlPlaneLabel =
    runtimeHostInfo?.controlPlaneStatus === 'offline'
      ? copy.offline
      : runtimeHostInfo?.controlPlaneStatus === 'degraded'
        ? copy.degraded
        : copy.ready

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
              <div className="text-sm font-medium text-slate-500">{copy.hostNetwork}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={hostDiagnosticsTone}>{hostDiagnosticsLabel}</Badge>
                <Badge tone={runtimeHostInfo?.available ? 'success' : 'warning'}>
                  {copy.runtimeHost}{' '}
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
                <Badge tone={controlPlaneTone}>
                  {copy.controlPlane} {controlPlaneLabel}
                </Badge>
                {(runtimeHostInfo?.controlPlanePendingSyncCount ?? 0) > 0 ? (
                  <Badge tone="warning">
                    {copy.pendingSync} {runtimeHostInfo?.controlPlanePendingSyncCount ?? 0}
                  </Badge>
                ) : null}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              {runtimeHostInfo?.controlPlaneStatus && runtimeHostInfo.controlPlaneStatus !== 'online'
                ? `${runtimeHostInfo.controlPlaneLastError || runtimeHostInfo.reason} / ${
                    runtimeHostInfo.controlPlanePendingSyncCount ?? 0
                  } ${copy.pendingSync}`
                : runtimeHostInfo?.networkDiagnostics
                ? `${runtimeHostInfo.networkDiagnostics.message || runtimeHostInfo.reason} / ${
                    runtimeHostInfo.networkDiagnostics.egressIp || copy.unresolved
                  } / ${
                    runtimeHostInfo.networkDiagnostics.country || copy.unknownCountry
                  } / ${
                    runtimeHostInfo.networkDiagnostics.timezone || copy.timezonePending
                  }`
                : runtimeHostInfo?.reason || copy.hostNetworkHint}
            </div>
            {runtimeHostInfo?.networkDiagnostics?.checkedAt ? (
              <div className="text-xs text-slate-400">
                {formatDate(runtimeHostInfo.networkDiagnostics.checkedAt)}
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="rounded-[24px] border border-slate-200 shadow-none">
          <div className="space-y-4 p-5">
            <div>
              <div className="text-sm font-medium text-slate-500">{copy.environmentEgress}</div>
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
                ? `${latestNetworkCheck.profileName} / ${
                    latestNetworkCheck.ip || copy.unresolved
                  } / ${
                    latestNetworkCheck.country || copy.unknownCountry
                  } / ${
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
