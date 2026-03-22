const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:3100').replace(/\/$/, '')
const ADMIN_IDENTIFIER = process.env.ADMIN_IDENTIFIER || process.env.ADMIN_EMAIL || ''
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

if (!ADMIN_IDENTIFIER || !ADMIN_PASSWORD) {
  console.error('Missing ADMIN_IDENTIFIER or ADMIN_PASSWORD')
  process.exit(1)
}

async function request(path, init = {}, token = '') {
  const headers = new Headers(init.headers || {})
  headers.set('Content-Type', 'application/json')
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.success === false) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(body)}`)
  }
  return body
}

async function requestExpectStatus(path, expectedStatus, init = {}, token = '') {
  const headers = new Headers(init.headers || {})
  headers.set('Content-Type', 'application/json')
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const body = await response.json().catch(() => ({}))
  if (response.status !== expectedStatus) {
    throw new Error(`${path} expected ${expectedStatus}, got ${response.status} ${JSON.stringify(body)}`)
  }
  return body
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertTaskStatus(value, label) {
  const statuses = new Set(['PENDING', 'RECEIVED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'])
  assert(statuses.has(String(value || '')), `${label} invalid task status: ${String(value || '')}`)
}

function assertAgentStatus(value, label) {
  const statuses = new Set(['ONLINE', 'OFFLINE', 'DISABLED'])
  assert(statuses.has(String(value || '')), `${label} invalid agent status: ${String(value || '')}`)
}

async function main() {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier: ADMIN_IDENTIFIER,
      password: ADMIN_PASSWORD,
    }),
  })

  const adminToken = String(login.token || '')
  assert(adminToken.length > 0, 'Login did not return token')

  const suffix = Math.random().toString(36).slice(2, 8)
  const register = await request(
    '/api/admin/agents/register',
    {
      method: 'POST',
      body: JSON.stringify({
        agentId: `smoke-agent-${suffix}`,
        name: `smoke-agent-${suffix}`,
      }),
    },
    adminToken
  )

  const agentId = String(register.agent?.agentId || '')
  const registrationCode = String(register.registrationCode || '')
  assert(agentId.length > 0, 'register response missing agentId')
  assert(registrationCode.length > 0, 'register response missing registrationCode')
  assertAgentStatus(register.agent?.status, 'register.agent.status')

  const tokenPayload = await request('/api/agent/v1/auth/token', {
    method: 'POST',
    headers: {
      'x-agent-protocol-version': '1',
    },
    body: JSON.stringify({ agentId, registrationCode }),
  })

  const accessToken = String(tokenPayload.accessToken || '')
  const refreshToken = String(tokenPayload.refreshToken || '')
  assert(accessToken.length > 0, 'agent auth missing accessToken')
  assert(refreshToken.length > 0, 'agent auth missing refreshToken')
  assert(Number(tokenPayload.expiresInSec || 0) > 0, 'agent auth missing expiresInSec')

  await request(
    '/api/agent/v1/heartbeat',
    {
      method: 'POST',
      headers: {
        'x-agent-protocol-version': '1',
      },
      body: JSON.stringify({
        agentId,
        agentVersion: 'smoke-1',
        capabilities: ['profiles.create', 'settings.set'],
        hostInfo: { os: process.platform, arch: process.arch },
        runtimeStatus: { runningProfileIds: [], queuedProfileIds: [] },
        timestamp: new Date().toISOString(),
      }),
    },
    accessToken
  )

  const createTask = await request(
    '/api/admin/agents/tasks',
    {
      method: 'POST',
      body: JSON.stringify({
        agentId,
        type: 'LOG_FLUSH',
        payload: { marker: `smoke-${suffix}` },
        idempotencyKey: `smoke-task-${suffix}`,
      }),
    },
    adminToken
  )

  const taskId = String(createTask.task?.taskId || '')
  assert(taskId.length > 0, 'task create missing taskId')
  assertTaskStatus(createTask.task?.status, 'task.create.status')

  const pulled = await request(
    '/api/agent/v1/tasks/pull',
    {
      method: 'POST',
      headers: {
        'x-agent-protocol-version': '1',
      },
      body: JSON.stringify({ timeoutMs: 1000 }),
    },
    accessToken
  )

  assert(Boolean(pulled.task), 'pull should return task')
  assert(String(pulled.task?.taskId || '') === taskId, `expected pulled task ${taskId}, got ${JSON.stringify(pulled.task)}`)
  assertTaskStatus(pulled.task?.status, 'task.pull.status')

  await request(
    `/api/agent/v1/tasks/${encodeURIComponent(taskId)}/ack`,
    {
      method: 'POST',
      headers: {
        'x-agent-protocol-version': '1',
      },
      body: JSON.stringify({
        taskId,
        status: 'RUNNING',
        idempotencyKey: `${taskId}-RUNNING`,
      }),
    },
    accessToken
  )

  await request(
    `/api/agent/v1/tasks/${encodeURIComponent(taskId)}/ack`,
    {
      method: 'POST',
      headers: {
        'x-agent-protocol-version': '1',
      },
      body: JSON.stringify({
        taskId,
        status: 'SUCCEEDED',
        idempotencyKey: `${taskId}-SUCCEEDED`,
        outputRef: `smoke://${taskId}`,
      }),
    },
    accessToken
  )

  const push = await request(
    '/api/agent/v1/config/push',
    {
      method: 'POST',
      headers: {
        'x-agent-protocol-version': '1',
      },
      body: JSON.stringify({
        syncVersion: 0,
        profiles: [],
        proxies: [],
        templates: [],
        cloudPhones: [],
        settings: {
          uiLanguage: 'zh-CN',
          workspaceName: 'Smoke Workspace',
        },
      }),
    },
    accessToken
  )

  const snapshot = await request(
    '/api/agent/v1/config/snapshot',
    {
      method: 'GET',
      headers: {
        'x-agent-protocol-version': '1',
      },
    },
    accessToken
  )

  const revoke = await request(
    `/api/admin/agents/${encodeURIComponent(agentId)}/revoke`,
    { method: 'POST' },
    adminToken
  )

  assert(Number(push.syncVersion || 0) > 0, 'config.push missing syncVersion')
  assert(
    Number(snapshot.snapshot?.syncVersion || 0) >= Number(push.syncVersion || 0),
    'snapshot syncVersion mismatch'
  )
  assert(Array.isArray(snapshot.snapshot?.profiles), 'snapshot.profiles must be array')
  assert(Array.isArray(snapshot.snapshot?.proxies), 'snapshot.proxies must be array')
  assert(Array.isArray(snapshot.snapshot?.templates), 'snapshot.templates must be array')
  assert(Array.isArray(snapshot.snapshot?.cloudPhones), 'snapshot.cloudPhones must be array')
  assert(snapshot.snapshot?.settings && typeof snapshot.snapshot.settings === 'object', 'snapshot.settings must be object')
  assertAgentStatus(revoke.status, 'revoke.status')
  await requestExpectStatus(
    '/api/agent/v1/tasks/pull',
    401,
    {
      method: 'POST',
      headers: {
        'x-agent-protocol-version': '1',
      },
      body: JSON.stringify({ timeoutMs: 1000 }),
    },
    accessToken
  )

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiBase: API_BASE,
        agentId,
        taskId,
        syncVersionAfterPush: push.syncVersion,
        snapshotSyncVersion: snapshot.snapshot?.syncVersion,
        revokedStatus: revoke.status,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
