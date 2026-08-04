import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compareStableVersions,
  parseStableVersion,
  validateDesktopReleaseVersion,
} from './validate-desktop-release-version.mjs'

test('stable release versions parse and compare numerically', () => {
  assert.deepEqual(parseStableVersion('v3.6.9', 'tag'), [3, 6, 9])
  assert.equal(compareStableVersions([3, 10, 0], [3, 9, 99]) > 0, true)
  assert.equal(compareStableVersions([4, 0, 0], [3, 99, 99]) > 0, true)
})

test('release version must be newer than the latest published release', () => {
  assert.deepEqual(validateDesktopReleaseVersion('3.6.9', 'v3.6.8'), {
    candidate: '3.6.9',
    latest: '3.6.8',
    newer: true,
  })
  assert.throws(
    () => validateDesktopReleaseVersion('3.6.8', 'v3.6.8'),
    /must be newer/,
  )
  assert.throws(
    () => validateDesktopReleaseVersion('3.6.7', 'v3.6.8'),
    /must be newer/,
  )
})

test('prerelease and malformed versions cannot enter the formal release workflow', () => {
  for (const value of ['3.6.9-beta.1', '03.6.9', '3.6', '', 'latest']) {
    assert.throws(
      () => validateDesktopReleaseVersion(value, 'v3.6.8'),
      /stable semantic version/,
    )
  }
})
