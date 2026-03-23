import { AdminActionLogModel } from '../models/AdminActionLog.js';
import { AgentSessionModel } from '../models/AgentSession.js';
import { ControlTaskModel } from '../models/ControlTask.js';
import { TaskEventModel } from '../models/TaskEvent.js';

function parseTtlDays(value: string | undefined, fallbackDays: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallbackDays;
  }
  return parsed;
}

function daysToSeconds(days: number): number {
  return Math.floor(days * 24 * 60 * 60);
}

async function ensureTtlIndex(
  model: { collection: { createIndex(keys: Record<string, 1 | -1>, options: Record<string, unknown>): Promise<string> } },
  keys: Record<string, 1 | -1>,
  expireAfterSeconds: number,
  name: string
) {
  if (expireAfterSeconds <= 0) {
    return;
  }
  await model.collection.createIndex(keys, {
    name,
    expireAfterSeconds,
    background: true,
  });
}

export async function ensureMongoIndexes() {
  const adminActionLogTtlSeconds = daysToSeconds(
    parseTtlDays(process.env.ADMIN_ACTION_LOG_TTL_DAYS, 30)
  );
  const taskEventTtlSeconds = daysToSeconds(
    parseTtlDays(process.env.TASK_EVENT_TTL_DAYS, 30)
  );
  const agentSessionTtlSeconds = daysToSeconds(
    parseTtlDays(process.env.AGENT_SESSION_TTL_DAYS, 30)
  );
  const controlTaskTtlSeconds = daysToSeconds(
    parseTtlDays(process.env.CONTROL_TASK_TTL_DAYS, 0)
  );

  await Promise.all([
    ensureTtlIndex(
      AdminActionLogModel,
      { createdAt: 1 },
      adminActionLogTtlSeconds,
      'ttl_admin_action_logs_created_at'
    ),
    ensureTtlIndex(
      TaskEventModel,
      { createdAt: 1 },
      taskEventTtlSeconds,
      'ttl_task_events_created_at'
    ),
    ensureTtlIndex(
      AgentSessionModel,
      { expiresAt: 1 },
      agentSessionTtlSeconds,
      'ttl_agent_sessions_expires_at'
    ),
    ensureTtlIndex(
      ControlTaskModel,
      { createdAt: 1 },
      controlTaskTtlSeconds,
      'ttl_control_tasks_created_at'
    ),
  ]);
}
