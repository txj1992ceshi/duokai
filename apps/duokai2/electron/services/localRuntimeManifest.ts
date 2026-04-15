import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { App } from 'electron'

export type LocalRuntimeManifest = {
  url: string
  pid?: number
  version?: string
  updatedAt: string
}

export function getLocalRuntimeManifestPath(app: App): string {
  const manifestDir = path.join(app.getPath('appData'), 'duokai')
  return path.join(manifestDir, 'runtime-manifest.json')
}

export function readLocalRuntimeManifest(app: App): LocalRuntimeManifest | null {
  const manifestPath = getLocalRuntimeManifestPath(app)
  if (!existsSync(manifestPath)) {
    return null
  }

  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    if (typeof raw.url !== 'string' || !raw.url.trim()) {
      return null
    }
    return {
      url: raw.url.trim(),
      pid: typeof raw.pid === 'number' ? raw.pid : undefined,
      version: typeof raw.version === 'string' ? raw.version : undefined,
      updatedAt:
        typeof raw.updatedAt === 'string' && raw.updatedAt.trim()
          ? raw.updatedAt
          : new Date(0).toISOString(),
    }
  } catch {
    return null
  }
}

export function writeLocalRuntimeManifest(app: App, payload: LocalRuntimeManifest): void {
  const manifestPath = getLocalRuntimeManifestPath(app)
  mkdirSync(path.dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, JSON.stringify(payload, null, 2), 'utf8')
}

export function clearLocalRuntimeManifest(app: App): void {
  const manifestPath = getLocalRuntimeManifestPath(app)
  if (!existsSync(manifestPath)) {
    return
  }
  try {
    rmSync(manifestPath, { force: true })
  } catch {
    // Best-effort cleanup only.
  }
}
