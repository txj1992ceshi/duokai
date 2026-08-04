import { stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  CLOAK_INSTALLATION_RECEIPT_FILENAME,
  installCloakBrowserFixedVersion,
  verifyCloakBrowserInstallation,
} from '../electron/services/cloakBrowserInstallationManager.ts'
import {
  CLOAK_PILOT_BINARY_SHA256,
  CLOAK_PILOT_BROWSER_VERSION,
} from '../electron/services/cloakBrowserInstallPreflight.ts'

const startedAt = new Date().toISOString()
const confirmation = String(process.env.DUOKAI_CLOAK_INSTALL_CONFIRM ?? '').trim()
const cacheDirInput = String(process.env.DUOKAI_CLOAK_POC_CACHE_DIR ?? '').trim()
const cacheDir = cacheDirInput ? path.resolve(cacheDirInput) : ''
const expectedBinarySha256 = String(
  process.env.DUOKAI_CLOAK_PILOT_BINARY_SHA256 ?? '',
).trim().toLowerCase()
const resourcesPathInput = String(
  process.env.DUOKAI_CLOAK_INSTALL_RESOURCES_PATH ?? '',
).trim()

function fail(message: string): never {
  throw new Error(message)
}

async function main(): Promise<void> {
  if (confirmation !== 'YES') {
    fail('Set DUOKAI_CLOAK_INSTALL_CONFIRM=YES for this explicit release-engineering action.')
  }
  if (!cacheDirInput || !path.isAbsolute(cacheDir) || cacheDir === path.parse(cacheDir).root) {
    fail('DUOKAI_CLOAK_POC_CACHE_DIR must be an absolute managed cache directory.')
  }
  if (!/^[a-f0-9]{64}$/.test(expectedBinarySha256)) {
    fail('DUOKAI_CLOAK_PILOT_BINARY_SHA256 must be an exact SHA256 digest.')
  }
  if (expectedBinarySha256 !== CLOAK_PILOT_BINARY_SHA256) {
    fail(
      `DUOKAI_CLOAK_PILOT_BINARY_SHA256 does not match the verified ${process.platform}-${process.arch} Pilot binary.`,
    )
  }

  const defaultResourcesPath =
    process.platform === 'win32'
      ? path.join(process.cwd(), 'release', 'win-unpacked', 'resources')
      : path.join(process.cwd(), 'release', 'mac-arm64', 'Duokai.app', 'Contents', 'Resources')
  const environment = {
    appPath: process.cwd(),
    resourcesPath: resourcesPathInput ? path.resolve(resourcesPathInput) : defaultResourcesPath,
    temporaryDirectory: os.tmpdir(),
  }
  const installed = await installCloakBrowserFixedVersion({
    cacheDir,
    expectedBinarySha256,
    explicitConsent: true,
    browserVersion: CLOAK_PILOT_BROWSER_VERSION,
    environment,
  })
  const verified = await verifyCloakBrowserInstallation({
    cacheDir,
    expectedBinarySha256,
    browserVersion: CLOAK_PILOT_BROWSER_VERSION,
    environment,
  })
  const receiptPath = path.join(cacheDir, CLOAK_INSTALLATION_RECEIPT_FILENAME)
  const receiptMetadata = await stat(receiptPath)

  const result = {
    success: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    explicitConsentConfirmed: true,
    receiptPath,
    receiptMode: process.platform === 'win32' ? null : (receiptMetadata.mode & 0o777).toString(8),
    installed: {
      browserVersion: installed.browserVersion,
      executableChromiumVersion: installed.executableChromiumVersion,
      binaryPath: installed.binaryPath,
      binarySha256: installed.binarySha256,
      wrapperVersion: installed.wrapperVersion,
      releaseChannel: installed.releaseChannel,
      fallbackEngine: installed.fallbackEngine,
      launchAutoDownload: installed.launchAutoDownload,
      receiptSha256: installed.receiptSha256,
    },
    verification: {
      receiptMatches: verified.receipt.receiptSha256 === installed.receiptSha256,
      binaryMatches: verified.preflight.binarySha256 === expectedBinarySha256,
      fixedVersionMatches: verified.preflight.browserVersion === CLOAK_PILOT_BROWSER_VERSION,
      noLaunchDownload: verified.receipt.launchAutoDownload === false,
      noFallback: verified.receipt.fallbackEngine === 'forbidden',
    },
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        success: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  )
  process.exitCode = 1
})
