import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { App } from 'electron'

export function getProfileDirectoryInfo(app: App): {
  appDataDir: string
  profilesDir: string
} {
  const appDataDir = app.getPath('userData')
  return {
    appDataDir,
    profilesDir: path.join(appDataDir, 'profiles'),
  }
}

export function ensureProfileDirectory(profilesDir: string): void {
  mkdirSync(profilesDir, { recursive: true })
}

export function getProfilePath(app: App, profileId: string): string {
  return path.join(getProfileDirectoryInfo(app).profilesDir, profileId)
}

