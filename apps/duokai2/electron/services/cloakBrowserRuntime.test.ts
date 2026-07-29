import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { CloakBrowserRuntimeIdentity } from './cloakBrowserIdentity.ts'
import {
  buildCloakLaunchEnv,
  buildCloakLaunchOptions,
  closeCloakContextSafely,
  CloakRuntimeError,
  configureCloakProcessEnvironment,
  ensureCloakProfileLocalePreferences,
  launchCloakPersistentContext,
  normalizeCloakArgs,
  type CloakBrowserContextLike,
  type CloakBrowserModuleLike,
  type CloakRuntimeLaunchRequest,
} from './cloakBrowserRuntime.ts'

function buildRequest(
  overrides: Partial<CloakRuntimeLaunchRequest> = {},
): CloakRuntimeLaunchRequest {
  return {
    userDataDir: '/tmp/duokai-cloak-profile',
    downloadsDir: '/tmp/duokai-cloak-downloads',
    cacheDir: '/tmp/duokai-cloak-cache',
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    fingerprintSeed: 123456,
    browserVersion: '145.0.7632.109.2',
    viewport: null,
    deviceMode: 'desktop',
    ...overrides,
  }
}

function buildIdentity(binaryPath: string): CloakBrowserRuntimeIdentity {
  return {
    engine: 'cloakbrowser',
    cloakWrapperVersion: '0.5.2',
    requestedChromiumVersion: '145.0.7632.109.2',
    installedChromiumVersion: '145.0.7632.109.2',
    executableChromiumVersion: '145.0.7632.109',
    runtimeChromiumVersion: '145.0.7632.109',
    chromiumMajor: '145',
    binaryPath,
    binarySha256: 'c'.repeat(64),
    tier: 'free',
    releaseChannel: 'stable',
    platform: 'darwin-arm64',
    verifiedAt: '2026-07-26T00:00:00.000Z',
  }
}

function createContext(onClose?: () => void): CloakBrowserContextLike {
  const page = {}
  return {
    pages: () => [page],
    newPage: async () => page,
    newCDPSession: async () => ({
      send: async () => ({ product: 'Chrome/145.0.7632.109' }),
    }),
    close: async () => {
      onClose?.()
    },
  }
}

test('buildCloakLaunchOptions enforces stealth-safe PoC defaults', () => {
  const options = buildCloakLaunchOptions(
    buildRequest({
      extraArgs: ['--window-size=1440,900'],
      permissions: ['geolocation'],
      geolocation: { latitude: 34.05, longitude: -118.24 },
      proxy: {
        server: 'http://127.0.0.1:45678',
        bypass: '<-loopback>',
      },
      env: {
        PATH: '/usr/bin',
        HTTP_PROXY: 'http://proxy.invalid',
        ALL_PROXY: 'socks5://proxy.invalid',
      },
    }),
  )

  assert.equal(options.headless, false)
  assert.equal(options.stealthArgs, false)
  assert.equal(options.geoip, false)
  assert.equal(options.browserVersion, '145.0.7632.109.2')
  assert.equal(options.releaseChannel, 'stable')
  assert.equal(options.locale, 'en-US')
  assert.equal(options.timezone, 'America/Los_Angeles')
  assert.deepEqual(options.proxy, {
    server: 'http://127.0.0.1:45678',
    bypass: '<-loopback>',
  })

  const args = options.args as string[]
  assert.equal(args.filter((arg) => arg.startsWith('--fingerprint=')).length, 1)
  assert.equal(args.includes('--fingerprint=123456'), true)
  assert.equal(args.includes('--window-size=1440,900'), true)

  const contextOptions = options.contextOptions as Record<string, unknown>
  assert.equal(contextOptions.acceptDownloads, true)
  assert.deepEqual(contextOptions.permissions, ['geolocation'])
  assert.deepEqual(contextOptions.geolocation, { latitude: 34.05, longitude: -118.24 })

  const launchOptions = options.launchOptions as Record<string, unknown>
  assert.equal(launchOptions.downloadsPath, '/tmp/duokai-cloak-downloads')
  const env = launchOptions.env as NodeJS.ProcessEnv
  assert.equal(env.HTTP_PROXY, undefined)
  assert.equal(env.ALL_PROXY, undefined)
  assert.equal(env.CLOAKBROWSER_AUTO_UPDATE, 'false')
  assert.equal(env.CLOAKBROWSER_VERSION, '145.0.7632.109.2')
  assert.equal(env.CLOAKBROWSER_RELEASE_CHANNEL, 'stable')
  assert.equal(env.CLOAKBROWSER_CACHE_DIR, '/tmp/duokai-cloak-cache')
})

test('buildCloakLaunchOptions rejects raw or credential-bearing proxy transports', () => {
  for (const proxy of [
    { server: 'http://proxy.example:8080' },
    { server: 'socks5://127.0.0.1:1080' },
    { server: 'http://user:pass@127.0.0.1:8080' },
    { server: 'http://127.0.0.1:8080', username: 'user', password: 'pass' },
  ]) {
    assert.throws(
      () => buildCloakLaunchOptions(buildRequest({ proxy })),
      (error: unknown) =>
        error instanceof CloakRuntimeError && error.code === 'invalid_request',
    )
  }
})

test('configureCloakProcessEnvironment pins wrapper-side cache and update policy', () => {
  const keys = [
    'CLOAKBROWSER_AUTO_UPDATE',
    'CLOAKBROWSER_VERSION',
    'CLOAKBROWSER_RELEASE_CHANNEL',
    'CLOAKBROWSER_CACHE_DIR',
  ] as const
  const previous = new Map(keys.map((key) => [key, process.env[key]]))
  try {
    configureCloakProcessEnvironment({
      browserVersion: '145.0.7632.109.2',
      cacheDir: '/tmp/wrapper-cache',
    })
    assert.equal(process.env.CLOAKBROWSER_AUTO_UPDATE, 'false')
    assert.equal(process.env.CLOAKBROWSER_VERSION, '145.0.7632.109.2')
    assert.equal(process.env.CLOAKBROWSER_RELEASE_CHANNEL, 'stable')
    assert.equal(process.env.CLOAKBROWSER_CACHE_DIR, '/tmp/wrapper-cache')
  } finally {
    for (const key of keys) {
      const value = previous.get(key)
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
})

test('ensureCloakProfileLocalePreferences persists stable browser language preferences', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'duokai-cloak-locale-'))
  try {
    await ensureCloakProfileLocalePreferences(root, 'en-US')
    const preferencesPath = path.join(root, 'Default', 'Preferences')
    const preferences = JSON.parse(readFileSync(preferencesPath, 'utf8')) as {
      intl?: Record<string, unknown>
    }
    assert.equal(preferences.intl?.accept_languages, 'en-US,en')
    assert.equal(preferences.intl?.selected_languages, 'en-US,en')

    preferences.intl = {
      ...preferences.intl,
      unrelated: 'preserved',
    }
    writeFileSync(preferencesPath, JSON.stringify(preferences), 'utf8')
    await ensureCloakProfileLocalePreferences(root, 'ja-JP')
    const updated = JSON.parse(readFileSync(preferencesPath, 'utf8')) as {
      intl?: Record<string, unknown>
    }
    assert.equal(updated.intl?.accept_languages, 'ja-JP,ja')
    assert.equal(updated.intl?.selected_languages, 'ja-JP,ja')
    assert.equal(updated.intl?.unrelated, 'preserved')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('buildCloakLaunchEnv removes all inherited proxy variables', () => {
  const env = buildCloakLaunchEnv({
    browserVersion: '145.0.7632.109.2',
    cacheDir: '/tmp/cache',
    env: {
      HTTP_PROXY: 'one',
      HTTPS_PROXY: 'two',
      ALL_PROXY: 'three',
      http_proxy: 'four',
      https_proxy: 'five',
      all_proxy: 'six',
      GIT_HTTP_PROXY: 'seven',
      GIT_HTTPS_PROXY: 'eight',
      SAFE_VALUE: 'preserved',
    },
  })
  assert.equal(env.SAFE_VALUE, 'preserved')
  for (const key of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'GIT_HTTP_PROXY',
    'GIT_HTTPS_PROXY',
  ]) {
    assert.equal(env[key], undefined)
  }
})

test('normalizeCloakArgs accepts only trusted mapped fingerprint arguments', () => {
  const args = normalizeCloakArgs(
    ['--window-size=1440,900'],
    123,
    [
      '--fingerprint-platform=macos',
      '--fingerprint-hardware-concurrency=8',
      '--fingerprint-device-memory=8',
      '--fingerprint-screen-width=1440',
      '--fingerprint-screen-height=900',
      '--fingerprint-webrtc-ip=203.0.113.25',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
  )

  assert.equal(args.includes('--window-size=1440,900'), true)
  assert.equal(args.includes('--fingerprint=123'), true)
  assert.equal(args.includes('--fingerprint-platform=macos'), true)
  assert.equal(args.includes('--fingerprint-webrtc-ip=203.0.113.25'), true)
  assert.equal(
    args.includes('--force-webrtc-ip-handling-policy=disable_non_proxied_udp'),
    true,
  )

  assert.throws(
    () => normalizeCloakArgs([], 123, ['--fingerprint-unknown=value']),
    (error: unknown) =>
      error instanceof CloakRuntimeError && error.code === 'invalid_request',
  )
  assert.throws(
    () => normalizeCloakArgs([], 123, ['--remote-debugging-port=9222']),
    (error: unknown) =>
      error instanceof CloakRuntimeError && error.code === 'invalid_request',
  )
})

test('normalizeCloakArgs rejects protected overrides and automatic WebRTC IP', () => {
  for (const argument of [
    '--fingerprint=9',
    '--user-data-dir=/tmp/other',
    '--profile-directory=Default',
    '--remote-debugging-port=9222',
    '--lang=fr-FR',
    '--accept-lang=fr-FR',
    '--fingerprint-webrtc-ip=203.0.113.25',
    '--fingerprint-webrtc-ip=auto',
    '--disable-webrtc',
  ]) {
    assert.throws(
      () => normalizeCloakArgs([argument], 123),
      (error: unknown) =>
        error instanceof CloakRuntimeError && error.code === 'invalid_request',
      argument,
    )
  }
})

test('buildCloakLaunchOptions rejects mobile device modes', () => {
  assert.throws(
    () => buildCloakLaunchOptions(buildRequest({ deviceMode: 'android' })),
    (error: unknown) =>
      error instanceof CloakRuntimeError && error.code === 'unsupported_platform',
  )
})

test('launch fails closed before wrapper launch when binary is unavailable', async () => {
  let launchCalls = 0
  const module: CloakBrowserModuleLike = {
    binaryInfo: () => ({
      version: '145.0.7632.109.2',
      bundledVersion: '146.0.7680.177.5',
      platform: 'darwin-arm64',
      tier: 'free',
      binaryPath: '/missing/CloakBrowser',
      installed: false,
      cacheDir: '/missing',
      downloadUrl: 'https://example.invalid',
    }),
    launchPersistentContext: async () => {
      launchCalls += 1
      return createContext()
    },
  }

  await assert.rejects(
    launchCloakPersistentContext(buildRequest(), {
      loadModule: async () => module,
    }),
    (error: unknown) =>
      error instanceof CloakRuntimeError && error.code === 'binary_not_installed',
  )
  assert.equal(launchCalls, 0)
})

test('launch returns injected runtime identity without any fallback path', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'duokai-cloak-runtime-'))
  const binaryPath = path.join(root, 'Chromium')
  writeFileSync(binaryPath, 'binary', 'utf8')
  chmodSync(binaryPath, 0o755)
  const captured: { options?: Record<string, unknown> } = {}
  const context = createContext()
  const module: CloakBrowserModuleLike = {
    binaryInfo: () => ({
      version: '145.0.7632.109.2',
      bundledVersion: '146.0.7680.177.5',
      platform: 'darwin-arm64',
      tier: 'free',
      binaryPath,
      installed: true,
      cacheDir: root,
      downloadUrl: 'https://example.invalid',
    }),
    launchPersistentContext: async (options) => {
      captured.options = options
      return context
    },
  }
  try {
    const result = await launchCloakPersistentContext(
      buildRequest({ userDataDir: path.join(root, 'profile') }),
      {
      loadModule: async () => module,
      inspectIdentity: async () => buildIdentity(binaryPath),
        now: () => new Date('2026-07-26T00:00:00.000Z'),
      },
    )
    assert.equal(result.context, context)
    assert.equal(result.identity.engine, 'cloakbrowser')
    assert.equal(result.launchedAt, '2026-07-26T00:00:00.000Z')
    assert.equal(captured.options?.geoip, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('identity failure closes the newly launched context', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'duokai-cloak-close-'))
  const binaryPath = path.join(root, 'Chromium')
  writeFileSync(binaryPath, 'binary', 'utf8')
  chmodSync(binaryPath, 0o755)
  let closed = false
  const module: CloakBrowserModuleLike = {
    binaryInfo: () => ({
      version: '145.0.7632.109.2',
      bundledVersion: '146.0.7680.177.5',
      platform: 'darwin-arm64',
      tier: 'free',
      binaryPath,
      installed: true,
      cacheDir: root,
      downloadUrl: 'https://example.invalid',
    }),
    launchPersistentContext: async () => createContext(() => {
      closed = true
    }),
  }
  try {
    await assert.rejects(
      launchCloakPersistentContext(
        buildRequest({ userDataDir: path.join(root, 'profile') }),
        {
        loadModule: async () => module,
          inspectIdentity: async () => {
            throw new Error('identity failed')
          },
        },
      ),
      (error: unknown) =>
        error instanceof CloakRuntimeError && error.code === 'launch_failed',
    )
    assert.equal(closed, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('closeCloakContextSafely tolerates null and close failures', async () => {
  await assert.doesNotReject(closeCloakContextSafely(null))
  await assert.doesNotReject(
    closeCloakContextSafely({
      close: async () => {
        throw new Error('already closed')
      },
    }),
  )
})
