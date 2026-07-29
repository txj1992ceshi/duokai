import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  assertCloakBinaryReady,
  CloakIdentityError,
  computeBinarySha256,
  inspectCloakRuntimeIdentity,
  parseChromiumVersionOutput,
  validateCloakRuntimeIdentity,
  type CloakBrowserRuntimeIdentity,
  type CloakRuntimeContextLike,
  type CloakRuntimePageLike,
} from './cloakBrowserIdentity.ts'

function createTempBinary(content = 'cloak-binary-fixture'): {
  root: string
  binaryPath: string
} {
  const root = mkdtempSync(path.join(os.tmpdir(), 'duokai-cloak-identity-'))
  const binaryPath = path.join(root, 'Chromium')
  writeFileSync(binaryPath, content, 'utf8')
  chmodSync(binaryPath, 0o755)
  return { root, binaryPath }
}

function createRuntimeContext(version = 'Chrome/145.0.7632.109'): CloakRuntimeContextLike {
  const page: CloakRuntimePageLike = {}
  return {
    pages: () => [page],
    newPage: async () => page,
    newCDPSession: async () => ({
      send: async () => ({ product: version }),
      detach: async () => undefined,
    }),
  }
}

test('parseChromiumVersionOutput extracts four and five component versions', () => {
  assert.deepEqual(parseChromiumVersionOutput('Chromium 145.0.7632.109'), {
    fullVersion: '145.0.7632.109',
    runtimeBaseVersion: '145.0.7632.109',
    major: '145',
  })
  assert.deepEqual(parseChromiumVersionOutput('Google Chrome 145.0.7632.109.2'), {
    fullVersion: '145.0.7632.109.2',
    runtimeBaseVersion: '145.0.7632.109',
    major: '145',
  })
  assert.equal(
    parseChromiumVersionOutput('HeadlessChrome/146.0.7680.177').fullVersion,
    '146.0.7680.177',
  )
})

test('parseChromiumVersionOutput rejects missing version data', () => {
  assert.throws(
    () => parseChromiumVersionOutput('Chromium version unavailable'),
    (error: unknown) =>
      error instanceof CloakIdentityError && error.code === 'version_probe_failed',
  )
})

test('computeBinarySha256 is stable and changes with file content', async () => {
  const first = createTempBinary('first')
  const second = createTempBinary('second')
  try {
    const firstHash = await computeBinarySha256(first.binaryPath)
    assert.equal(firstHash, await computeBinarySha256(first.binaryPath))
    assert.notEqual(firstHash, await computeBinarySha256(second.binaryPath))
    assert.match(firstHash, /^[a-f0-9]{64}$/)
  } finally {
    rmSync(first.root, { recursive: true, force: true })
    rmSync(second.root, { recursive: true, force: true })
  }
})

test('assertCloakBinaryReady rejects missing binaries', async () => {
  await assert.rejects(
    assertCloakBinaryReady({
      version: '145.0.7632.109.2',
      bundledVersion: '146.0.7680.177.5',
      platform: 'darwin-arm64',
      tier: 'free',
      binaryPath: '/missing/cloakbrowser',
      installed: false,
      cacheDir: '/missing',
      downloadUrl: 'https://example.invalid',
    }),
    (error: unknown) =>
      error instanceof CloakIdentityError && error.code === 'binary_not_installed',
  )
})

test('validateCloakRuntimeIdentity accepts package suffix with matching runtime base', () => {
  const identity: CloakBrowserRuntimeIdentity = {
    engine: 'cloakbrowser',
    cloakWrapperVersion: '0.5.2',
    requestedChromiumVersion: '145.0.7632.109.2',
    installedChromiumVersion: '145.0.7632.109.2',
    executableChromiumVersion: '145.0.7632.109',
    runtimeChromiumVersion: '145.0.7632.109',
    chromiumMajor: '145',
    binaryPath: '/tmp/Chromium',
    binarySha256: 'a'.repeat(64),
    tier: 'free',
    releaseChannel: 'stable',
    platform: 'darwin-arm64',
    verifiedAt: '2026-07-26T00:00:00.000Z',
  }
  assert.doesNotThrow(() => validateCloakRuntimeIdentity(identity))
})

test('validateCloakRuntimeIdentity rejects runtime version drift', () => {
  const identity: CloakBrowserRuntimeIdentity = {
    engine: 'cloakbrowser',
    cloakWrapperVersion: '0.5.2',
    requestedChromiumVersion: '145.0.7632.109.2',
    installedChromiumVersion: '145.0.7632.109.2',
    executableChromiumVersion: '145.0.7632.109',
    runtimeChromiumVersion: '146.0.7680.177',
    chromiumMajor: '146',
    binaryPath: '/tmp/Chromium',
    binarySha256: 'b'.repeat(64),
    tier: 'free',
    releaseChannel: 'stable',
    platform: 'darwin-arm64',
    verifiedAt: '2026-07-26T00:00:00.000Z',
  }
  assert.throws(
    () => validateCloakRuntimeIdentity(identity),
    (error: unknown) =>
      error instanceof CloakIdentityError && error.code === 'version_mismatch',
  )
})

test('inspectCloakRuntimeIdentity records executable, runtime and hash evidence', async () => {
  const fixture = createTempBinary('identity-evidence')
  try {
    const identity = await inspectCloakRuntimeIdentity({
      wrapperVersion: '0.5.2',
      requestedChromiumVersion: '145.0.7632.109.2',
      releaseChannel: 'stable',
      descriptor: {
        version: '145.0.7632.109.2',
        bundledVersion: '146.0.7680.177.5',
        platform: 'darwin-arm64',
        tier: 'free',
        binaryPath: fixture.binaryPath,
        installed: true,
        cacheDir: fixture.root,
        downloadUrl: 'https://example.invalid',
      },
      context: createRuntimeContext(),
      runBinaryVersionCommand: async () => 'Chromium 145.0.7632.109',
      now: () => new Date('2026-07-26T00:00:00.000Z'),
    })
    assert.equal(identity.engine, 'cloakbrowser')
    assert.equal(identity.chromiumMajor, '145')
    assert.equal(identity.executableChromiumVersion, '145.0.7632.109')
    assert.equal(identity.runtimeChromiumVersion, '145.0.7632.109')
    assert.match(identity.binarySha256, /^[a-f0-9]{64}$/)
    assert.equal('licenseKey' in identity, false)
  } finally {
    rmSync(fixture.root, { recursive: true, force: true })
  }
})
