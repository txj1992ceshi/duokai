import { execFileSync } from 'node:child_process'
import os from 'node:os'
import type {
  EgressPathType,
  ParentProxyProtocol,
  SettingsPayload,
} from '../../src/shared/types'

export interface ParentProxyConfig {
  protocol: ParentProxyProtocol
  host: string
  port: number
  username?: string
  password?: string
  rawUrl: string
  source?: 'system' | 'env' | 'custom'
}

export interface EgressPathCandidate {
  type: EgressPathType
  label: string
  parentProxy?: ParentProxyConfig
}

function normalizeProtocol(protocol: string): ParentProxyProtocol | null {
  const normalized = protocol.toLowerCase().replace(/:$/, '')
  if (normalized === 'http' || normalized === 'https' || normalized === 'socks5') {
    return normalized
  }
  if (normalized === 'socks5h') {
    return 'socks5'
  }
  return null
}

function withSource(
  proxy: ParentProxyConfig | null,
  source: ParentProxyConfig['source'],
): ParentProxyConfig | null {
  if (!proxy) {
    return null
  }
  return {
    ...proxy,
    source,
  }
}

export function parseParentProxyUrl(input: string): ParentProxyConfig | null {
  const rawUrl = String(input || '').trim()
  if (!rawUrl) {
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }

  const protocol = normalizeProtocol(parsed.protocol)
  const port = Number(
    parsed.port || (protocol === 'https' ? 443 : protocol === 'socks5' ? 1080 : 80),
  )
  if (!protocol || !parsed.hostname || !Number.isFinite(port) || port <= 0) {
    return null
  }

  return {
    protocol,
    host: parsed.hostname,
    port,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    rawUrl,
  }
}

function parseWindowsProxyServer(value: string): ParentProxyConfig | null {
  const raw = String(value || '').trim()
  if (!raw) {
    return null
  }

  const segments = raw.split(';').map((item) => item.trim()).filter(Boolean)
  const preferred =
    segments.find((item) => /^https=/i.test(item)) ||
    segments.find((item) => /^http=/i.test(item)) ||
    segments[0]
  if (!preferred) {
    return null
  }

  const normalized = preferred.includes('=')
    ? preferred.replace(/^[a-z0-9]+=/i, '')
    : preferred

  if (/^[a-z]+:\/\//i.test(normalized)) {
    return parseParentProxyUrl(normalized)
  }

  const match = normalized.match(/^([^:]+):(\d+)$/)
  if (!match) {
    return null
  }

  return {
    protocol: 'http',
    host: match[1],
    port: Number(match[2]),
    rawUrl: `http://${match[1]}:${match[2]}`,
  }
}

function detectWindowsSystemProxy(): ParentProxyConfig | null {
  try {
    const output = execFileSync(
      'reg.exe',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        '/v',
        'ProxyEnable',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    if (!/\b0x1\b/i.test(output)) {
      return null
    }
  } catch {
    return null
  }

  try {
    const output = execFileSync(
      'reg.exe',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        '/v',
        'ProxyServer',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const match = output.match(/ProxyServer\s+REG_\w+\s+([^\r\n]+)/i)
    return parseWindowsProxyServer(match?.[1] || '')
  } catch {
    return null
  }
}

function parseScutilProxyValue(output: string, key: string): string {
  const match = output.match(new RegExp(`${key}\\s*:\\s*(.+)`, 'i'))
  return match?.[1]?.trim() || ''
}

function detectMacSystemProxy(): ParentProxyConfig | null {
  try {
    const output = execFileSync('scutil', ['--proxy'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    const httpsEnabled = parseScutilProxyValue(output, 'HTTPSEnable')
    const httpEnabled = parseScutilProxyValue(output, 'HTTPEnable')
    const socksEnabled = parseScutilProxyValue(output, 'SOCKSEnable')

    if (httpsEnabled === '1') {
      const host = parseScutilProxyValue(output, 'HTTPSProxy')
      const port = Number(parseScutilProxyValue(output, 'HTTPSPort'))
      if (host && Number.isFinite(port) && port > 0) {
        return {
          protocol: 'http',
          host,
          port,
          rawUrl: `http://${host}:${port}`,
        }
      }
    }

    if (httpEnabled === '1') {
      const host = parseScutilProxyValue(output, 'HTTPProxy')
      const port = Number(parseScutilProxyValue(output, 'HTTPPort'))
      if (host && Number.isFinite(port) && port > 0) {
        return {
          protocol: 'http',
          host,
          port,
          rawUrl: `http://${host}:${port}`,
        }
      }
    }

    if (socksEnabled === '1') {
      const host = parseScutilProxyValue(output, 'SOCKSProxy')
      const port = Number(parseScutilProxyValue(output, 'SOCKSPort'))
      if (host && Number.isFinite(port) && port > 0) {
        return {
          protocol: 'socks5',
          host,
          port,
          rawUrl: `socks5://${host}:${port}`,
        }
      }
    }
  } catch {
    return null
  }
  return null
}

export function getSystemParentProxy(): ParentProxyConfig | null {
  if (process.platform === 'win32') {
    return withSource(detectWindowsSystemProxy(), 'system')
  }
  if (process.platform === 'darwin') {
    return withSource(detectMacSystemProxy(), 'system')
  }
  return null
}

function getEnvParentProxy(): ParentProxyConfig | null {
  const candidates = [
    process.env.DUOKAI_PARENT_PROXY,
    process.env.ALL_PROXY,
    process.env.all_proxy,
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
  ]
  for (const candidate of candidates) {
    const parsed = withSource(parseParentProxyUrl(String(candidate || '')), 'env')
    if (parsed) {
      return parsed
    }
  }
  return null
}

export function getDefaultEgressPathOrder(): Array<'auto' | EgressPathType> {
  if (os.platform() === 'win32' || os.platform() === 'darwin') {
    return ['auto', 'direct', 'system', 'env', 'custom']
  }
  return ['auto', 'direct', 'env', 'custom']
}

export function listEgressPathCandidates(settings: SettingsPayload = {}): EgressPathCandidate[] {
  const mode = String(settings.networkEgressMode || 'auto').trim() as 'auto' | EgressPathType
  const lastSuccessfulPath = String(settings.networkLastSuccessfulEgressPath || '').trim() as EgressPathType | ''
  const customParentProxy = withSource(
    parseParentProxyUrl(String(settings.networkParentProxyUrl || '')),
    'custom',
  )
  const systemParentProxy = getSystemParentProxy()
  const envParentProxy = getEnvParentProxy()
  const candidates: EgressPathCandidate[] = []

  const pushUnique = (candidate: EgressPathCandidate) => {
    if (
      candidates.some(
        (item) =>
          item.type === candidate.type &&
          (item.parentProxy?.rawUrl || '') === (candidate.parentProxy?.rawUrl || ''),
      )
    ) {
      return
    }
    candidates.push(candidate)
  }

  if (mode === 'direct') {
    pushUnique({ type: 'direct', label: 'Direct' })
    return candidates
  }

  if (mode === 'system') {
    if (systemParentProxy) {
      pushUnique({ type: 'system', label: 'System proxy', parentProxy: systemParentProxy })
    }
    return candidates
  }

  if (mode === 'env') {
    if (envParentProxy) {
      pushUnique({ type: 'env', label: 'Environment proxy', parentProxy: envParentProxy })
    }
    return candidates
  }

  if (mode === 'custom') {
    if (customParentProxy) {
      pushUnique({ type: 'custom', label: 'Custom parent proxy', parentProxy: customParentProxy })
    }
    return candidates
  }

  pushUnique({ type: 'direct', label: 'Direct' })

  if (systemParentProxy) {
    pushUnique({ type: 'system', label: 'System proxy', parentProxy: systemParentProxy })
  }

  if (envParentProxy) {
    pushUnique({ type: 'env', label: 'Environment proxy', parentProxy: envParentProxy })
  }

  if (customParentProxy) {
    pushUnique({ type: 'custom', label: 'Custom parent proxy', parentProxy: customParentProxy })
  }

  if (mode === 'auto' && lastSuccessfulPath) {
    candidates.sort((left, right) => {
      if (left.type === lastSuccessfulPath && right.type !== lastSuccessfulPath) return -1
      if (right.type === lastSuccessfulPath && left.type !== lastSuccessfulPath) return 1
      return 0
    })
  }

  return candidates
}
