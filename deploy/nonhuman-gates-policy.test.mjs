import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8')

const candidate = read('.github/workflows/candidate-closure.yml')
const connectivity = read('.github/workflows/production-connectivity.yml')
const deployPolicy = read('.github/workflows/deploy-policy.yml')
const agentContract = read('.github/workflows/agent-contract.yml')
const releasePolicy = read('.github/workflows/desktop-release-policy.yml')

test('candidate closure is manual, exact-head and evidence-backed', () => {
  assert.match(candidate, /^\s{2}workflow_dispatch:\s*$/m)
  assert.doesNotMatch(candidate, /^\s{2}push:\s*$/m)
  assert.match(candidate, /VERIFY_CANDIDATE_CLOSURE/)
  assert.match(candidate, /candidate moved:/)
  for (const workflow of [
    'agent-contract.yml',
    'deploy-policy.yml',
    'desktop-release-policy.yml',
    'desktop-windows-smoke.yml',
    'desktop-windows-test-package.yml',
  ]) {
    assert.match(candidate, new RegExp(workflow.replaceAll('.', '\\.')))
  }
  assert.match(candidate, /duokai2-windows-smoke-artifacts/)
  assert.match(candidate, /duokai2-windows-test-package/)
  assert.match(candidate, /unresolved review thread/)
  assert.match(candidate, /name:\s*candidate-closure/)
})

test('production connectivity workflow is read-only and never deploys', () => {
  assert.match(connectivity, /^\s{2}workflow_dispatch:\s*$/m)
  assert.doesNotMatch(connectivity, /^\s{2}push:\s*$/m)
  assert.match(connectivity, /CHECK_PRODUCTION_CONNECTIVITY/)
  assert.match(connectivity, /\/dev\/tcp/)
  assert.match(connectivity, /BatchMode=yes/)
  assert.match(connectivity, /remoteCommand:\s*"printf connectivity-ok"/)
  assert.match(connectivity, /mutationAttempted:\s*false/)
  assert.doesNotMatch(connectivity, /update-from-git|bootstrap-and-deploy|pm2|systemctl|docker/)
})

test('required policy jobs have stable unique check names', () => {
  assert.match(agentContract, /name:\s*agent-contract/)
  assert.match(deployPolicy, /name:\s*deploy-policy/)
  assert.match(releasePolicy, /name:\s*desktop-release-policy/)
  assert.match(deployPolicy, /nonhuman-gates-policy\.test\.mjs/)
  assert.match(deployPolicy, /candidate-closure\.yml/)
  assert.match(deployPolicy, /production-connectivity\.yml/)
})
