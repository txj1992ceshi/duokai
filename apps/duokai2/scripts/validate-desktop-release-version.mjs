import process from 'node:process'
import { pathToFileURL } from 'node:url'

export function parseStableVersion(value, label) {
  const normalized = String(value ?? '').trim().replace(/^v/, '')
  const match = normalized.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
  if (!match) {
    throw new Error(`${label} must be a stable semantic version (major.minor.patch).`)
  }
  return match.slice(1).map(Number)
}

export function compareStableVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

export function validateDesktopReleaseVersion(candidateInput, latestTagInput) {
  const candidate = parseStableVersion(candidateInput, 'Desktop package version')
  const latestTag = String(latestTagInput ?? '').trim()
  if (!latestTag) {
    return { candidate: candidate.join('.'), latest: '', newer: true }
  }
  const latest = parseStableVersion(latestTag, 'Latest published release tag')
  if (compareStableVersions(candidate, latest) <= 0) {
    throw new Error(
      `Desktop package version ${candidate.join('.')} must be newer than published release ${latest.join('.')}.`,
    )
  }
  return { candidate: candidate.join('.'), latest: latest.join('.'), newer: true }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  try {
    const result = validateDesktopReleaseVersion(process.argv[2], process.argv[3])
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
