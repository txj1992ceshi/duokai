import { accessSync, constants, existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type {
  IpUsageRecord,
  ProfileRecord,
  ProxyRecord,
  WorkspaceConsistencyReport,
  WorkspaceGateResult,
  WorkspaceHealthReport,
  WorkspaceMigrationCheckpointName,
  WorkspacePaths,
} from '../../src/shared/types'
import type { NetworkHealthResult } from './networkCheck'
import { normalizeWorkspaceDescriptor } from './factories'

export type ValidationLevel = 'pass' | 'warn' | 'block'

export interface ValidationResult {
  level: ValidationLevel
  messages: string[]
}

export interface RegistrationRiskAssessment {
  score: number
  level: 'low' | 'medium' | 'high'
  factors: string[]
}

export interface RegistrationCooldownContext {
  withinHours: number
  maxProfiles: number
  recentUsages: IpUsageRecord[]
  platform: string
  platformWithinHours: number
  platformMaxProfiles: number
  platformRecentUsages: IpUsageRecord[]
}

export interface LifecyclePolicyContext {
  nurtureMinimumHoursAfterRegister: number
  operationMinimumHoursAfterNurture: number
}

const REQUIRED_WORKSPACE_MIGRATION_CHECKPOINT = 'migration_completed'
const UNIQUE_WORKSPACE_PATH_KEYS: Array<keyof WorkspacePaths> = [
  'profileDir',
  'cacheDir',
  'downloadsDir',
  'extensionsDir',
  'metaDir',
]
const REQUIRED_BLOCKED_ENVIRONMENT_KEYS = [
  'browserFamily',
  'browserMajorVersionRange',
  'webrtcPolicy',
  'ipv6Policy',
] as const
const REQUIRED_ALLOWED_OVERRIDE_KEYS = [
  'timezone',
  'browserLanguage',
  'resolution',
  'nonCriticalLaunchArgs',
] as const
const REQUIRED_WORKSPACE_RUNTIME_FIELDS = [
  'browserLanguage',
  'timezone',
  'resolution',
  'downloadsDir',
] as const

function normalizeRiskScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function getRiskLevel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 70) {
    return 'high'
  }
  if (score >= 35) {
    return 'medium'
  }
  return 'low'
}

function escalateLevel(current: ValidationLevel, next: ValidationLevel): ValidationLevel {
  const order: ValidationLevel[] = ['pass', 'warn', 'block']
  return order.indexOf(next) > order.indexOf(current) ? next : current
}

function isBlank(value: string): boolean {
  return value.trim().length === 0
}

function isMobileUserAgent(userAgent: string): boolean {
  return /android|iphone|ipad|mobile/i.test(userAgent)
}

function resolveExpectedPlatform(profile: ProfileRecord): string {
  if (profile.fingerprintConfig.advanced.deviceMode === 'android') {
    return 'Linux armv8l'
  }
  if (profile.fingerprintConfig.advanced.deviceMode === 'ios') {
    return 'iPhone'
  }
  const operatingSystem = profile.fingerprintConfig.advanced.operatingSystem.toLowerCase()
  if (operatingSystem.includes('windows')) {
    return 'Win32'
  }
  if (operatingSystem.includes('mac')) {
    return 'MacIntel'
  }
  return 'Linux x86_64'
}

function getLanguageRoot(language: string): string {
  return language.split(',')[0]?.trim().split('-')[0]?.toLowerCase() || ''
}

function getUserAgentChromeMajor(userAgent: string): string {
  return userAgent.match(/Chrome\/(\d+)/i)?.[1] || ''
}

function toUniqueMessages(messages: string[]): string[] {
  return Array.from(new Set(messages.filter(Boolean)))
}

function normalizePathForComparison(input: string): string {
  const normalized = path.normalize(path.resolve(input))
  if (existsSync(normalized)) {
    try {
      const resolved = realpathSync(normalized)
      return process.platform === 'win32' ? resolved.toLowerCase() : resolved
    } catch {
      return process.platform === 'win32' ? normalized.toLowerCase() : normalized
    }
  }
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function getWorkspaceRoot(profileId: string, profileDir: string): string {
  const expectedSuffix = path.join('workspaces', profileId, 'profile')
  const normalizedProfileDir = path.normalize(path.resolve(profileDir))
  if (normalizedProfileDir.endsWith(expectedSuffix)) {
    return normalizedProfileDir.slice(0, normalizedProfileDir.length - 'profile'.length - 1)
  }
  return path.dirname(normalizedProfileDir)
}

function isPathInsideWorkspaceRoot(targetPath: string, workspaceRoot: string): boolean {
  const normalizedTarget = normalizePathForComparison(targetPath)
  const normalizedRoot = normalizePathForComparison(workspaceRoot)
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
}

function hasExpectedWorkspaceLeaf(targetPath: string, profileId: string, leaf: string): boolean {
  return path.normalize(path.resolve(targetPath)).endsWith(path.join('workspaces', profileId, leaf))
}

function readMigrationState(metaDir: string): {
  profileId: string
  migrationState: string
  checkpoints: Array<{ name: WorkspaceMigrationCheckpointName; completedAt: string }>
} | null {
  try {
    return JSON.parse(readFileSync(path.join(metaDir, 'migration-state.json'), 'utf8')) as {
      profileId: string
      migrationState: string
      checkpoints: Array<{ name: WorkspaceMigrationCheckpointName; completedAt: string }>
    }
  } catch {
    return null
  }
}

function createHealthSummary(
  status: WorkspaceHealthReport['status'],
  messages: string[],
): WorkspaceHealthReport {
  return {
    status,
    messages: toUniqueMessages(messages),
    checkedAt: new Date().toISOString(),
  }
}

function createConsistencySummary(
  profile: ProfileRecord,
  status: WorkspaceConsistencyReport['status'],
  messages: string[],
): WorkspaceConsistencyReport {
  return {
    status,
    messages: toUniqueMessages(messages),
    checkedAt: new Date().toISOString(),
    templateFingerprintHash: profile.workspace?.templateBinding.templateFingerprintHash || '',
    templateRevision: profile.workspace?.templateBinding.templateRevision || '',
  }
}

function computeTemplateProtectedFingerprint(profile: ProfileRecord): string {
  const workspace = profile.workspace
  if (!workspace) {
    return ''
  }
  const { templateBinding, resolvedEnvironment, paths } = workspace
  const payload = {
    templateId: templateBinding.templateId,
    templateRevision: templateBinding.templateRevision,
    browserFamily: resolvedEnvironment.browserFamily,
    browserMajorVersionRange: resolvedEnvironment.browserMajorVersionRange,
    webrtcPolicy: resolvedEnvironment.webrtcPolicy,
    ipv6Policy: resolvedEnvironment.ipv6Policy,
    profileDir: paths.profileDir,
    extensionsDir: paths.extensionsDir,
    metaDir: paths.metaDir,
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export function computeWorkspaceHealthSummary(profile: ProfileRecord): WorkspaceHealthReport {
  const workspace = profile.workspace
  if (!workspace) {
    return createHealthSummary('broken', ['Workspace subtree is missing.'])
  }
  const messages: string[] = []
  const warnings: string[] = []

  if (workspace.identityProfileId !== profile.id) {
    messages.push('Workspace identity does not match profile identity.')
  }
  if (workspace.migrationState !== 'completed') {
    messages.push('Workspace migration is incomplete.')
  }
  if (!workspace.migrationCheckpoints.some((item) => item.name === REQUIRED_WORKSPACE_MIGRATION_CHECKPOINT)) {
    messages.push('Workspace migration completion checkpoint is missing.')
  }
  if (!workspace.templateBinding.templateRevision || !workspace.templateBinding.templateFingerprintHash) {
    messages.push('Workspace template binding is incomplete.')
  }
  const { paths } = workspace
  if (!paths.profileDir || !paths.cacheDir || !paths.downloadsDir || !paths.extensionsDir || !paths.metaDir) {
    messages.push('Workspace paths are incomplete.')
  }

  if (!paths.profileDir || !existsSync(paths.profileDir)) {
    messages.push('Workspace profileDir is missing.')
  } else {
    try {
      accessSync(paths.profileDir, constants.R_OK | constants.W_OK)
    } catch {
      messages.push('Workspace profileDir is not readable and writable.')
    }
  }

  for (const key of ['cacheDir', 'downloadsDir', 'extensionsDir', 'metaDir'] as const) {
    const targetPath = paths[key]
    if (!targetPath) {
      messages.push(`Workspace ${key} is missing.`)
      continue
    }
    if (existsSync(targetPath)) {
      continue
    }
    try {
      accessSync(path.dirname(targetPath), constants.W_OK)
      warnings.push(`Workspace ${key} is missing but can be recreated safely.`)
    } catch {
      messages.push(`Workspace ${key} is missing and cannot be recreated safely.`)
    }
  }

  const migrationState = readMigrationState(paths.metaDir)
  if (!migrationState) {
    messages.push('Workspace migration state file is unreadable.')
  } else {
    if (migrationState.profileId !== profile.id) {
      messages.push('Workspace migration state file identity does not match profile identity.')
    }
    if (migrationState.migrationState !== workspace.migrationState) {
      messages.push('Workspace migration state file does not match in-memory migration state.')
    }
  }

  if (messages.length > 0) {
    return createHealthSummary('broken', messages)
  }
  if (warnings.length > 0) {
    return createHealthSummary('warning', warnings)
  }
  return createHealthSummary('healthy', ['Workspace health check passed.'])
}

export function computeWorkspaceConsistencySummary(
  profile: ProfileRecord,
  allProfiles: ProfileRecord[],
): WorkspaceConsistencyReport {
  const workspace = profile.workspace
  if (!workspace) {
    return createConsistencySummary(profile, 'block', ['Workspace subtree is missing.'])
  }

  const blockMessages: string[] = []
  const warnMessages: string[] = []
  const overrideKeys = Object.keys(workspace.declaredOverrides)
  for (const key of overrideKeys) {
    if (!workspace.allowedOverrides.includes(key as typeof workspace.allowedOverrides[number])) {
      blockMessages.push(`Workspace declaredOverrides contains unsupported key "${key}".`)
    }
  }

  const workspaceRoot = getWorkspaceRoot(profile.id, workspace.paths.profileDir)
  if (workspace.resolvedEnvironment.downloadsDir !== workspace.paths.downloadsDir) {
    blockMessages.push('Workspace downloadsDir must match workspace.paths.downloadsDir.')
  }
  if (!hasExpectedWorkspaceLeaf(workspace.paths.profileDir, profile.id, 'profile')) {
    blockMessages.push('Workspace profileDir does not match the expected workspaces/<profileId>/profile layout.')
  }
  if (!hasExpectedWorkspaceLeaf(workspace.paths.extensionsDir, profile.id, 'extensions')) {
    blockMessages.push('Workspace extensionsDir does not match the expected workspace layout.')
  }
  if (!hasExpectedWorkspaceLeaf(workspace.paths.metaDir, profile.id, 'meta')) {
    blockMessages.push('Workspace metaDir does not match the expected workspace layout.')
  }
  for (const key of ['profileDir', 'extensionsDir', 'metaDir'] as const) {
    if (!isPathInsideWorkspaceRoot(workspace.paths[key], workspaceRoot)) {
      blockMessages.push(`Workspace ${key} escapes the resolved workspace root.`)
    }
  }

  const protectedFingerprint = computeTemplateProtectedFingerprint(profile)
  if (
    workspace.templateBinding.templateFingerprintHash &&
    protectedFingerprint &&
    workspace.templateBinding.templateFingerprintHash !== protectedFingerprint
  ) {
    blockMessages.push('Workspace template fingerprint does not match the protected workspace baseline.')
  } else if (
    !workspace.templateBinding.templateFingerprintHash &&
    workspace.templateBinding.templateRevision
  ) {
    warnMessages.push('Workspace template fingerprint is absent; revision-only consistency validation is degraded.')
  }

  for (const key of REQUIRED_ALLOWED_OVERRIDE_KEYS) {
    const declared = workspace.declaredOverrides[key]
    const actualValue =
      key === 'nonCriticalLaunchArgs'
        ? workspace.resolvedEnvironment.launchArgs
        : workspace.resolvedEnvironment[key]
    if (declared === undefined) {
      continue
    }
    if (Array.isArray(actualValue)) {
      if (!Array.isArray(declared) || declared.join('|') !== actualValue.join('|')) {
        blockMessages.push(`Workspace declared override "${key}" does not match resolvedEnvironment.`)
      } else {
        warnMessages.push(`Workspace uses declared override "${key}".`)
      }
      continue
    }
    if (String(declared) !== String(actualValue)) {
      blockMessages.push(`Workspace declared override "${key}" does not match resolvedEnvironment.`)
    } else {
      warnMessages.push(`Workspace uses declared override "${key}".`)
    }
  }

  if (workspace.declaredOverrides.downloadsDirAlias !== undefined) {
    const aliasValue = String(workspace.declaredOverrides.downloadsDirAlias || '')
    const expectedAliasPath = path.join(workspaceRoot, aliasValue)
    if (!isPathInsideWorkspaceRoot(expectedAliasPath, workspaceRoot)) {
      blockMessages.push('Workspace downloadsDirAlias override escapes the workspace root.')
    } else {
      warnMessages.push('Workspace uses declared override "downloadsDirAlias".')
    }
  }

  for (const key of REQUIRED_BLOCKED_ENVIRONMENT_KEYS) {
    if (!workspace.resolvedEnvironment[key]) {
      blockMessages.push(`Workspace blocked runtime field "${key}" is missing.`)
    }
  }
  for (const key of REQUIRED_WORKSPACE_RUNTIME_FIELDS) {
    if (!workspace.resolvedEnvironment[key]) {
      blockMessages.push(`Workspace runtime field "${key}" is missing.`)
    }
  }
  if (!Array.isArray(workspace.resolvedEnvironment.launchArgs)) {
    blockMessages.push('Workspace runtime field "launchArgs" is missing.')
  }

  for (const key of UNIQUE_WORKSPACE_PATH_KEYS) {
    const currentPath = workspace.paths[key]
    if (!currentPath) {
      blockMessages.push(`Workspace ${key} is missing.`)
      continue
    }
    const normalizedCurrentPath = normalizePathForComparison(currentPath)
    for (const otherProfile of allProfiles) {
      if (otherProfile.id === profile.id || !otherProfile.workspace) {
        continue
      }
      const otherPath = otherProfile.workspace.paths[key]
      if (!otherPath) {
        continue
      }
      if (normalizedCurrentPath === normalizePathForComparison(otherPath)) {
        blockMessages.push(`Workspace ${key} is shared with profile "${otherProfile.id}".`)
        break
      }
    }
  }

  if (blockMessages.length > 0) {
    return createConsistencySummary(profile, 'block', blockMessages)
  }
  if (warnMessages.length > 0) {
    return createConsistencySummary(profile, 'warn', warnMessages)
  }
  return createConsistencySummary(profile, 'pass', ['Workspace consistency check passed.'])
}

export function validateWorkspaceGate(
  profile: ProfileRecord,
  allProfiles: ProfileRecord[] = [],
): WorkspaceGateResult {
  const healthSummary = computeWorkspaceHealthSummary(profile)
  const consistencySummary = computeWorkspaceConsistencySummary(profile, allProfiles)
  const workspace = profile.workspace
    ? {
        ...profile.workspace,
        healthSummary,
        consistencySummary,
      }
    : normalizeWorkspaceDescriptor(null, profile.id, profile.fingerprintConfig)

  if (!profile.workspace) {
    return {
      status: 'block',
      messages: ['Workspace subtree is missing.'],
      workspace: {
        ...workspace,
        healthSummary,
        consistencySummary,
      },
    }
  }

  const messages = toUniqueMessages([...healthSummary.messages, ...consistencySummary.messages]).filter((message) =>
    healthSummary.status === 'healthy' && consistencySummary.status === 'pass'
      ? true
      : !/check passed/i.test(message),
  )
  let status: WorkspaceGateResult['status'] = 'pass'
  if (healthSummary.status === 'broken' || consistencySummary.status === 'block') {
    status = 'block'
  } else if (healthSummary.status === 'warning' || consistencySummary.status === 'warn') {
    status = 'warn'
  }

  return {
    status,
    messages,
    workspace,
  }
}

function combineResults(...results: ValidationResult[]): ValidationResult {
  const messages = results.flatMap((result) => result.messages).filter((message) => message !== '环境校验通过，可启动。')
  const level = results.reduce<ValidationLevel>((current, result) => escalateLevel(current, result.level), 'pass')
  return {
    level,
    messages: messages.length > 0 ? Array.from(new Set(messages)) : ['环境校验通过，可启动。'],
  }
}

function hasManagedProxyConflict(profile: ProfileRecord, proxy: ProxyRecord | null): boolean {
  return profile.fingerprintConfig.proxySettings.proxyMode === 'manager' && Boolean(profile.proxyId) && !proxy
}

function hasCustomProxyConflict(profile: ProfileRecord): boolean {
  const { proxySettings } = profile.fingerprintConfig
  return (
    proxySettings.proxyMode === 'custom' &&
    (isBlank(proxySettings.host) || !Number.isFinite(proxySettings.port) || proxySettings.port <= 0)
  )
}

function hasMissingDerivedFields(profile: ProfileRecord): boolean {
  const { fingerprintConfig } = profile
  const needsTimezone = !fingerprintConfig.advanced.autoTimezoneFromIp && isBlank(fingerprintConfig.timezone)
  const needsLanguage = !fingerprintConfig.advanced.autoLanguageFromIp && isBlank(fingerprintConfig.language)
  const needsGeo =
    !fingerprintConfig.advanced.autoGeolocationFromIp &&
    fingerprintConfig.advanced.geolocationPermission === 'allow' &&
    isBlank(fingerprintConfig.advanced.geolocation)
  return needsTimezone || needsLanguage || needsGeo
}

function validatePurposeSpecificPolicies(profile: ProfileRecord): ValidationResult {
  const messages: string[] = []
  let level: ValidationLevel = 'pass'
  const { commonSettings, advanced } = profile.fingerprintConfig

  if (profile.environmentPurpose === 'register') {
    if (commonSettings.randomizeFingerprintOnLaunch) {
      level = escalateLevel(level, 'warn')
      messages.push('当前标签为注册环境，通常不建议在启动时随机化指纹。')
    }
    if (commonSettings.clearCacheOnLaunch) {
      level = escalateLevel(level, 'warn')
      messages.push('当前标签为注册环境，通常不建议在启动前清缓存，以免增加身份波动。')
    }
    if (!advanced.autoLanguageFromIp || !advanced.autoTimezoneFromIp || !advanced.autoGeolocationFromIp) {
      level = escalateLevel(level, 'warn')
      messages.push('当前标签为注册环境，建议开启语言、时区与地理位置的 IP 自动联动。')
    }
  }

  if (profile.environmentPurpose === 'nurture') {
    if (commonSettings.randomizeFingerprintOnLaunch) {
      level = escalateLevel(level, 'warn')
      messages.push('当前标签为养号环境，通常不建议在启动时随机化指纹。')
    }
    if (commonSettings.clearCacheOnLaunch) {
      level = escalateLevel(level, 'warn')
      messages.push('当前标签为养号环境，不建议在启动前清缓存，否则可能影响长期登录态。')
    }
    if (!commonSettings.syncCookies) {
      level = escalateLevel(level, 'warn')
      messages.push('当前标签为养号环境，建议保持 Cookie 同步开启，便于维持长期登录态。')
    }
  }

  if (profile.environmentPurpose === 'operation') {
    if (commonSettings.randomizeFingerprintOnLaunch) {
      level = escalateLevel(level, 'warn')
      messages.push('当前标签为日常运营，通常不建议在启动时随机化指纹，否则会影响身份稳定。')
    }
    if (commonSettings.clearCacheOnLaunch) {
      level = escalateLevel(level, 'warn')
      messages.push('当前标签为日常运营，不建议频繁清缓存，否则可能影响会话连续性。')
    }
  }

  if (messages.length === 0) {
    messages.push('环境用途策略校验通过。')
  }

  return { level, messages }
}

function validatePlatformSpecificPolicies(profile: ProfileRecord): ValidationResult {
  const messages: string[] = []
  let level: ValidationLevel = 'pass'
  const platform = profile.fingerprintConfig.basicSettings.platform.trim().toLowerCase()
  const { commonSettings, advanced, proxySettings } = profile.fingerprintConfig

  if (platform === 'linkedin') {
    if (advanced.deviceMode !== 'desktop') {
      level = escalateLevel(level, 'block')
      messages.push('LinkedIn 模板建议使用桌面端设备模式。')
    }
    if (profile.environmentPurpose !== 'register' && profile.environmentPurpose !== 'nurture') {
      level = escalateLevel(level, 'warn')
      messages.push('LinkedIn 更适合使用注册环境或养号环境。')
    }
    if (commonSettings.syncTabs && profile.environmentPurpose === 'register') {
      level = escalateLevel(level, 'warn')
      messages.push('LinkedIn 注册环境建议关闭标签页同步，降低新环境噪声。')
    }
    if (advanced.mediaDevicesMode !== 'off' && profile.environmentPurpose === 'register') {
      level = escalateLevel(level, 'warn')
      messages.push('LinkedIn 注册环境建议关闭媒体设备暴露，保持更保守的办公画像。')
    }
  }

  if (platform === 'tiktok') {
    if (commonSettings.blockImages) {
      level = escalateLevel(level, 'warn')
      messages.push('TikTok 环境不建议禁用图片加载，否则会影响内容场景真实性。')
    }
    if (advanced.mediaDevicesMode === 'off') {
      level = escalateLevel(level, 'warn')
      messages.push('TikTok 环境建议保留媒体设备能力，避免环境过于“静态”。')
    }
    if (profile.environmentPurpose === 'register') {
      level = escalateLevel(level, 'warn')
      messages.push('TikTok 更建议先使用养号环境，再进入日常运营。')
    }
  }

  if (platform && platform !== 'custom' && proxySettings.proxyMode === 'direct' && profile.environmentPurpose === 'register') {
    level = escalateLevel(level, 'warn')
    messages.push('注册环境当前未使用代理，平台风控一致性会明显变弱。')
  }

  if (messages.length === 0) {
    messages.push('平台策略校验通过。')
  }

  return { level, messages }
}

function getHoursSince(timestamp: string): number | null {
  const parsed = Date.parse(timestamp || '')
  if (!Number.isFinite(parsed)) {
    return null
  }
  return Math.max(0, (Date.now() - parsed) / (1000 * 60 * 60))
}

function validateLifecyclePolicies(
  profile: ProfileRecord,
  lifecyclePolicy?: LifecyclePolicyContext,
): ValidationResult {
  if (!lifecyclePolicy) {
    return {
      level: 'pass',
      messages: ['环境生命周期校验通过。'],
    }
  }

  const platform = profile.fingerprintConfig.basicSettings.platform.trim().toLowerCase()
  if (platform !== 'linkedin' && platform !== 'tiktok') {
    return {
      level: 'pass',
      messages: ['环境生命周期校验通过。'],
    }
  }

  const metadata = profile.fingerprintConfig.runtimeMetadata
  const messages: string[] = []
  let level: ValidationLevel = 'pass'

  if (profile.environmentPurpose === 'nurture') {
    if (!metadata.lastRegisterLaunchAt) {
      level = escalateLevel(level, 'warn')
      messages.push('养号环境尚未记录注册成功启动，建议先完成一次稳定注册流程。')
    } else {
      const hoursSinceRegister = getHoursSince(metadata.lastRegisterLaunchAt)
      if (
        hoursSinceRegister !== null &&
        hoursSinceRegister < lifecyclePolicy.nurtureMinimumHoursAfterRegister
      ) {
        level = escalateLevel(level, 'warn')
        messages.push(
          `当前环境仍处于养号观察期（建议至少 ${lifecyclePolicy.nurtureMinimumHoursAfterRegister} 小时），适合低频维护而非高强度运营。`,
        )
      }
    }
  }

  if (profile.environmentPurpose === 'operation') {
    if (!metadata.lastNurtureTransitionAt) {
      level = escalateLevel(level, 'warn')
      messages.push('当前环境尚未经过养号阶段，不建议直接进入日常运营。')
    } else {
      const hoursSinceNurture = getHoursSince(metadata.lastNurtureTransitionAt)
      if (
        hoursSinceNurture !== null &&
        hoursSinceNurture < lifecyclePolicy.operationMinimumHoursAfterNurture
      ) {
        level = escalateLevel(level, 'warn')
        messages.push(
          `当前环境距离进入养号阶段不足 ${lifecyclePolicy.operationMinimumHoursAfterNurture} 小时，建议继续养号后再进入日常运营。`,
        )
      }
    }
  }

  if (messages.length === 0) {
    messages.push('环境生命周期校验通过。')
  }

  return { level, messages }
}

export function validateProfileForLaunch(
  profile: ProfileRecord,
  proxy: ProxyRecord | null,
): ValidationResult {
  const messages: string[] = []
  let level: ValidationLevel = 'pass'
  const { fingerprintConfig } = profile
  const { advanced } = fingerprintConfig

  if (hasManagedProxyConflict(profile, proxy)) {
    level = escalateLevel(level, 'block')
    messages.push('代理模式为代理管理，但绑定的代理不存在。')
  }

  if (hasCustomProxyConflict(profile)) {
    level = escalateLevel(level, 'block')
    messages.push('自定义代理缺少主机或端口。')
  }

  if (isBlank(fingerprintConfig.userAgent)) {
    level = escalateLevel(level, 'block')
    messages.push('User Agent 不能为空。')
  }

  if (!Number.isFinite(advanced.windowWidth) || !Number.isFinite(advanced.windowHeight) || advanced.windowWidth < 320 || advanced.windowHeight < 480) {
    level = escalateLevel(level, 'block')
    messages.push('窗口尺寸非法，无法稳定启动。')
  }

  const mobileUa = isMobileUserAgent(fingerprintConfig.userAgent)
  if (advanced.deviceMode === 'desktop' && mobileUa) {
    level = escalateLevel(level, 'warn')
    messages.push('当前 UA 与桌面设备模式不一致。')
  }

  if (advanced.deviceMode !== 'desktop' && !mobileUa) {
    level = escalateLevel(level, 'warn')
    messages.push('当前 UA 与移动设备模式不一致。')
  }

  if (hasMissingDerivedFields(profile)) {
    level = escalateLevel(level, 'warn')
    messages.push('自动联动已关闭，但时区、语言或地理位置仍缺失。')
  }

  if (messages.length === 0) {
    messages.push('环境校验通过，可启动。')
  }

  return { level, messages }
}

export function validateProfileConsistency(
  profile: ProfileRecord,
  check: NetworkHealthResult,
): ValidationResult {
  const messages: string[] = []
  let level: ValidationLevel = 'pass'
  const { fingerprintConfig, deviceProfile, environmentPurpose } = profile

  if (deviceProfile.browserVersion) {
    const uaMajor = getUserAgentChromeMajor(fingerprintConfig.userAgent)
    const deviceMajor = String(deviceProfile.browserVersion).split('.')[0] || ''
    if (uaMajor && deviceMajor && uaMajor !== deviceMajor) {
      level = escalateLevel(level, 'block')
      messages.push('当前 UA 主版本与设备画像中的浏览器版本不一致。')
    }
  }

  if (deviceProfile.operatingSystem !== fingerprintConfig.advanced.operatingSystem) {
    level = escalateLevel(level, 'block')
    messages.push('当前操作系统与设备画像不一致。')
  }

  const expectedPlatform = resolveExpectedPlatform(profile)
  if (deviceProfile.platform !== expectedPlatform) {
    level = escalateLevel(level, 'block')
    messages.push('当前 platform 与设备画像/操作系统不一致。')
  }

  if (
    deviceProfile.viewport.width !== fingerprintConfig.advanced.windowWidth ||
    deviceProfile.viewport.height !== fingerprintConfig.advanced.windowHeight
  ) {
    level = escalateLevel(level, 'warn')
    messages.push('当前窗口尺寸与设备画像不一致。')
  }

  if (
    deviceProfile.hardware.webglVendor !== fingerprintConfig.advanced.webglVendor ||
    deviceProfile.hardware.webglRenderer !== fingerprintConfig.advanced.webglRenderer
  ) {
    level = escalateLevel(level, 'warn')
    messages.push('当前 WebGL 指纹与设备画像不一致。')
  }

  if (environmentPurpose === 'register') {
    if (!fingerprintConfig.language || !fingerprintConfig.timezone || !fingerprintConfig.advanced.geolocation) {
      level = escalateLevel(level, 'warn')
      messages.push('当前标签为注册环境，建议补齐语言、时区和地理位置。')
    }
  }

  if (!check.ok) {
    if (environmentPurpose === 'register') {
      level = escalateLevel(level, 'warn')
      messages.push('当前标签为注册环境，但网络画像校验未完成。')
    } else {
      level = escalateLevel(level, 'warn')
      messages.push('当前网络画像校验失败，环境一致性无法完全确认。')
    }
  } else {
    if (check.timezone && fingerprintConfig.timezone && check.timezone !== fingerprintConfig.timezone) {
      level = escalateLevel(level, 'warn')
      messages.push(
        environmentPurpose === 'register'
          ? '当前标签为注册环境，代理出口时区与环境设置不一致。'
          : '当前代理出口时区与环境设置不一致。',
      )
    }
    const expectedLanguage = getLanguageRoot(fingerprintConfig.language)
    const actualLanguage = getLanguageRoot(check.languageHint)
    if (expectedLanguage && actualLanguage && expectedLanguage !== actualLanguage) {
      level = escalateLevel(level, 'warn')
      messages.push(
        environmentPurpose === 'register'
          ? '当前标签为注册环境，代理出口语言与环境设置不一致。'
          : '当前代理出口语言与环境设置不一致。',
      )
    }
    if (
      check.geolocation &&
      fingerprintConfig.advanced.geolocation &&
      check.geolocation !== fingerprintConfig.advanced.geolocation
    ) {
      level = escalateLevel(level, 'warn')
      messages.push(
        environmentPurpose === 'register'
          ? '当前标签为注册环境，代理出口地理位置与环境设置不一致。'
          : '当前代理出口地理位置与环境设置不一致。',
      )
    }
  }

  if (messages.length === 0) {
    messages.push('环境一致性校验通过。')
  }

  return { level, messages }
}

export function validateProfileReadiness(
  profile: ProfileRecord,
  proxy: ProxyRecord | null,
  check?: NetworkHealthResult,
  registrationCooldown?: RegistrationCooldownContext,
  lifecyclePolicy?: LifecyclePolicyContext,
): ValidationResult {
  const base = check
    ? combineResults(
        validateProfileForLaunch(profile, proxy),
        validatePurposeSpecificPolicies(profile),
        validatePlatformSpecificPolicies(profile),
        validateLifecyclePolicies(profile, lifecyclePolicy),
        validateProfileConsistency(profile, check),
      )
    : combineResults(
        validateProfileForLaunch(profile, proxy),
        validatePurposeSpecificPolicies(profile),
        validatePlatformSpecificPolicies(profile),
        validateLifecyclePolicies(profile, lifecyclePolicy),
      )

  if (
    !registrationCooldown ||
    profile.environmentPurpose !== 'register' ||
    registrationCooldown.recentUsages.length === 0
  ) {
    return base
  }

  const distinctProfiles = new Set(registrationCooldown.recentUsages.map((item) => item.profileId))
  const platformProfiles = new Set(
    registrationCooldown.platformRecentUsages.map((item) => item.profileId),
  )
  let result = base

  if (distinctProfiles.size >= registrationCooldown.maxProfiles) {
    result = combineResults(result, {
      level: 'warn',
      messages: [
        `当前标签为注册环境；当前出口 IP 在最近 ${registrationCooldown.withinHours} 小时内已被其他注册环境使用，不建议继续注册。`,
      ],
    })
  }

  if (registrationCooldown.platform && platformProfiles.size >= registrationCooldown.platformMaxProfiles) {
    result = combineResults(result, {
      level: 'warn',
      messages: [
        `${registrationCooldown.platform} 注册环境在最近 ${registrationCooldown.platformWithinHours} 小时内已复用当前出口 IP，当前仅作为风险提醒。`,
      ],
    })
  }

  return result
}

export function assessRegistrationRisk(
  profile: ProfileRecord,
  validation: ValidationResult,
  check?: NetworkHealthResult,
  registrationCooldown?: RegistrationCooldownContext,
): RegistrationRiskAssessment {
  if (profile.environmentPurpose !== 'register') {
    return {
      score: 0,
      level: 'low',
      factors: ['当前环境不是注册环境。'],
    }
  }

  let score = 0
  const factors: string[] = []
  const { fingerprintConfig, deviceProfile } = profile
  const platform = fingerprintConfig.basicSettings.platform.trim().toLowerCase()

  if (validation.level === 'warn') {
    score += 30
    factors.push('环境校验存在告警项。')
  } else if (validation.level === 'block') {
    score += 60
    factors.push('环境校验存在阻断项。')
  }

  if (!check?.ok) {
    score += 25
    factors.push('当前网络画像校验失败。')
  }

  if (registrationCooldown?.recentUsages.length) {
    score += 35
    factors.push(`当前出口 IP 在最近 ${registrationCooldown.withinHours} 小时内已有注册使用记录。`)
  }

  if (registrationCooldown?.platformRecentUsages.length) {
    score += 25
    factors.push(
      `${registrationCooldown.platform} 在最近 ${registrationCooldown.platformWithinHours} 小时内已复用当前出口 IP。`,
    )
  }

  if (fingerprintConfig.commonSettings.randomizeFingerprintOnLaunch) {
    score += 25
    factors.push('启动时随机化指纹会增加注册风险。')
  }

  if (fingerprintConfig.commonSettings.clearCacheOnLaunch) {
    score += 15
    factors.push('注册前清缓存会增加新环境身份波动。')
  }

  if (
    !fingerprintConfig.advanced.autoLanguageFromIp ||
    !fingerprintConfig.advanced.autoTimezoneFromIp ||
    !fingerprintConfig.advanced.autoGeolocationFromIp
  ) {
    score += 20
    factors.push('语言、时区或地理位置未完全跟随 IP 联动。')
  }

  if (
    deviceProfile.hardware.webglRenderer.includes('RTX 3090') ||
    deviceProfile.hardware.webglVendor.includes('NVIDIA')
  ) {
    score += 10
    factors.push('当前设备画像偏高配，更像批量模板而非自然办公设备。')
  }

  if (deviceProfile.support.fonts !== 'active') {
    score += 10
    factors.push('字体画像尚未完全落地。')
  }

  if (deviceProfile.support.deviceInfo !== 'active') {
    score += 10
    factors.push('设备信息画像仍处于部分实现状态。')
  }

  if (platform === 'linkedin') {
    score += 10
    factors.push('LinkedIn 对注册一致性更敏感，建议严格控制 IP 与环境复用。')
    if (fingerprintConfig.commonSettings.syncTabs) {
      score += 10
      factors.push('LinkedIn 注册环境开启标签页同步会增加额外噪声。')
    }
  }

  if (platform === 'tiktok') {
    if (fingerprintConfig.commonSettings.blockImages) {
      score += 15
      factors.push('TikTok 环境禁用图片会明显削弱内容场景真实性。')
    }
    if (fingerprintConfig.advanced.mediaDevicesMode === 'off') {
      score += 10
      factors.push('TikTok 环境完全关闭媒体设备会增加静态模板特征。')
    }
  }

  const normalizedScore = normalizeRiskScore(score)
  return {
    score: normalizedScore,
    level: getRiskLevel(normalizedScore),
    factors: factors.length > 0 ? Array.from(new Set(factors)) : ['当前注册环境风险较低。'],
  }
}
