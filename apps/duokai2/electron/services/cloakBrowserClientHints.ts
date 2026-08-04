export const CLOAK_CLIENT_HINTS_POLICY_VERSION = 1
export const CLOAK_WINDOWS_UACH_PLATFORM_VERSION = '19.0.0'

export type CloakClientHintsArchitecture = 'x86' | 'arm'
export type CloakClientHintsPlatform = 'windows' | 'macos' | 'linux'

export interface CloakClientHintsBrandVersion {
  brand: string
  version: string
}

export interface CloakClientHintsPolicy {
  schemaVersion: number
  enforcement: 'cdp-native-override'
  userAgent: string
  acceptLanguage: string
  navigatorPlatform: string
  metadata: {
    brands: CloakClientHintsBrandVersion[]
    fullVersionList: CloakClientHintsBrandVersion[]
    fullVersion: string
    platform: string
    platformVersion: string
    architecture: CloakClientHintsArchitecture
    model: string
    mobile: false
    bitness: string
    wow64: boolean
  }
}

export interface BuildCloakClientHintsPolicyInput {
  platform: CloakClientHintsPlatform
  locale: string
  userAgent: string
  chromiumVersion: string
  platformVersion: string
  architecture: CloakClientHintsArchitecture
  bitness: string
  wow64: boolean
}

export interface CloakClientHintsObservation {
  userAgent: string
  navigatorPlatform: string
  architecture: string
  bitness: string
  platform: string
  platformVersion: string
  wow64: boolean
}

export interface CloakClientHintsCoherenceResult {
  passed: boolean
  mismatches: string[]
}

interface CdpSessionLike {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>
  detach?: () => Promise<void>
}

interface ClientHintsPageLike {
  close?: () => Promise<void>
}

export interface ClientHintsContextLike<Page extends ClientHintsPageLike = ClientHintsPageLike> {
  pages(): Page[]
  newPage(): Promise<Page>
  newCDPSession(page: Page): Promise<CdpSessionLike>
  on?(event: 'page', listener: (page: Page) => void): void
  close?(): Promise<void>
}

function buildAcceptLanguage(locale: string): string {
  const normalized = locale.trim()
  const root = normalized.split('-')[0]?.trim()
  return root && root.toLowerCase() !== normalized.toLowerCase()
    ? `${normalized},${root}`
    : normalized
}

function normalizeChromiumUserAgent(
  userAgent: string,
  chromiumMajor: string,
): string {
  const normalized = userAgent.trim()
  if (!/Chrome\/\d+(?:\.\d+){0,3}/.test(normalized)) {
    return normalized
  }
  return normalized.replace(
    /Chrome\/\d+(?:\.\d+){0,3}/,
    `Chrome/${chromiumMajor}.0.0.0`,
  )
}

function platformIdentity(platform: CloakClientHintsPlatform): {
  platform: string
  navigatorPlatform: string
} {
  if (platform === 'windows') {
    return { platform: 'Windows', navigatorPlatform: 'Win32' }
  }
  if (platform === 'macos') {
    return { platform: 'macOS', navigatorPlatform: 'MacIntel' }
  }
  return { platform: 'Linux', navigatorPlatform: 'Linux x86_64' }
}

export function buildCloakClientHintsPolicy(
  input: BuildCloakClientHintsPolicyInput,
): CloakClientHintsPolicy {
  const chromiumVersion = input.chromiumVersion.split('.').slice(0, 4).join('.')
  const chromiumMajor = chromiumVersion.split('.')[0] || ''
  if (!/^\d+(?:\.\d+){3}$/.test(chromiumVersion)) {
    throw new Error(`A four-part Chromium version is required for UA-CH policy: ${input.chromiumVersion}`)
  }
  const locale = input.locale.trim()
  const userAgent = normalizeChromiumUserAgent(input.userAgent, chromiumMajor)
  const platformVersion =
    input.platform === 'windows'
      ? CLOAK_WINDOWS_UACH_PLATFORM_VERSION
      : input.platformVersion.trim()
  if (!locale || !userAgent || !platformVersion || !input.bitness.trim()) {
    throw new Error('UA-CH policy requires locale, User-Agent, platform version and bitness.')
  }
  const identity = platformIdentity(input.platform)
  return {
    schemaVersion: CLOAK_CLIENT_HINTS_POLICY_VERSION,
    enforcement: 'cdp-native-override',
    userAgent,
    acceptLanguage: buildAcceptLanguage(locale),
    navigatorPlatform: identity.navigatorPlatform,
    metadata: {
      brands: [
        { brand: 'Not:A-Brand', version: '99' },
        { brand: 'Google Chrome', version: chromiumMajor },
        { brand: 'Chromium', version: chromiumMajor },
      ],
      fullVersionList: [
        { brand: 'Not:A-Brand', version: '99.0.0.0' },
        { brand: 'Google Chrome', version: chromiumVersion },
        { brand: 'Chromium', version: chromiumVersion },
      ],
      fullVersion: chromiumVersion,
      platform: identity.platform,
      platformVersion,
      architecture: input.architecture,
      model: '',
      mobile: false,
      bitness: input.bitness.trim(),
      wow64: input.wow64,
    },
  }
}

export function evaluateCloakClientHintsCoherence(
  policy: CloakClientHintsPolicy,
  observation: CloakClientHintsObservation | null,
): CloakClientHintsCoherenceResult {
  if (!observation) {
    return { passed: false, mismatches: ['navigator.userAgentData is unavailable'] }
  }
  const expected = {
    userAgent: policy.userAgent,
    navigatorPlatform: policy.navigatorPlatform,
    architecture: policy.metadata.architecture,
    bitness: policy.metadata.bitness,
    platform: policy.metadata.platform,
    platformVersion: policy.metadata.platformVersion,
    wow64: policy.metadata.wow64,
  }
  const mismatches = Object.entries(expected)
    .filter(([key, value]) => observation[key as keyof CloakClientHintsObservation] !== value)
    .map(
      ([key, value]) =>
        `${key}: expected ${JSON.stringify(value)}, observed ${JSON.stringify(
          observation[key as keyof CloakClientHintsObservation],
        )}`,
    )
  return { passed: mismatches.length === 0, mismatches }
}

export async function installCloakClientHintsPolicy<Page extends ClientHintsPageLike>(
  context: ClientHintsContextLike<Page>,
  policy: CloakClientHintsPolicy,
): Promise<void> {
  if (
    policy.schemaVersion !== CLOAK_CLIENT_HINTS_POLICY_VERSION ||
    policy.enforcement !== 'cdp-native-override'
  ) {
    throw new Error('Unsupported Cloak UA-CH policy.')
  }

  const applied = new WeakMap<object, Promise<void>>()
  const sessions = new Set<CdpSessionLike>()
  const apply = (page: Page): Promise<void> => {
    const key = page as object
    const existing = applied.get(key)
    if (existing) {
      return existing
    }
    const operation = (async () => {
      const session = await context.newCDPSession(page)
      try {
        await session.send('Emulation.setUserAgentOverride', {
          userAgent: policy.userAgent,
          acceptLanguage: policy.acceptLanguage,
          platform: policy.navigatorPlatform,
          userAgentMetadata: policy.metadata,
        })
        sessions.add(session)
      } catch (error) {
        await session.detach?.().catch(() => undefined)
        throw error
      }
    })()
    applied.set(key, operation)
    return operation
  }

  const originalNewPage = context.newPage.bind(context)
  context.newPage = async () => {
    const page = await originalNewPage()
    await apply(page)
    return page
  }

  context.on?.('page', (page) => {
    void apply(page).catch(async () => {
      await page.close?.().catch(() => undefined)
    })
  })

  if (context.close) {
    const originalClose = context.close.bind(context)
    context.close = async () => {
      await Promise.all(
        [...sessions].map((session) => session.detach?.().catch(() => undefined)),
      )
      sessions.clear()
      await originalClose()
    }
  }

  await Promise.all(context.pages().map((page) => apply(page)))
}
