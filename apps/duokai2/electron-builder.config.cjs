const { execFileSync } = require('node:child_process')
const path = require('node:path')

const pkg = require('./package.json')
const REPO_OWNER = 'txj1992ceshi'
const REPO_NAME = 'duokai'

function parseVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) {
    throw new Error(`Unsupported desktop package version: ${version}`)
  }

  const prereleaseParts = String(version).match(/\d+/g) ?? []
  const buildIteration = prereleaseParts.length > 3 ? prereleaseParts[prereleaseParts.length - 1] : '0'

  return {
    bundleShortVersion: `${match[1]}.${match[2]}.${match[3]}`,
    buildVersion: `${match[1]}.${match[2]}.${match[3]}.${buildIteration}`,
  }
}

function isPrerelease(version) {
  return String(version || '').includes('-')
}

function resolveProductName(version) {
  if (!isPrerelease(version)) {
    return 'Duokai'
  }

  const numericParts = String(version).match(/\d+/g) ?? []
  const suffixParts = numericParts.slice(-2)
  const suffix = suffixParts.length > 0 ? suffixParts.join('.') : 'test'

  return `Duokai-${suffix}`
}

const baseBuild = pkg.build ?? {}
const normalizedVersion = parseVersion(pkg.version)
const productName = resolveProductName(pkg.version)
const baseAfterPack = baseBuild.afterPack

async function afterPack(context) {
  if (typeof baseAfterPack === 'function') {
    await baseAfterPack(context)
  }
  if (
    process.env.DUOKAI_ADHOC_SIGN !== '1' ||
    context.electronPlatformName !== 'darwin'
  ) {
    return
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  )
  execFileSync('/usr/bin/codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    '--timestamp=none',
    appPath,
  ], { stdio: 'inherit' })
}

module.exports = {
  ...baseBuild,
  productName,
  afterPack,
  publish:
    baseBuild.publish ?? [
      {
        provider: 'github',
        owner: REPO_OWNER,
        repo: REPO_NAME,
        releaseType: isPrerelease(pkg.version) ? 'prerelease' : 'release',
      },
    ],
  buildVersion: normalizedVersion.buildVersion,
  mac: {
    ...(baseBuild.mac ?? {}),
    bundleShortVersion: normalizedVersion.bundleShortVersion,
    bundleVersion: normalizedVersion.buildVersion,
  },
  win: {
    ...(baseBuild.win ?? {}),
    artifactName: '${productName}-${version}-win.${ext}',
  },
  nsis: {
    ...(baseBuild.nsis ?? {}),
    artifactName: '${productName}.Setup.${version}.${ext}',
  },
  dmg: {
    ...((baseBuild.dmg ?? {})),
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },
}
