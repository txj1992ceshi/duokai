import type { NetworkHealthResult } from './networkCheck'
import type { RuntimeEnvironmentHandle } from './containerManager'

export interface NetworkDiagnosticsSummary {
  level: 'ok' | 'warn' | 'block'
  messages: string[]
}

export function buildNetworkDiagnosticsSummary(
  host: RuntimeEnvironmentHandle | null,
  health: NetworkHealthResult,
): NetworkDiagnosticsSummary {
  const messages: string[] = []
  let level: 'ok' | 'warn' = 'ok'

  if (!host) {
    level = 'warn'
    messages.push('Runtime host is not prepared yet.')
  } else if (!host.available) {
    level = 'warn'
    messages.push(host.reason)
  }

  if (!health.ok) {
    level = 'warn'
    messages.push(health.message)
  } else {
    messages.push(`Egress resolved: ${health.ip || 'unknown'} (${health.country || 'unknown'})`)
  }

  return {
    level,
    messages,
  }
}
