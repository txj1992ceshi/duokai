import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'deploy-vultr.yml')
const updateScriptPath = path.join(repositoryRoot, 'deploy', 'update-from-git.sh')

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim()
}

test('production deployment is manual, explicit and bound to an exact main SHA', () => {
  const workflow = readFileSync(workflowPath, 'utf8')
  assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/m)
  assert.doesNotMatch(workflow, /^\s{2}push:\s*$/m)
  assert.match(workflow, /expected_sha:[\s\S]*required:\s*true/)
  assert.match(workflow, /confirmation:[\s\S]*required:\s*true/)
  assert.match(workflow, /DEPLOY_VULTR/)
  assert.match(workflow, /EXPECTED_SHA="\$\{\{ github\.event\.inputs\.expected_sha \}\}"/)
  assert.doesNotMatch(workflow, /script_stop:/)
})

test('deployment update script rejects SHA drift and deploys only the authorized commit', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'duokai-deploy-policy-'))
  const remote = path.join(root, 'remote.git')
  const seed = path.join(root, 'seed')
  const deployed = path.join(root, 'deployed')
  try {
    run('git', ['init', '--bare', remote])
    run('git', ['init', '-b', 'main', seed])
    run('git', ['-C', seed, 'config', 'user.email', 'deploy-policy@example.invalid'])
    run('git', ['-C', seed, 'config', 'user.name', 'Deploy Policy Test'])
    mkdirSync(path.join(seed, 'deploy'), { recursive: true })
    writeFileSync(path.join(seed, 'README.md'), 'authorized\n')
    writeFileSync(
      path.join(seed, 'deploy', 'bootstrap-and-deploy.sh'),
      '#!/usr/bin/env bash\nset -euo pipefail\nprintf "%s" "$(git rev-parse HEAD)" > deployed-sha.txt\n',
      { mode: 0o755 },
    )
    cpSync(updateScriptPath, path.join(seed, 'deploy', 'update-from-git.sh'))
    run('git', ['-C', seed, 'add', '.'])
    run('git', ['-C', seed, 'commit', '-m', 'Seed deployment fixture'])
    run('git', ['-C', seed, 'remote', 'add', 'origin', remote])
    run('git', ['-C', seed, 'push', '-u', 'origin', 'main'])
    run('git', ['clone', '--branch', 'main', remote, deployed])
    const authorizedSha = run('git', ['-C', deployed, 'rev-parse', 'HEAD'])

    const rejected = spawnSync('bash', [path.join(deployed, 'deploy', 'update-from-git.sh')], {
      cwd: deployed,
      encoding: 'utf8',
      env: {
        ...process.env,
        ROOT_DIR: deployed,
        BRANCH: 'main',
        EXPECTED_SHA: '0'.repeat(40),
      },
    })
    assert.notEqual(rejected.status, 0)
    assert.match(`${rejected.stdout}\n${rejected.stderr}`, /origin\/main moved/)
    assert.equal(readFileSync(path.join(deployed, 'README.md'), 'utf8'), 'authorized\n')

    run('bash', [path.join(deployed, 'deploy', 'update-from-git.sh')], {
      cwd: deployed,
      env: {
        ...process.env,
        ROOT_DIR: deployed,
        BRANCH: 'main',
        EXPECTED_SHA: authorizedSha,
      },
    })
    assert.equal(readFileSync(path.join(deployed, 'deployed-sha.txt'), 'utf8'), authorizedSha)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
