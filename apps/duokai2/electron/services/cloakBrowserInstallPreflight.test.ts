import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import type { CloakBrowserModuleLike } from './cloakBrowserRuntime.ts'
import {
  CLOAK_PILOT_BROWSER_VERSION,
  CloakInstallPreflightError,
  runCloakInstallPreflight,
} from './cloakBrowserInstallPreflight.ts'

const SHA = 'a'.repeat(64)
const CACHE_DIR = path.resolve('/Users/test/.cloakbrowser')
const VERSION_DIR = `${CACHE_DIR}/chromium-${CLOAK_PILOT_BROWSER_VERSION}`
const BINARY_PATH = `${VERSION_DIR}/Chromium.app/Contents/MacOS/Chromium`

function moduleFixture(overrides: Partial<ReturnType<CloakBrowserModuleLike['binaryInfo']>> = {}): CloakBrowserModuleLike {
  return {
    binaryInfo: () => ({
      version: CLOAK_PILOT_BROWSER_VERSION,
      bundledVersion: CLOAK_PILOT_BROWSER_VERSION,
      platform: 'darwin-arm64',
      tier: 'free',
      binaryPath: BINARY_PATH,
      installed: true,
      cacheDir: VERSION_DIR,
      downloadUrl: 'https://example.invalid/cloak.zip',
      ...overrides,
    }),
    launchPersistentContext: async () => {
      throw new Error('launch must not run during install preflight')
    },
  }
}

const dependencies = {
  loadModule: async () => moduleFixture(),
  assertBinaryReady: async () => undefined,
  runBinaryVersionCommand: async () => 'Chromium 145.0.7632.109',
  hashBinary: async () => SHA,
  now: () => new Date('2026-07-26T17:00:00.000Z'),
}

test('install preflight binds exact version, cache, executable and SHA without launch', async () => {
  const receipt = await runCloakInstallPreflight(
    {
      cacheDir: CACHE_DIR,
      expectedBinarySha256: SHA,
      environment: {
        appPath: '/Applications/Duokai.app',
        resourcesPath: '/Applications/Duokai.app/Contents/Resources',
        temporaryDirectory: '/tmp',
      },
    },
    dependencies,
  )

  assert.equal(receipt.browserVersion, CLOAK_PILOT_BROWSER_VERSION)
  assert.equal(receipt.executableChromiumVersion, '145.0.7632.109')
  assert.equal(receipt.binarySha256, SHA)
  assert.equal(receipt.cacheDir, CACHE_DIR)
  assert.equal(receipt.launchAutoDownload, false)
  assert.equal(receipt.fallbackEngine, 'forbidden')
})

test('install preflight rejects an unpinned or unexpected browser version', async () => {
  await assert.rejects(
    runCloakInstallPreflight(
      {
        cacheDir: CACHE_DIR,
        expectedBinarySha256: SHA,
        browserVersion: '145.0.7632.110.1',
      },
      dependencies,
    ),
    (error: unknown) =>
      error instanceof CloakInstallPreflightError && error.code === 'invalid_configuration',
  )
})

test('install preflight rejects SHA drift', async () => {
  await assert.rejects(
    runCloakInstallPreflight(
      { cacheDir: CACHE_DIR, expectedBinarySha256: 'b'.repeat(64) },
      dependencies,
    ),
    (error: unknown) =>
      error instanceof CloakInstallPreflightError && error.code === 'binary_hash_mismatch',
  )
})

test('install preflight rejects wrapper cache drift', async () => {
  await assert.rejects(
    runCloakInstallPreflight(
      { cacheDir: CACHE_DIR, expectedBinarySha256: SHA },
      {
        ...dependencies,
        loadModule: async () =>
          moduleFixture({
            cacheDir: `/Users/test/other-cache/chromium-${CLOAK_PILOT_BROWSER_VERSION}`,
          }),
      },
    ),
    (error: unknown) =>
      error instanceof CloakInstallPreflightError && error.code === 'wrapper_identity_mismatch',
  )
})

test('install preflight rejects cache inside application or temporary roots', async () => {
  for (const cacheDir of [
    '/Applications/Duokai.app/Contents/Resources/cloak-cache',
    '/tmp/cloak-cache',
  ]) {
    await assert.rejects(
      runCloakInstallPreflight(
        {
          cacheDir,
          expectedBinarySha256: SHA,
          environment: {
            appPath: '/Applications/Duokai.app',
            resourcesPath: '/Applications/Duokai.app/Contents/Resources',
            temporaryDirectory: '/tmp',
          },
        },
        dependencies,
      ),
      (error: unknown) =>
        error instanceof CloakInstallPreflightError && error.code === 'unsafe_cache_location',
    )
  }
})
