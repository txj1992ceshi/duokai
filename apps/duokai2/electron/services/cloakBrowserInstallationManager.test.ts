import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  CLOAK_INSTALLATION_RECEIPT_FILENAME,
  CloakInstallationManagerError,
  installCloakBrowserFixedVersion,
  readCloakInstallationReceipt,
  verifyCloakBrowserInstallation,
} from './cloakBrowserInstallationManager.ts'
import {
  CLOAK_PILOT_BROWSER_VERSION,
  type CloakInstallPreflightReceipt,
} from './cloakBrowserInstallPreflight.ts'

const SHA = 'a'.repeat(64)

async function fixture(): Promise<{
  root: string
  cacheDir: string
  binaryPath: string
  receiptPath: string
  preflight: CloakInstallPreflightReceipt
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-install-manager-'))
  const cacheDir = path.join(root, 'managed-cache')
  const versionDir = path.join(cacheDir, `chromium-${CLOAK_PILOT_BROWSER_VERSION}`)
  const binaryPath = path.join(versionDir, 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
  const receiptPath = path.join(cacheDir, CLOAK_INSTALLATION_RECEIPT_FILENAME)
  return {
    root,
    cacheDir,
    binaryPath,
    receiptPath,
    preflight: {
      schemaVersion: 1,
      engine: 'cloakbrowser',
      wrapperVersion: '0.5.2',
      browserVersion: CLOAK_PILOT_BROWSER_VERSION,
      executableChromiumVersion: '145.0.7632.109',
      releaseChannel: 'stable',
      platform: 'darwin-arm64',
      tier: 'free',
      cacheDir,
      binaryPath,
      binarySha256: SHA,
      launchAutoDownload: false,
      fallbackEngine: 'forbidden',
      verifiedAt: '2026-07-27T16:30:00.000Z',
    },
  }
}

test('explicit fixed-version install writes a private self-hashed receipt', async () => {
  const value = await fixture()
  try {
    let ensureCalls = 0
    const receipt = await installCloakBrowserFixedVersion(
      {
        cacheDir: value.cacheDir,
        expectedBinarySha256: SHA,
        explicitConsent: true,
      },
      {
        ensureBinary: async (_license, version, channel) => {
          ensureCalls += 1
          assert.equal(version, CLOAK_PILOT_BROWSER_VERSION)
          assert.equal(channel, 'stable')
          return value.binaryPath
        },
        preflight: async () => value.preflight,
        now: () => new Date('2026-07-27T16:31:00.000Z'),
      },
    )

    assert.equal(ensureCalls, 1)
    assert.equal(receipt.installationMode, 'explicit-fixed-version')
    assert.equal(receipt.launchAutoDownload, false)
    assert.equal(receipt.wrapperAutoUpdate, false)
    assert.equal(receipt.browserAutoUpdate, false)
    assert.equal(receipt.fallbackEngine, 'forbidden')
    assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(await readCloakInstallationReceipt(value.receiptPath), receipt)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('installation cannot download without explicit consent', async () => {
  const value = await fixture()
  try {
    let ensureCalls = 0
    await assert.rejects(
      installCloakBrowserFixedVersion(
        {
          cacheDir: value.cacheDir,
          expectedBinarySha256: SHA,
          explicitConsent: false,
        },
        {
          ensureBinary: async () => {
            ensureCalls += 1
            return value.binaryPath
          },
          preflight: async () => value.preflight,
        },
      ),
      (error: unknown) =>
        error instanceof CloakInstallationManagerError &&
        error.code === 'explicit_consent_required',
    )
    assert.equal(ensureCalls, 0)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('launch verification reads the receipt and never invokes the installer', async () => {
  const value = await fixture()
  try {
    await installCloakBrowserFixedVersion(
      {
        cacheDir: value.cacheDir,
        expectedBinarySha256: SHA,
        explicitConsent: true,
      },
      {
        ensureBinary: async () => value.binaryPath,
        preflight: async () => value.preflight,
      },
    )
    let preflightCalls = 0
    const verified = await verifyCloakBrowserInstallation(
      {
        cacheDir: value.cacheDir,
        expectedBinarySha256: SHA,
      },
      {
        preflight: async () => {
          preflightCalls += 1
          return value.preflight
        },
      },
    )
    assert.equal(preflightCalls, 1)
    assert.equal(verified.receipt.binaryPath, value.binaryPath)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('receipt tampering and current-binary drift fail closed', async () => {
  const value = await fixture()
  try {
    await installCloakBrowserFixedVersion(
      {
        cacheDir: value.cacheDir,
        expectedBinarySha256: SHA,
        explicitConsent: true,
      },
      {
        ensureBinary: async () => value.binaryPath,
        preflight: async () => value.preflight,
      },
    )

    const parsed = JSON.parse(await readFile(value.receiptPath, 'utf8')) as Record<string, unknown>
    parsed.binarySha256 = 'b'.repeat(64)
    await writeFile(value.receiptPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 })
    if (process.platform !== 'win32') await chmod(value.receiptPath, 0o600)
    await assert.rejects(
      readCloakInstallationReceipt(value.receiptPath),
      (error: unknown) =>
        error instanceof CloakInstallationManagerError && error.code === 'receipt_invalid',
    )

    await installCloakBrowserFixedVersion(
      {
        cacheDir: value.cacheDir,
        expectedBinarySha256: SHA,
        explicitConsent: true,
      },
      {
        ensureBinary: async () => value.binaryPath,
        preflight: async () => value.preflight,
      },
    )
    await assert.rejects(
      verifyCloakBrowserInstallation(
        { cacheDir: value.cacheDir, expectedBinarySha256: SHA },
        {
          preflight: async () => ({
            ...value.preflight,
            binarySha256: 'c'.repeat(64),
          }),
        },
      ),
      (error: unknown) =>
        error instanceof CloakInstallationManagerError && error.code === 'receipt_mismatch',
    )
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('receipt path cannot escape the managed cache', async () => {
  const value = await fixture()
  try {
    await assert.rejects(
      installCloakBrowserFixedVersion(
        {
          cacheDir: value.cacheDir,
          receiptPath: path.join(value.root, 'outside.json'),
          expectedBinarySha256: SHA,
          explicitConsent: true,
        },
        {
          ensureBinary: async () => value.binaryPath,
          preflight: async () => value.preflight,
        },
      ),
      (error: unknown) =>
        error instanceof CloakInstallationManagerError &&
        error.code === 'invalid_configuration',
    )
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})
