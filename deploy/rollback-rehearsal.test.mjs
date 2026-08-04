import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { validateDesktopReleaseVersion } from '../apps/duokai2/scripts/validate-desktop-release-version.mjs'

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

test('merge-commit rollback uses an audited revert without rewriting history', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'duokai-rollback-rehearsal-'))
  try {
    git(root, ['init', '-b', 'main'])
    git(root, ['config', 'user.email', 'rollback-rehearsal@example.invalid'])
    git(root, ['config', 'user.name', 'Rollback Rehearsal'])
    writeFileSync(path.join(root, 'state.txt'), 'stable\n')
    git(root, ['add', 'state.txt'])
    git(root, ['commit', '-m', 'Stable baseline'])
    const baselineSha = git(root, ['rev-parse', 'HEAD'])

    git(root, ['checkout', '-b', 'candidate'])
    writeFileSync(path.join(root, 'state.txt'), 'candidate\n')
    git(root, ['add', 'state.txt'])
    git(root, ['commit', '-m', 'Candidate change'])
    const candidateSha = git(root, ['rev-parse', 'HEAD'])

    git(root, ['checkout', 'main'])
    git(root, ['merge', '--no-ff', 'candidate', '-m', 'Merge candidate'])
    const mergeSha = git(root, ['rev-parse', 'HEAD'])
    assert.equal(readFileSync(path.join(root, 'state.txt'), 'utf8'), 'candidate\n')

    git(root, ['revert', '-m', '1', '--no-edit', mergeSha])
    const revertSha = git(root, ['rev-parse', 'HEAD'])
    assert.equal(readFileSync(path.join(root, 'state.txt'), 'utf8'), 'stable\n')
    assert.notEqual(revertSha, baselineSha)
    assert.notEqual(revertSha, mergeSha)
    assert.equal(git(root, ['merge-base', '--is-ancestor', mergeSha, revertSha]), '')
    assert.equal(git(root, ['merge-base', '--is-ancestor', candidateSha, revertSha]), '')
    assert.match(git(root, ['log', '--format=%s', '-3']), /Revert "Merge candidate"/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('desktop rollback ships a higher corrective version and never an automatic downgrade', () => {
  assert.deepEqual(validateDesktopReleaseVersion('3.6.10', 'v3.6.9'), {
    candidate: '3.6.10',
    latest: '3.6.9',
    newer: true,
  })
  assert.throws(
    () => validateDesktopReleaseVersion('3.6.8', 'v3.6.9'),
    /must be newer/,
  )
})
