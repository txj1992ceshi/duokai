import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const workflow = readFileSync(path.join(root, '.github', 'workflows', 'desktop-release.yml'), 'utf8')
const packageJson = JSON.parse(readFileSync(path.join(root, 'apps', 'duokai2', 'package.json'), 'utf8'))
const releaseConfig = readFileSync(
  path.join(root, 'apps', 'duokai2', 'electron-builder.release.config.cjs'),
  'utf8',
)
const runbook = readFileSync(
  path.join(root, 'apps', 'duokai2', 'docs', 'desktop-release-runbook.md'),
  'utf8',
)

test('formal desktop release is manual, exact-SHA and non-overwriting', () => {
  assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/m)
  assert.doesNotMatch(workflow, /^\s{2}push:\s*$/m)
  assert.match(workflow, /expected_sha:[\s\S]*required:\s*true/)
  assert.match(workflow, /confirmation:[\s\S]*required:\s*true/)
  assert.match(workflow, /CREATE_SIGNED_DESKTOP_DRAFT/)
  assert.match(workflow, /origin\/main moved/)
  assert.match(workflow, /release tags are immutable/)
  assert.doesNotMatch(workflow, /deleteReleaseAsset|Delete existing release assets/)
})

test('release requires signed macOS and Windows artifacts before draft creation', () => {
  for (const secret of [
    'MACOS_CSC_LINK',
    'MACOS_CSC_KEY_PASSWORD',
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
    'WINDOWS_CSC_LINK',
    'WINDOWS_CSC_KEY_PASSWORD',
  ]) {
    assert.match(workflow, new RegExp(secret))
  }
  assert.match(workflow, /codesign --verify --deep --strict/)
  assert.match(workflow, /spctl --assess --type execute/)
  assert.match(workflow, /xcrun stapler validate/)
  assert.match(workflow, /Get-AuthenticodeSignature/)
  assert.match(workflow, /signature\.Status -ne 'Valid'/)
  assert.match(releaseConfig, /hardenedRuntime:\s*true/)
  assert.match(releaseConfig, /notarize:/)
  assert.match(releaseConfig, /requireEnvironment\('APPLE_TEAM_ID'\)/)
  assert.match(packageJson.scripts['build:mac:release'], /electron-builder\.release\.config\.cjs/)
  assert.match(packageJson.scripts['build:win:release'], /electron-builder\.release\.config\.cjs/)
})

test('workflow creates an immutable draft and never marks it latest automatically', () => {
  assert.match(workflow, /Create immutable signed draft release/)
  assert.match(workflow, /draft:\s*true/)
  assert.match(workflow, /make_latest:\s*false/)
  assert.doesNotMatch(workflow, /draft:\s*false/)
  assert.doesNotMatch(workflow, /make_latest:\s*true/)
  assert.match(workflow, /validate-desktop-release-version\.mjs/)
})

test('release rollback policy forbids mutation and automatic downgrade', () => {
  assert.match(runbook, /never replace|不得覆盖/i)
  assert.match(runbook, /higher semantic version|更高版本/i)
  assert.match(runbook, /merge commit/i)
  assert.match(runbook, /release director/i)
  assert.match(runbook, /rollback owner/i)
})
