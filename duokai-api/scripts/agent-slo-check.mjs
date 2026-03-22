const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:3100').replace(/\/$/, '')
const ADMIN_IDENTIFIER = process.env.ADMIN_IDENTIFIER || process.env.ADMIN_EMAIL || ''
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const WINDOW_MINUTES = Number(process.env.WINDOW_MINUTES || 60)
const RUNNING_TIMEOUT_MINUTES = Number(process.env.RUNNING_TIMEOUT_MINUTES || 10)
const MIN_HEARTBEAT_RATE = Number(process.env.MIN_HEARTBEAT_RATE || 99)
const MIN_TASK_SUCCESS_RATE = Number(process.env.MIN_TASK_SUCCESS_RATE || 95)
const MAX_STUCK_RUNNING = Number(process.env.MAX_STUCK_RUNNING || 0)
const REQUIRE_ACTIVE_HEARTBEAT = process.env.REQUIRE_ACTIVE_HEARTBEAT === '1'

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
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
  assert(adminToken.length > 0, 'login missing token')

  const metricsPayload = await request(
    `/api/admin/agents/metrics?windowMinutes=${encodeURIComponent(String(WINDOW_MINUTES))}&runningTimeoutMinutes=${encodeURIComponent(String(RUNNING_TIMEOUT_MINUTES))}`,
    { method: 'GET' },
    adminToken
  )
  const metrics = metricsPayload.metrics || {}
  const heartbeat = metrics.heartbeat || {}
  const tasks = metrics.tasks || {}

  const heartbeatRate = Number(heartbeat.activeRatePercent || 0)
  const activeAgents = Number(heartbeat.activeAgents || 0)
  const taskSuccessRate = Number(tasks.successRatePercent || 0)
  const stuckRunning = Number(tasks.stuckRunning || 0)
  const totalAgents = Number(heartbeat.totalAgents || 0)
  const totalFinishedInWindow = Number(tasks.totalFinishedInWindow || 0)

  const findings = []
  const heartbeatCheckSkipped = !REQUIRE_ACTIVE_HEARTBEAT && activeAgents === 0
  if (!heartbeatCheckSkipped && totalAgents > 0 && heartbeatRate < MIN_HEARTBEAT_RATE) {
    findings.push(`heartbeat active rate ${heartbeatRate}% < ${MIN_HEARTBEAT_RATE}%`)
  }
  if (totalFinishedInWindow > 0 && taskSuccessRate < MIN_TASK_SUCCESS_RATE) {
    findings.push(`task success rate ${taskSuccessRate}% < ${MIN_TASK_SUCCESS_RATE}%`)
  }
  if (stuckRunning > MAX_STUCK_RUNNING) {
    findings.push(`stuck RUNNING ${stuckRunning} > ${MAX_STUCK_RUNNING}`)
  }

  const report = {
    ok: findings.length === 0,
    apiBase: API_BASE,
    threshold: {
      minHeartbeatRate: MIN_HEARTBEAT_RATE,
      minTaskSuccessRate: MIN_TASK_SUCCESS_RATE,
      maxStuckRunning: MAX_STUCK_RUNNING,
      requireActiveHeartbeat: REQUIRE_ACTIVE_HEARTBEAT,
    },
    metrics: {
      windowMinutes: Number(metrics.windowMinutes || WINDOW_MINUTES),
      runningTimeoutMinutes: Number(metrics.runningTimeoutMinutes || RUNNING_TIMEOUT_MINUTES),
      heartbeat,
      tasks,
    },
    findings,
    checks: {
      heartbeatCheckSkipped,
      heartbeatSkipReason: heartbeatCheckSkipped
        ? 'No active agents in current sample; set REQUIRE_ACTIVE_HEARTBEAT=1 to enforce'
        : '',
    },
  }

  console.log(JSON.stringify(report, null, 2))
  if (findings.length > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
