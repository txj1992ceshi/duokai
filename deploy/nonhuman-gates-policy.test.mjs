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
const canaryRehearsal = read('apps/duokai2/electron/services/cloakBrowserCanaryRehearsal.ts')
const releaseRunbook = read('apps/duokai2/docs/desktop-release-runbook.md')
const deployRunbook = read('deploy/README.md')
const singleOwnerGovernance = read('docs/single-owner-governance.md')

test('candidate closure is PR-aware, exact-head and evidence-backed', () => {
  assert.match(candidate, /^\s{2}pull_request:\s*$/m)
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
  assert.doesNotMatch(candidate, /REVIEW_REQUIRED|reviewDecision|requiredApprovingReviewCount/)
  assert.match(candidate, /name:\s*candidate-closure/)
})

test('production connectivity workflow is PR-aware, read-only and never deploys', () => {
  assert.match(connectivity, /^\s{2}pull_request:\s*$/m)
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

test('single-owner governance is explicit and dual-person gates do not return', () => {
  assert.match(canaryRehearsal, /ownerConfirmation/)
  assert.match(canaryRehearsal, /owner_confirmation\.present/)
  assert.match(canaryRehearsal, /owner_confirmation\.after_evidence/)
  assert.doesNotMatch(canaryRehearsal, /operatorId|reviewerId|approval\.separation/)

  assert.match(singleOwnerGovernance, /one project owner/i)
  assert.match(singleOwnerGovernance, /at least 3 successful Observe samples/)
  assert.match(singleOwnerGovernance, /at least 30 minutes of Observe coverage/)
  assert.match(singleOwnerGovernance, /zero failed samples/)
  assert.match(singleOwnerGovernance, /latest evidence no older than 30 minutes/)

  for (const document of [releaseRunbook, deployRunbook]) {
    assert.match(document, /project owner|项目所有者/i)
    assert.doesNotMatch(document, /independent approval|独立 reviewer|双人审批/i)
  }
})
