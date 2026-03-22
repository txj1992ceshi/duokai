import { mkdirSync } from 'node:fs'
import path from 'node:path'

import type { SettingsPayload } from '../../src/shared/types'

export type RuntimeHostKind = 'local' | 'container' | 'vm' | 'cloud-phone'

export interface RuntimeHostDescriptor {
  profileId: string
  kind: RuntimeHostKind
  label: string
  available: boolean
  reason: string
  userDataDir: string
  preparedAt: string
}

export interface RuntimeHostOptions {
  profileId: string
  userDataDir: string
  settings: SettingsPayload
}

function normalizeRequestedKind(value: string | undefined): RuntimeHostKind {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'container' || normalized === 'vm' || normalized === 'cloud-phone') {
    return normalized
  }
  return 'local'
}

export function resolveRequestedRuntimeKind(settings: SettingsPayload): RuntimeHostKind {
  return normalizeRequestedKind(
    settings.runtimeHostMode || process.env.DUOKAI_RUNTIME_HOST_KIND || 'local',
  )
}

export function isRuntimeHostSupported(kind: RuntimeHostKind): boolean {
  switch (kind) {
    case 'local':
      return true
    case 'container':
      return process.platform === 'linux' && process.env.DUOKAI_ALLOW_CONTAINER_RUNTIME === '1'
    case 'vm':
      return process.env.DUOKAI_ALLOW_VM_RUNTIME === '1'
    case 'cloud-phone':
      return process.env.DUOKAI_ALLOW_CLOUD_PHONE_RUNTIME === '1'
    default:
      return false
  }
}

export async function prepareRuntimeHost(options: RuntimeHostOptions): Promise<RuntimeHostDescriptor> {
  mkdirSync(path.dirname(options.userDataDir), { recursive: true })
  mkdirSync(options.userDataDir, { recursive: true })

  const requestedKind = resolveRequestedRuntimeKind(options.settings)
  const available = isRuntimeHostSupported(requestedKind)

  return {
    profileId: options.profileId,
    kind: available ? requestedKind : 'local',
    label:
      available || requestedKind === 'local'
        ? requestedKind
        : `local fallback for ${requestedKind}`,
    available,
    reason: available
      ? 'runtime host ready'
      : `runtime host "${requestedKind}" is unavailable on this platform; falling back to local`,
    userDataDir: options.userDataDir,
    preparedAt: new Date().toISOString(),
  }
}

export async function releaseRuntimeHost(): Promise<void> {
  return
}
