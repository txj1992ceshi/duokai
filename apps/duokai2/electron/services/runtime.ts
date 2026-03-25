import { existsSync, readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'
import { chromium } from 'playwright'
import type { ProxyRecord, WebRtcMode } from '../../src/shared/types'

export function parseLocale(language: string): string {
  return language || 'en-US'
}

export function normalizeResolution(value: string): { width: number; height: number } {
  const [widthText, heightText] = value.split('x')
  const width = Number(widthText)
  const height = Number(heightText)
  if (!width || !height) {
    return { width: 1440, height: 900 }
  }
  return { width, height }
}

export function buildRuntimeArgs(
  webrtcMode: WebRtcMode,
  launchArgs = '',
  disableGpu = false,
): string[] {
  const args = launchArgs
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (webrtcMode === 'disabled') {
    args.push('--disable-webrtc')
  }
  if (disableGpu) {
    args.push('--disable-gpu')
  }
  return Array.from(new Set(args))
}

export function buildProxyServer(proxy: ProxyRecord): string {
  return `${proxy.type}://${proxy.host}:${proxy.port}`
}

export function proxyToPlaywrightConfig(proxy: ProxyRecord | null) {
  if (!proxy) {
    return null
  }
  return {
    server: buildProxyServer(proxy),
    username: proxy.username || undefined,
    password: proxy.password || undefined,
  }
}

export function resolveChromiumExecutable(): string | undefined {
  const bundledExecutable = resolveBundledChromiumExecutable()
  if (bundledExecutable) {
    return bundledExecutable
  }
  try {
    return chromium.executablePath()
  } catch {
    return undefined
  }
}

function resolveBundledChromiumExecutable(): string | undefined {
  const manifestPath = path.join(process.resourcesPath, 'ms-playwright', 'manifest.json')
  if (!existsSync(manifestPath)) {
    return undefined
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      archiveName?: string
      browserDirectory?: string
      executablePath?: string
    }
    if (!manifest.archiveName || !manifest.browserDirectory || !manifest.executablePath) {
      return undefined
    }
    const extractedRoot = path.join(app.getPath('userData'), 'playwright-browsers')
    const executablePath = path.join(
      extractedRoot,
      manifest.browserDirectory,
      manifest.executablePath,
    )
    if (existsSync(executablePath)) {
      return executablePath
    }

    const archivePath = path.join(process.resourcesPath, 'ms-playwright', manifest.archiveName)
    if (!existsSync(archivePath)) {
      return undefined
    }

    mkdirSync(extractedRoot, { recursive: true })
    extractBundledChromiumArchive(archivePath, extractedRoot)
    return existsSync(executablePath) ? executablePath : undefined
  } catch {
    return undefined
  }
}

function extractBundledChromiumArchive(archivePath: string, extractedRoot: string): void {
  if (process.platform === 'darwin') {
    const result = spawnSync('ditto', ['-x', '-k', archivePath, extractedRoot], {
      stdio: 'ignore',
    })
    if (result.status !== 0) {
      throw new Error(`Failed to extract bundled Chromium archive (exit ${result.status ?? 'unknown'})`)
    }
    return
  }

  if (process.platform === 'win32') {
    const command = [
      '$ErrorActionPreference = "Stop"',
      `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${extractedRoot}' -Force`,
    ].join('; ')
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { stdio: 'ignore' },
    )
    if (result.status !== 0) {
      throw new Error(`Failed to extract bundled Chromium archive (exit ${result.status ?? 'unknown'})`)
    }
  }
}
