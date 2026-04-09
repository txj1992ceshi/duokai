const pkg = require('./package.json')

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

const baseBuild = pkg.build ?? {}
const normalizedVersion = parseVersion(pkg.version)

module.exports = {
  ...baseBuild,
  buildVersion: normalizedVersion.buildVersion,
  mac: {
    ...(baseBuild.mac ?? {}),
    bundleShortVersion: normalizedVersion.bundleShortVersion,
    bundleVersion: normalizedVersion.bundleShortVersion,
  },
}
