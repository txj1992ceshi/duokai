export type ControlPlaneAction =
  | 'start'
  | 'stop'
  | 'snapshot'
  | 'restore'
  | 'verify'
  | 'open-platform';

export interface ControlActionDefinition {
  action: ControlPlaneAction;
  taskType:
    | 'PROFILE_START'
    | 'PROFILE_STOP'
    | 'WORKSPACE_SNAPSHOT'
    | 'WORKSPACE_RESTORE'
    | 'PROFILE_VERIFY'
    | 'OPEN_PLATFORM';
  requiredCapability: string;
  requiresProfileId: boolean;
  requiresSnapshotId: boolean;
}

const DEFINITIONS: Record<ControlPlaneAction, ControlActionDefinition> = {
  start: {
    action: 'start',
    taskType: 'PROFILE_START',
    requiredCapability: 'runtime.launch',
    requiresProfileId: true,
    requiresSnapshotId: false,
  },
  stop: {
    action: 'stop',
    taskType: 'PROFILE_STOP',
    requiredCapability: 'runtime.stop',
    requiresProfileId: true,
    requiresSnapshotId: false,
  },
  snapshot: {
    action: 'snapshot',
    taskType: 'WORKSPACE_SNAPSHOT',
    requiredCapability: 'workspace.snapshot',
    requiresProfileId: true,
    requiresSnapshotId: false,
  },
  restore: {
    action: 'restore',
    taskType: 'WORKSPACE_RESTORE',
    requiredCapability: 'workspace.restore',
    requiresProfileId: true,
    requiresSnapshotId: true,
  },
  verify: {
    action: 'verify',
    taskType: 'PROFILE_VERIFY',
    requiredCapability: 'profile.verify',
    requiresProfileId: true,
    requiresSnapshotId: false,
  },
  'open-platform': {
    action: 'open-platform',
    taskType: 'OPEN_PLATFORM',
    requiredCapability: 'runtime.open-platform',
    requiresProfileId: true,
    requiresSnapshotId: false,
  },
};

export function normalizeControlPlaneAction(value: unknown): ControlPlaneAction | null {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized in DEFINITIONS ? (normalized as ControlPlaneAction) : null;
}

export function getControlActionDefinition(action: ControlPlaneAction): ControlActionDefinition {
  return DEFINITIONS[action];
}

export function buildTaskIdempotencyKey(action: ControlPlaneAction, profileId: string, snapshotId = ''): string {
  const base = [action, profileId.trim(), snapshotId.trim()].filter(Boolean).join(':');
  return `${base}:${Date.now()}`;
}
