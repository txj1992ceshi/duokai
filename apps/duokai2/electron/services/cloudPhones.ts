import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  CloudPhoneDetails,
  CloudPhoneProviderCapability,
  CloudPhoneProviderConfig,
  CloudPhoneProviderHealth,
  CloudPhoneProviderKind,
  CloudPhoneProviderSummary,
  CloudPhoneProxyTestResult,
  CloudPhoneRecord,
  CreateCloudPhoneInput,
  DetectedLocalEmulator,
  SettingsPayload,
} from '../../src/shared/types'

const execFileAsync = promisify(execFile)

type ProviderRuntimeState = {
  status: CloudPhoneRecord['status']
  endpointUrl: string | null
  lastSyncedAt: string
  message: string
}

export interface CloudPhoneProvider {
  readonly key: string
  readonly label: string
  readonly kind: CloudPhoneProviderKind
  readonly capabilities: CloudPhoneProviderCapability[]
  supports(feature: CloudPhoneProviderCapability): boolean
  healthCheck(settings: SettingsPayload): Promise<CloudPhoneProviderHealth>
  listAvailableTargets(settings: SettingsPayload): Promise<DetectedLocalEmulator[]>
  createEnvironment(
    input: CreateCloudPhoneInput,
    settings: SettingsPayload,
  ): Promise<{
    providerInstanceId: string
    status: CloudPhoneRecord['status']
  }>
  updateEnvironment(record: CloudPhoneRecord, settings: SettingsPayload): Promise<void>
  deleteEnvironment(record: CloudPhoneRecord, settings: SettingsPayload): Promise<void>
  startEnvironment(record: CloudPhoneRecord, settings: SettingsPayload): Promise<CloudPhoneRecord['status']>
  stopEnvironment(record: CloudPhoneRecord, settings: SettingsPayload): Promise<CloudPhoneRecord['status']>
  getEnvironmentStatus(
    record: CloudPhoneRecord,
    settings: SettingsPayload,
  ): Promise<CloudPhoneRecord['status']>
  getEnvironmentDetails(record: CloudPhoneRecord, settings: SettingsPayload): Promise<CloudPhoneDetails>
  testProxy(input: CreateCloudPhoneInput, settings: SettingsPayload): Promise<CloudPhoneProxyTestResult>
}

abstract class BaseCloudPhoneProvider implements Partial<CloudPhoneProvider> {
  abstract readonly key: string
  abstract readonly label: string
  abstract readonly kind: CloudPhoneProviderKind
  abstract readonly capabilities: CloudPhoneProviderCapability[]

  protected readonly states = new Map<string, ProviderRuntimeState>()

  supports(feature: CloudPhoneProviderCapability): boolean {
    return this.capabilities.includes(feature)
  }

  async listAvailableTargets(_settings: SettingsPayload): Promise<DetectedLocalEmulator[]> {
    void _settings
    return []
  }

  abstract healthCheck(settings: SettingsPayload): Promise<CloudPhoneProviderHealth>
  abstract createEnvironment(
    input: CreateCloudPhoneInput,
    settings: SettingsPayload,
  ): Promise<{
    providerInstanceId: string
    status: CloudPhoneRecord['status']
  }>
  abstract startEnvironment(
    record: CloudPhoneRecord,
    settings: SettingsPayload,
  ): Promise<CloudPhoneRecord['status']>
  abstract stopEnvironment(
    record: CloudPhoneRecord,
    settings: SettingsPayload,
  ): Promise<CloudPhoneRecord['status']>
  abstract testProxy(
    input: CreateCloudPhoneInput,
    settings: SettingsPayload,
  ): Promise<CloudPhoneProxyTestResult>

  async updateEnvironment(_record: CloudPhoneRecord, _settings: SettingsPayload): Promise<void> {
    void _record
    void _settings
    return
  }

  async deleteEnvironment(record: CloudPhoneRecord, _settings: SettingsPayload): Promise<void> {
    void _settings
    this.states.delete(record.id)
  }

  async getEnvironmentStatus(
    record: CloudPhoneRecord,
    _settings: SettingsPayload,
  ): Promise<CloudPhoneRecord['status']> {
    void _settings
    return this.states.get(record.id)?.status ?? record.status
  }

  async getEnvironmentDetails(
    record: CloudPhoneRecord,
    _settings: SettingsPayload,
  ): Promise<CloudPhoneDetails> {
    void _settings
    const state = this.states.get(record.id)
    return {
      providerKey: this.key,
      providerKind: this.kind,
      providerInstanceId: record.providerInstanceId,
      platform: 'android',
      status: state?.status ?? record.status,
      computeType: record.computeType,
      endpointUrl: state?.endpointUrl ?? null,
      message: state?.message ?? `${this.label} has no active remote session.`,
      lastSyncedAt: state?.lastSyncedAt ?? record.lastSyncedAt,
      providerLabel: this.label,
      connectionLabel: this.connectionLabel(record.providerConfig),
    }
  }

  protected setState(
    record: CloudPhoneRecord,
    status: CloudPhoneRecord['status'],
    message: string,
    endpointUrl: string | null = null,
  ): CloudPhoneRecord['status'] {
    this.states.set(record.id, {
      status,
      endpointUrl,
      lastSyncedAt: new Date().toISOString(),
      message,
    })
    return status
  }

  protected connectionLabel(config: CloudPhoneProviderConfig): string {
    return config.baseUrl || config.emulatorName || config.adbSerial || '-'
  }
}

export class MockCloudPhoneProvider extends BaseCloudPhoneProvider {
  readonly key = 'mock'
  readonly label = 'Mock Provider'
  readonly kind = 'mock' as const
  readonly capabilities: CloudPhoneProviderCapability[] = ['proxyTest', 'startStop', 'remoteUrl']

  async healthCheck(): Promise<CloudPhoneProviderHealth> {
    return {
      key: this.key,
      label: this.label,
      kind: this.kind,
      available: true,
      message: 'Mock provider is always available.',
      checkedAt: new Date().toISOString(),
    }
  }

  async createEnvironment(_input: CreateCloudPhoneInput): Promise<{
    providerInstanceId: string
    status: CloudPhoneRecord['status']
  }> {
    void _input
    return {
      providerInstanceId: `mock-${randomUUID()}`,
      status: 'provisioned',
    }
  }

  async startEnvironment(record: CloudPhoneRecord): Promise<CloudPhoneRecord['status']> {
    return this.setState(
      record,
      'running',
      'Mock provider session is ready.',
      `https://mock-cloud-phone.local/session/${record.providerInstanceId ?? record.id}`,
    )
  }

  async stopEnvironment(record: CloudPhoneRecord): Promise<CloudPhoneRecord['status']> {
    return this.setState(record, 'stopped', 'Mock provider session stopped.')
  }

  async testProxy(input: CreateCloudPhoneInput): Promise<CloudPhoneProxyTestResult> {
    const checkedAt = new Date().toISOString()
    if (
      input.proxyHost.trim().length === 0 ||
      input.proxyPort <= 0 ||
      input.proxyUsername.trim().length === 0 ||
      input.proxyPassword.trim().length === 0
    ) {
      return { success: false, message: 'Proxy configuration is incomplete.', checkedAt }
    }
    if (/fail|invalid|bad/i.test(input.proxyHost)) {
      return { success: false, message: 'Mock proxy check failed.', checkedAt }
    }
    return { success: true, message: 'Mock proxy check succeeded.', checkedAt }
  }
}

abstract class RemoteCloudPhoneProvider extends BaseCloudPhoneProvider {
  readonly capabilities: CloudPhoneProviderCapability[] = ['proxyTest', 'startStop', 'remoteUrl']
  protected abstract baseUrlFromSettings(settings: SettingsPayload): string
  protected abstract tokenFromSettings(settings: SettingsPayload): string

  async healthCheck(settings: SettingsPayload): Promise<CloudPhoneProviderHealth> {
    const checkedAt = new Date().toISOString()
    const baseUrl = this.baseUrlFromSettings(settings)
    if (!baseUrl) {
      return {
        key: this.key,
        label: this.label,
        kind: this.kind,
        available: false,
        message: 'Endpoint is not configured.',
        checkedAt,
      }
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2000)
      const response = await fetch(baseUrl, {
        method: 'GET',
        headers: this.tokenFromSettings(settings)
          ? { Authorization: `Bearer ${this.tokenFromSettings(settings)}` }
          : undefined,
        signal: controller.signal,
      })
      clearTimeout(timer)
      return {
        key: this.key,
        label: this.label,
        kind: this.kind,
        available: response.ok,
        message: response.ok ? 'Provider endpoint reachable.' : `Endpoint returned ${response.status}.`,
        checkedAt,
      }
    } catch (error) {
      return {
        key: this.key,
        label: this.label,
        kind: this.kind,
        available: false,
        message: error instanceof Error ? error.message : 'Provider health check failed.',
        checkedAt,
      }
    }
  }

  async createEnvironment(
    _input: CreateCloudPhoneInput,
    settings: SettingsPayload,
  ): Promise<{ providerInstanceId: string; status: CloudPhoneRecord['status'] }> {
    const health = await this.healthCheck(settings)
    if (!health.available) {
      throw new Error(`VALIDATION:${this.label} unavailable: ${health.message}`)
    }
    return {
      providerInstanceId: `${this.key}-${randomUUID()}`,
      status: 'provisioned',
    }
  }

  async startEnvironment(
    record: CloudPhoneRecord,
    settings: SettingsPayload,
  ): Promise<CloudPhoneRecord['status']> {
    const health = await this.healthCheck(settings)
    if (!health.available) {
      return this.setState(record, 'error', `${this.label} unavailable: ${health.message}`)
    }
    return this.setState(
      record,
      'running',
      `${this.label} session is marked running.`,
      `${this.baseUrlFromSettings(settings).replace(/\/$/, '')}/session/${record.providerInstanceId ?? record.id}`,
    )
  }

  async stopEnvironment(
    record: CloudPhoneRecord,
    _settings: SettingsPayload,
  ): Promise<CloudPhoneRecord['status']> {
    void _settings
    return this.setState(record, 'stopped', `${this.label} session stopped.`)
  }

  async testProxy(
    input: CreateCloudPhoneInput,
    settings: SettingsPayload,
  ): Promise<CloudPhoneProxyTestResult> {
    const checkedAt = new Date().toISOString()
    const health = await this.healthCheck(settings)
    if (!health.available) {
      return { success: false, message: `${this.label} unavailable: ${health.message}`, checkedAt }
    }
    if (!input.proxyHost.trim() || input.proxyPort <= 0) {
      return { success: false, message: 'Proxy host or port is missing.', checkedAt }
    }
    return { success: true, message: `${this.label} accepted the proxy configuration.`, checkedAt }
  }
}

export class SelfHostedCloudPhoneProvider extends RemoteCloudPhoneProvider {
  readonly key = 'self-hosted'
  readonly label = 'Self-hosted'
  readonly kind = 'self-hosted' as const

  protected baseUrlFromSettings(settings: SettingsPayload): string {
    return settings.selfHostedCloudPhoneBaseUrl?.trim() ?? ''
  }

  protected tokenFromSettings(settings: SettingsPayload): string {
    return settings.selfHostedCloudPhoneApiKey?.trim() ?? ''
  }
}

export class ThirdPartyCloudPhoneProvider extends RemoteCloudPhoneProvider {
  readonly key = 'third-party'
  readonly label = 'Third-party'
  readonly kind = 'third-party' as const

  protected baseUrlFromSettings(settings: SettingsPayload): string {
    return settings.thirdPartyCloudPhoneBaseUrl?.trim() ?? ''
  }

  protected tokenFromSettings(settings: SettingsPayload): string {
    return settings.thirdPartyCloudPhoneToken?.trim() ?? ''
  }
}

export class LocalEmulatorCloudPhoneProvider extends BaseCloudPhoneProvider {
  readonly key = 'local-emulator'
  readonly label = 'Local emulator'
  readonly kind = 'local-emulator' as const
  readonly capabilities: CloudPhoneProviderCapability[] = ['startStop', 'adbBridge']

  private getAdbPath(settings: SettingsPayload): string {
    return settings.localEmulatorAdbPath?.trim() || 'adb'
  }

  async healthCheck(settings: SettingsPayload): Promise<CloudPhoneProviderHealth> {
    const checkedAt = new Date().toISOString()
    try {
      await execFileAsync(this.getAdbPath(settings), ['version'])
      return {
        key: this.key,
        label: this.label,
        kind: this.kind,
        available: true,
        message: 'ADB is available.',
        checkedAt,
      }
    } catch (error) {
      return {
        key: this.key,
        label: this.label,
        kind: this.kind,
        available: false,
        message: error instanceof Error ? error.message : 'ADB is not available.',
        checkedAt,
      }
    }
  }

  async listAvailableTargets(settings: SettingsPayload): Promise<DetectedLocalEmulator[]> {
    try {
      const { stdout } = await execFileAsync(this.getAdbPath(settings), ['devices'])
      return stdout
        .split('\n')
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [serial, state] = line.split(/\s+/)
          return {
            serial,
            name: serial,
            state: state || 'unknown',
            source: 'adb' as const,
          }
        })
    } catch {
      return []
    }
  }

  async createEnvironment(
    input: CreateCloudPhoneInput,
    settings: SettingsPayload,
  ): Promise<{ providerInstanceId: string; status: CloudPhoneRecord['status'] }> {
    const devices = await this.listAvailableTargets(settings)
    const requestedSerial = input.providerConfig.adbSerial?.trim()
    const device = devices.find((item) => item.serial === requestedSerial) ?? devices[0]
    if (!device) {
      throw new Error('VALIDATION:No local Android emulator or ADB device detected.')
    }
    return {
      providerInstanceId: device.serial,
      status: 'provisioned',
    }
  }

  async startEnvironment(record: CloudPhoneRecord): Promise<CloudPhoneRecord['status']> {
    return this.setState(
      record,
      'running',
      'ADB target marked as running.',
      `adb://${record.providerConfig.adbSerial ?? record.providerInstanceId ?? record.id}`,
    )
  }

  async stopEnvironment(record: CloudPhoneRecord): Promise<CloudPhoneRecord['status']> {
    return this.setState(record, 'stopped', 'ADB target marked as stopped.')
  }

  async testProxy(
    _input: CreateCloudPhoneInput,
    _settings: SettingsPayload,
  ): Promise<CloudPhoneProxyTestResult> {
    void _input
    void _settings
    return {
      success: false,
      message: 'Local emulator provider does not support proxy testing.',
      checkedAt: new Date().toISOString(),
    }
  }
}

export class CloudPhoneProviderRegistry {
  private readonly providers = new Map<string, CloudPhoneProvider>()

  register(provider: CloudPhoneProvider): void {
    this.providers.set(provider.key, provider)
  }

  listProviders(): CloudPhoneProviderSummary[] {
    return Array.from(this.providers.values()).map((provider) => ({
      key: provider.key,
      label: provider.label,
      kind: provider.kind,
      capabilities: provider.capabilities,
    }))
  }

  getProvider(key: string | null | undefined): CloudPhoneProvider {
    const provider = key ? this.providers.get(key) : undefined
    if (!provider) {
      const fallback = this.providers.get('mock')
      if (fallback) {
        return fallback
      }
      throw new Error(`Unknown cloud phone provider: ${key ?? 'missing'}`)
    }
    return provider
  }

  async getProviderHealth(settings: SettingsPayload): Promise<CloudPhoneProviderHealth[]> {
    return Promise.all(Array.from(this.providers.values()).map((provider) => provider.healthCheck(settings)))
  }

  async detectLocalDevices(settings: SettingsPayload): Promise<DetectedLocalEmulator[]> {
    const provider = this.providers.get('local-emulator')
    if (!provider) {
      return []
    }
    return provider.listAvailableTargets(settings)
  }
}
