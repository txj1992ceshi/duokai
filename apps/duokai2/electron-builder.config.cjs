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

const baseBuild = pkg.build ?? {}
const normalizedVersion = parseVersion(pkg.version)

module.exports = {
  ...baseBuild,
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
  dmg: {
    ...((baseBuild.dmg ?? {})),
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },
}
