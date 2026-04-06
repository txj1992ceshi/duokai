export const AGENT_STATUSES = ['ONLINE', 'OFFLINE', 'DISABLED'] as const;
export const TASK_STATUSES = [
  'PENDING',
  'RECEIVED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;
export const TASK_TYPES = [
  'PROFILE_START',
  'PROFILE_STOP',
  'WORKSPACE_SNAPSHOT',
  'WORKSPACE_RESTORE',
  'PROFILE_VERIFY',
  'OPEN_PLATFORM',
] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskType = (typeof TASK_TYPES)[number];

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export function isTaskType(value: string): value is TaskType {
  return (TASK_TYPES as readonly string[]).includes(value);
}
