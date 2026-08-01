import { createHash } from 'node:crypto'
import { constants, createReadStream, existsSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

export type CloakBrowserTier = 'free' | 'pro'
export type CloakBrowserReleaseChannel = 'stable'

export interface CloakBrowserBinaryDescriptor {
  version: string
  bundledVersion: string
  platform: string
  tier: CloakBrowserTier
  binaryPath: string
  installed: boolean
  cacheDir: string
  downloadUrl: string
}

export interface CloakBrowserRuntimeIdentity {
  engine: 'cloakbrowser'
  cloakWrapperVersion: string
  requestedChromiumVersion: string
  installedChromiumVersion: string
  executableChromiumVersion: string
  runtimeChromiumVersion: string
  chromiumMajor: string
  binaryPath: string
  binarySha256: string
  tier: CloakBrowserTier
  releaseChannel: CloakBrowserReleaseChannel
  platform: string
  verifiedAt: string
}

export type CloakIdentityErrorCode =
  | 'binary_not_installed'
  | 'binary_not_executable'
  | 'version_probe_failed'
  | 'version_mismatch'
  | 'runtime_version_probe_failed'
  | 'binary_hash_failed'
  | 'binary_identity_invalid'

export class CloakIdentityError extends Error {
  readonly code: CloakIdentityErrorCode

  constructor(code: CloakIdentityErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CloakIdentityError'
    this.code = code
  }
}

export interface ChromiumVersionInfo {
  fullVersion: string
  runtimeBaseVersion: string
  major: string
}

export interface CloakRuntimePageLike {
  close?: () => Promise<void>
}

export interface CloakRuntimeCdpSessionLike {
  send(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<{ product?: string } & Record<string, unknown>>
  detach?: () => Promise<void>
}

export interface CloakRuntimeContextLike {
  pages(): CloakRuntimePageLike[]
  newPage(): Promise<CloakRuntimePageLike>
  newCDPSession(page: CloakRuntimePageLike): Promise<CloakRuntimeCdpSessionLike>
}

export type BinaryVersionCommandRunner = (binaryPath: string) => Promise<string>

export interface BinaryVersionCommandOptions {
  platform?: NodeJS.Platform
  timeoutMs?: number
  spawnProcess?: typeof spawn
}

export interface InspectCloakRuntimeIdentityInput {
  wrapperVersion: string
  requestedChromiumVersion: string
  releaseChannel: CloakBrowserReleaseChannel
  descriptor: CloakBrowserBinaryDescriptor
  context: CloakRuntimeContextLike
  now?: () => Date
  runBinaryVersionCommand?: BinaryVersionCommandRunner
  hashBinary?: (binaryPath: string) => Promise<string>
}

function runtimeBaseVersion(version: string): string {
  return version.split('.').slice(0, 4).join('.')
}

export function parseChromiumVersionOutput(output: string): ChromiumVersionInfo {
  const match = String(output).match(/(?:Chromium|Chrome|HeadlessChrome)?\s*\/?\s*(\d+(?:\.\d+){3,4})/i)
  if (!match?.[1]) {
    throw new CloakIdentityError(
      'version_probe_failed',
      `Unable to parse a Chromium version from: ${String(output).trim() || '<empty>'}`,
    )
  }
  const fullVersion = match[1]
  return {
    fullVersion,
    runtimeBaseVersion: runtimeBaseVersion(fullVersion),
    major: fullVersion.split('.')[0] || '',
  }
}

export async function runBinaryVersionCommand(
  binaryPath: string,
  options: BinaryVersionCommandOptions = {},
): Promise<string> {
  const platform = options.platform ?? process.platform
  const timeoutMs = options.timeoutMs ?? 15_000
  const spawnProcess = options.spawnProcess ?? spawn
  const windowsRoot = String(process.env.SystemRoot ?? '').trim()
  const powershellPath = windowsRoot
    ? path.win32.join(
        windowsRoot,
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      )
    : 'powershell.exe'
  const powershellScript =
    '[Console]::Out.Write((Get-Item -LiteralPath $env:DUOKAI_CLOAK_BINARY_PATH).VersionInfo.ProductVersion)'
  const command = platform === 'win32' ? powershellPath : binaryPath
  const args =
    platform === 'win32'
      ? [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(powershellScript, 'utf16le').toString('base64'),
        ]
      : ['--version']
  const environment =
    platform === 'win32'
      ? { ...process.env, DUOKAI_CLOAK_BINARY_PATH: binaryPath }
      : process.env

  return await new Promise<string>((resolve, reject) => {
    const child = spawnProcess(command, args, {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(
        new CloakIdentityError(
          'version_probe_failed',
          `CloakBrowser binary version probe timed out after ${timeoutMs}ms at ${binaryPath}.`,
        ),
      )
    }, timeoutMs)
    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', (error) => {
      settle(() => {
        reject(
          new CloakIdentityError(
            'version_probe_failed',
            `Failed to execute CloakBrowser binary version probe at ${binaryPath}.`,
            error,
          ),
        )
      })
    })
    child.once('close', (code) => {
      settle(() => {
        if (code !== 0) {
          reject(
            new CloakIdentityError(
              'version_probe_failed',
              `CloakBrowser binary version probe exited with code ${code ?? 'unknown'}: ${stderr.trim()}`,
            ),
          )
          return
        }
        resolve(stdout || stderr)
      })
    })
  })
}

export async function readChromiumExecutableVersion(
  binaryPath: string,
  runner: BinaryVersionCommandRunner = runBinaryVersionCommand,
): Promise<ChromiumVersionInfo> {
  try {
    return parseChromiumVersionOutput(await runner(binaryPath))
  } catch (error) {
    if (error instanceof CloakIdentityError) {
      throw error
    }
    throw new CloakIdentityError(
      'version_probe_failed',
      `Failed to read Chromium version from ${binaryPath}.`,
      error,
    )
  }
}

export async function readRuntimeChromiumVersion(
  context: CloakRuntimeContextLike,
): Promise<ChromiumVersionInfo> {
  const existingPage = context.pages()[0]
  const page = existingPage ?? (await context.newPage())
  const createdPage = existingPage === undefined
  let session: CloakRuntimeCdpSessionLike | null = null
  try {
    session = await context.newCDPSession(page)
    const result = await session.send('Browser.getVersion')
    return parseChromiumVersionOutput(result.product || '')
  } catch (error) {
    if (error instanceof CloakIdentityError) {
      throw new CloakIdentityError(
        'runtime_version_probe_failed',
        error.message,
        error,
      )
    }
    throw new CloakIdentityError(
      'runtime_version_probe_failed',
      'Failed to read the running CloakBrowser Chromium version through CDP.',
      error,
    )
  } finally {
    await session?.detach?.().catch(() => undefined)
    if (createdPage) {
      await page.close?.().catch(() => undefined)
    }
  }
}

export async function computeBinarySha256(binaryPath: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(binaryPath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('error', (error) => {
      reject(
        new CloakIdentityError(
          'binary_hash_failed',
          `Failed to hash CloakBrowser binary at ${binaryPath}.`,
          error,
        ),
      )
    })
    stream.once('end', () => resolve(hash.digest('hex')))
  })
}

export async function assertCloakBinaryReady(
  descriptor: CloakBrowserBinaryDescriptor,
): Promise<void> {
  if (!descriptor.installed || !descriptor.binaryPath || !existsSync(descriptor.binaryPath)) {
    throw new CloakIdentityError(
      'binary_not_installed',
      `CloakBrowser ${descriptor.version} is not installed at the expected path.`,
    )
  }
  try {
    await access(descriptor.binaryPath, constants.X_OK)
  } catch (error) {
    throw new CloakIdentityError(
      'binary_not_executable',
      `CloakBrowser binary is not executable at ${descriptor.binaryPath}.`,
      error,
    )
  }
}

export function validateCloakRuntimeIdentity(identity: CloakBrowserRuntimeIdentity): void {
  if (identity.engine !== 'cloakbrowser' || identity.releaseChannel !== 'stable') {
    throw new CloakIdentityError(
      'binary_identity_invalid',
      'CloakBrowser runtime identity has an invalid engine or release channel.',
    )
  }
  if (!identity.binaryPath || !/^[a-f0-9]{64}$/i.test(identity.binarySha256)) {
    throw new CloakIdentityError(
      'binary_identity_invalid',
      'CloakBrowser runtime identity is missing a binary path or SHA256.',
    )
  }
  if (identity.requestedChromiumVersion !== identity.installedChromiumVersion) {
    throw new CloakIdentityError(
      'version_mismatch',
      `Requested CloakBrowser ${identity.requestedChromiumVersion}, but installed descriptor reports ${identity.installedChromiumVersion}.`,
    )
  }
  const requestedBase = runtimeBaseVersion(identity.requestedChromiumVersion)
  const executableBase = runtimeBaseVersion(identity.executableChromiumVersion)
  const runtimeBase = runtimeBaseVersion(identity.runtimeChromiumVersion)
  if (requestedBase !== executableBase || executableBase !== runtimeBase) {
    throw new CloakIdentityError(
      'version_mismatch',
      `CloakBrowser version mismatch: requested=${identity.requestedChromiumVersion}; executable=${identity.executableChromiumVersion}; runtime=${identity.runtimeChromiumVersion}.`,
    )
  }
}

export async function inspectCloakRuntimeIdentity(
  input: InspectCloakRuntimeIdentityInput,
): Promise<CloakBrowserRuntimeIdentity> {
  await assertCloakBinaryReady(input.descriptor)
  const executable = await readChromiumExecutableVersion(
    input.descriptor.binaryPath,
    input.runBinaryVersionCommand,
  )
  const runtime = await readRuntimeChromiumVersion(input.context)
  const binarySha256 = await (input.hashBinary ?? computeBinarySha256)(input.descriptor.binaryPath)
  const identity: CloakBrowserRuntimeIdentity = {
    engine: 'cloakbrowser',
    cloakWrapperVersion: input.wrapperVersion,
    requestedChromiumVersion: input.requestedChromiumVersion,
    installedChromiumVersion: input.descriptor.version,
    executableChromiumVersion: executable.fullVersion,
    runtimeChromiumVersion: runtime.fullVersion,
    chromiumMajor: runtime.major,
    binaryPath: input.descriptor.binaryPath,
    binarySha256,
    tier: input.descriptor.tier,
    releaseChannel: input.releaseChannel,
    platform: input.descriptor.platform,
    verifiedAt: (input.now ?? (() => new Date()))().toISOString(),
  }
  validateCloakRuntimeIdentity(identity)
  return identity
}
