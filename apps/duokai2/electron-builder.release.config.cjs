const baseBuild = require('./electron-builder.config.cjs')

function requireEnvironment(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) {
    throw new Error(`${name} is required for a signed desktop release.`)
  }
  return value
}

const isMacRelease = process.platform === 'darwin'
const isWindowsRelease = process.platform === 'win32'

if (!isMacRelease && !isWindowsRelease) {
  throw new Error(`Signed desktop releases are unsupported on ${process.platform}.`)
}

if (isMacRelease) {
  requireEnvironment('CSC_LINK')
  requireEnvironment('CSC_KEY_PASSWORD')
  requireEnvironment('APPLE_ID')
  requireEnvironment('APPLE_APP_SPECIFIC_PASSWORD')
  requireEnvironment('APPLE_TEAM_ID')
}

if (isWindowsRelease) {
  requireEnvironment('CSC_LINK')
  requireEnvironment('CSC_KEY_PASSWORD')
}

module.exports = {
  ...baseBuild,
  mac: {
    ...(baseBuild.mac ?? {}),
    hardenedRuntime: true,
    gatekeeperAssess: false,
    notarize: isMacRelease
      ? {
          teamId: requireEnvironment('APPLE_TEAM_ID'),
        }
      : false,
  },
}
