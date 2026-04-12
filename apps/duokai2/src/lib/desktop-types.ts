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
  metaBadges: Array<{
    key: 'id' | 'proxy' | 'purpose'
    label: string
  }>
  identity: string
  locale: string
  hardware: string
  sync?: {
    label: string
    detail: string
    className: string
  } | null
  runtimeSync?: Array<{
    key: 'storageState' | 'workspaceSummary' | 'workspaceSnapshot'
    label: string
    detail: string
    className: string
  }>
  status: 'queued' | 'starting' | 'running' | 'idle' | 'stopped' | 'error'
  statusTone?: 'running' | 'launch-failed' | 'blocked' | 'idle' | 'stopped'
  launchPhaseLabel: string
  isLaunching: boolean
  canMoveToNurture: boolean
  canMoveToOperation: boolean
}
