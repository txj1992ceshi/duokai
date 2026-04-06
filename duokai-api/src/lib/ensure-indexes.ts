import { MongoServerError } from 'mongodb';
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

type IndexModel = {
  collection: {
    createIndex(keys: Record<string, 1 | -1>, options: Record<string, unknown>): Promise<string>;
  };
};

function isIndexOptionsConflict(error: unknown): error is MongoServerError {
  return error instanceof MongoServerError && error.codeName === 'IndexOptionsConflict';
}

async function ensureTtlIndex(
  model: IndexModel,
  keys: Record<string, 1 | -1>,
  expireAfterSeconds: number,
  name: string,
  collectionName: string
) {
  if (expireAfterSeconds <= 0) {
    return;
  }

  try {
    await model.collection.createIndex(keys, {
      name,
      expireAfterSeconds,
      background: true,
    });
  } catch (error) {
    if (isIndexOptionsConflict(error)) {
      console.warn(
        `[duokai-api] Skipping TTL index ${name} on ${collectionName}: equivalent index already exists with different options/name`
      );
      return;
    }
    throw error;
  }
}

export async function ensureMongoIndexes() {
  const adminActionLogTtlSeconds = daysToSeconds(
    parseTtlDays(process.env.ADMIN_ACTION_LOG_TTL_DAYS, 30)
  );
  const taskEventTtlSeconds = daysToSeconds(
    parseTtlDays(process.env.TASK_EVENT_TTL_DAYS, 7)
  );
  const agentSessionTtlSeconds = daysToSeconds(
    parseTtlDays(process.env.AGENT_SESSION_TTL_DAYS, 3)
  );
  const controlTaskTtlSeconds = daysToSeconds(
    parseTtlDays(process.env.CONTROL_TASK_TTL_DAYS, 7)
  );

  await Promise.all([
    ensureTtlIndex(
      AdminActionLogModel,
      { createdAt: 1 },
      adminActionLogTtlSeconds,
      'ttl_admin_action_logs_created_at',
      'AdminActionLog'
    ),
    ensureTtlIndex(
      TaskEventModel,
      { createdAt: 1 },
      taskEventTtlSeconds,
      'ttl_task_events_created_at',
      'TaskEvent'
    ),
    ensureTtlIndex(
      AgentSessionModel,
      { expiresAt: 1 },
      agentSessionTtlSeconds,
      'ttl_agent_sessions_expires_at',
      'AgentSession'
    ),
    ensureTtlIndex(
      ControlTaskModel,
      { createdAt: 1 },
      controlTaskTtlSeconds,
      'ttl_control_tasks_created_at',
      'ControlTask'
    ),
  ]);
}
