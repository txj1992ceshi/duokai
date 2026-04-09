import type { DeviceProfile, EnvironmentPurpose, FingerprintConfig } from '../shared/types'

export type ProfileFormState = {
  name: string
  proxyId: string | null
  groupName: string
  tagsText: string
  notes: string
  environmentPurpose: EnvironmentPurpose
  deviceProfile: DeviceProfile | null
  fingerprintConfig: FingerprintConfig
}

export type EnvironmentListItem = {
  id: string
  name: string
  idLabel: string
  purposeLabel: string
  proxyLabel: string
  groupLabel: string
  tagLabel: string
  summary: string
  identity: string
  locale: string
  hardware: string
  lifecycle: string
  storage?: {
    label: string
    detail: string
    className: string
  } | null
  status: 'queued' | 'starting' | 'running' | 'idle' | 'stopped' | 'error'
  launchPhaseLabel: string
  isLaunching: boolean
  canMoveToNurture: boolean
  canMoveToOperation: boolean
}
