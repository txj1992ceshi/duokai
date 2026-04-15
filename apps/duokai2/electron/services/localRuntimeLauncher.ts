import { existsSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { App } from 'electron'
import {
  clearLocalRuntimeManifest,
  readLocalRuntimeManifest,
  writeLocalRuntimeManifest,
} from './localRuntimeManifest'

const DEFAULT_RUNTIME_URL = 'http://127.0.0.1:3101'
const FALLBACK_RUNTIME_URLS = [
  DEFAULT_RUNTIME_URL,
  'http://127.0.0.1:3102',
  'http://127.0.0.1:3210',
  'http://127.0.0.1:3211',
] as const
const HEALTH_TIMEOUT_MS = 3_500
const STARTUP_TIMEOUT_MS = 15_000

export type ResolvedLocalRuntimeInfo = {
  url: string
  source: 'manifest' | 'default' | 'autostart'
  pid?: number
  updatedAt?: string
}

let runtimeChild: ChildProcess | null = null
let ensurePromise: Promise<ResolvedLocalRuntimeInfo> | null = null

async function requestHealth(url: string, runtimeApiKey?: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const request = http.request(
      `${url.replace(/\/$/, '')}/health`,
      {
        method: 'GET',
        timeout: HEALTH_TIMEOUT_MS,
        headers: runtimeApiKey ? { 'x-runtime-key': runtimeApiKey } : undefined,
      },
      (response) => {
        response.resume()
        resolve(response.statusCode === 200)
      },
    )
    request.once('timeout', () => {
      request.destroy(new Error('timeout'))
    })
    request.once('error', () => resolve(false))
    request.end()
  })
}

function resolveRuntimeServerScriptPath(app: App): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(__dirname, '../../../../fingerprint-dashboard/stealth-engine/server.js'),
    path.resolve(app.getAppPath(), '../fingerprint-dashboard/stealth-engine/server.js'),
    path.resolve(process.resourcesPath, 'fingerprint-dashboard/stealth-engine/server.js'),
  ]
  const existing = candidates.find((candidate) => existsSync(candidate))
  if (!existing) {
    throw new Error('未找到本地 runtime 启动脚本 fingerprint-dashboard/stealth-engine/server.js')
  }
  return existing
}

async function resolveHealthyCandidate(
  candidates: Array<{ url: string; source: 'manifest' | 'default' }>,
  runtimeApiKey?: string,
): Promise<ResolvedLocalRuntimeInfo | null> {
  for (const candidate of candidates) {
    if (await requestHealth(candidate.url, runtimeApiKey)) {
      return {
        url: candidate.url,
        source: candidate.source,
      }
    }
  }
  return null
}

export async function getLocalRuntimeInfo(
  app: App,
  runtimeApiKey?: string,
): Promise<ResolvedLocalRuntimeInfo | null> {
  const manifest = readLocalRuntimeManifest(app)
  const candidates: Array<{ url: string; source: 'manifest' | 'default' }> = []

  if (manifest?.url) {
    candidates.push({ url: manifest.url, source: 'manifest' })
  }

  for (const url of FALLBACK_RUNTIME_URLS) {
    if (!candidates.some((candidate) => candidate.url === url)) {
      candidates.push({ url, source: 'default' })
    }
  }

  const resolved = await resolveHealthyCandidate(candidates, runtimeApiKey)
  if (!resolved) {
    if (manifest?.url) {
      clearLocalRuntimeManifest(app)
    }
    return null
  }

  writeLocalRuntimeManifest(app, {
    url: resolved.url,
    pid: runtimeChild?.pid,
    updatedAt: new Date().toISOString(),
  })

  return {
    ...resolved,
    pid: manifest?.pid ?? runtimeChild?.pid,
    updatedAt: manifest?.updatedAt,
  }
}

async function waitForRuntimeHealth(app: App, runtimeApiKey?: string): Promise<ResolvedLocalRuntimeInfo> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    const resolved = await getLocalRuntimeInfo(app, runtimeApiKey)
    if (resolved) {
      return {
        ...resolved,
        source: 'autostart',
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('本地 Runtime 自动启动后健康检查仍未通过')
}

async function spawnRuntime(app: App): Promise<void> {
  const serverScript = resolveRuntimeServerScriptPath(app)
  runtimeChild = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      RUNTIME_PORT: '3101',
    },
    stdio: 'ignore',
    windowsHide: true,
  })

  runtimeChild.once('exit', () => {
    runtimeChild = null
  })
  runtimeChild.once('error', () => {
    runtimeChild = null
  })
}

export async function ensureLocalRuntimeRunning(
  app: App,
  runtimeApiKey?: string,
): Promise<ResolvedLocalRuntimeInfo> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const existing = await getLocalRuntimeInfo(app, runtimeApiKey)
      if (existing) {
        return existing
      }

      await spawnRuntime(app)
      const resolved = await waitForRuntimeHealth(app, runtimeApiKey)
      writeLocalRuntimeManifest(app, {
        url: resolved.url,
        pid: runtimeChild?.pid,
        updatedAt: new Date().toISOString(),
      })
      return resolved
    })().finally(() => {
      ensurePromise = null
    })
  }

  return await ensurePromise
}
