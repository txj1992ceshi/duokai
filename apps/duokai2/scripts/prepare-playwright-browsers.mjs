import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { chromium } from 'playwright'

function findPlaywrightCacheRoot(executablePath) {
  let current = path.resolve(path.dirname(executablePath))
  while (true) {
    if (path.basename(current) === 'ms-playwright') {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error(`Unable to locate ms-playwright cache root from "${executablePath}"`)
    }
    current = parent
  }
}

function ensureBundledChromium() {
  const executablePath = chromium.executablePath()
  if (!executablePath || !existsSync(executablePath)) {
    throw new Error(
      'Playwright Chromium is not installed. Run "npm run install:chromium" before packaging.',
    )
  }

  const cacheRoot = findPlaywrightCacheRoot(executablePath)
  const outputRoot = path.resolve('build-resources/ms-playwright')
  const browserDirectory = path.relative(cacheRoot, executablePath).split(path.sep)[0]
  const browserSourceDir = path.join(cacheRoot, browserDirectory)
  const archiveName = `${browserDirectory}.zip`
  const archivePath = path.join(outputRoot, archiveName)

  rmSync(outputRoot, { recursive: true, force: true })
  mkdirSync(outputRoot, { recursive: true })

  createBrowserArchive(browserSourceDir, archivePath)

  const relativeExecutablePath = path.relative(cacheRoot, executablePath)
  writeFileSync(
    path.join(outputRoot, 'manifest.json'),
    JSON.stringify(
      {
        browser: 'chromium',
        archiveName,
        browserDirectory,
        executablePath: relativeExecutablePath.slice(browserDirectory.length + 1),
      },
      null,
      2,
    ),
    'utf8',
  )

  console.log(`Bundled Playwright Chromium archive from ${browserSourceDir}`)
  console.log(`Bundled executable: ${relativeExecutablePath}`)
}

ensureBundledChromium()

function createBrowserArchive(sourceDir, archivePath) {
  if (process.platform === 'darwin') {
    const result = spawnSync(
      'ditto',
      ['-c', '-k', '--sequesterRsrc', '--keepParent', sourceDir, archivePath],
      { stdio: 'inherit' },
    )
    if (result.status !== 0) {
      throw new Error(`Failed to archive Chromium with ditto (exit ${result.status ?? 'unknown'})`)
    }
    return
  }

  if (process.platform === 'win32') {
    const command = [
      '$ErrorActionPreference = "Stop"',
      `if (Test-Path -LiteralPath '${archivePath}') { Remove-Item -LiteralPath '${archivePath}' -Force }`,
      `Compress-Archive -LiteralPath '${sourceDir}' -DestinationPath '${archivePath}' -Force`,
    ].join('; ')
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { stdio: 'inherit' },
    )
    if (result.status !== 0) {
      throw new Error(
        `Failed to archive Chromium with PowerShell Compress-Archive (exit ${result.status ?? 'unknown'})`,
      )
    }
    return
  }

  throw new Error(`Unsupported packaging platform for bundled Chromium archive: ${process.platform}`)
}
