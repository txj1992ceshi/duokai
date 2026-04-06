import { getDefaultPlatformPolicy } from './platformPolicies.js';
import { validateProfileLeaseForStart, type LeaseValidationResult } from './ipLease.js';

const AGENT_ACTIVE_WINDOW_MS = 2 * 60 * 1000;

export const ACTIVE_CONTROL_TASK_STATUSES = ['PENDING', 'RECEIVED', 'RUNNING'] as const;

type RuntimeStatusShape = Record<string, unknown> | null | undefined;

type AgentLike = {
  agentId: string;
  status?: string;
  capabilities?: unknown[];
  runtimeStatus?: RuntimeStatusShape;
  lastSeenAt?: Date | string | null;
};

type ProfileLike = {
  id?: string;
  _id?: unknown;
  platform?: string;
  purpose?: string;
  runtimeMode?: string;
  lifecycleState?: string;
  cooldownSummary?: unknown;
  workspace?: unknown;
};

type PlatformPolicyLike = {
  proxyPolicy?: Record<string, unknown> | null;
};

type DuplicateTaskLike = {
  taskId?: string;
  agentId?: string;
  status?: string;
  createdAt?: Date | string | null;
};

export type AgentSelectionState = {
  runningProfileIds: string[];
  lockedProfileIds: string[];
  staleLockProfileIds: string[];
  runningCount: number;
  lockedCount: number;
  staleLockCount: number;
  lastSeenAtMs: number;
};

export type PreLaunchBlock = {
  ok: false;
  code: string;
  message: string;
  detail?: Record<string, unknown>;
};

export type PreLaunchPass = {
  ok: true;
  code: 'APPROVED';
  message: string;
  detail: Record<string, unknown>;
};

export type PreLaunchDecision = PreLaunchBlock | PreLaunchPass;

function normalizeDate(value: Date | string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

export function isAgentOnline(agent: Pick<AgentLike, 'status' | 'lastSeenAt'>) {
  if (agent.status === 'DISABLED') {
    return false;
  }
  return normalizeDate(agent.lastSeenAt) >= Date.now() - AGENT_ACTIVE_WINDOW_MS;
}

export function hasCapability(agent: Pick<AgentLike, 'capabilities'>, capability: string) {
  return Array.isArray(agent.capabilities) && agent.capabilities.includes(capability);
}

export function getRunningProfileIds(agent: Pick<AgentLike, 'runtimeStatus'>) {
  const raw = agent.runtimeStatus?.runningProfileIds;
  return Array.isArray(raw) ? raw.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

export function getStringArrayField(
  container: { runtimeStatus?: RuntimeStatusShape } | null | undefined,
  key: string
) {
  const raw = container?.runtimeStatus?.[key];
  return Array.isArray(raw) ? raw.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

export function getAgentSelectionState(agent: AgentLike): AgentSelectionState {
  const runningProfileIds = getRunningProfileIds(agent);
  const lockedProfileIds = getStringArrayField(agent, 'lockedProfileIds');
  const staleLockProfileIds = getStringArrayField(agent, 'staleLockProfileIds');
  return {
    runningProfileIds,
    lockedProfileIds,
    staleLockProfileIds,
    runningCount: runningProfileIds.length,
    lockedCount: lockedProfileIds.length,
    staleLockCount: staleLockProfileIds.length,
    lastSeenAtMs: normalizeDate(agent.lastSeenAt),
  };
}

export function compareAgentPriority(left: AgentSelectionState, right: AgentSelectionState) {
  if (left.staleLockCount !== right.staleLockCount) {
    return left.staleLockCount - right.staleLockCount;
  }
  if (left.runningCount !== right.runningCount) {
    return left.runningCount - right.runningCount;
  }
  if (left.lockedCount !== right.lockedCount) {
    return left.lockedCount - right.lockedCount;
  }
  return right.lastSeenAtMs - left.lastSeenAtMs;
}

export function selectAgentForAction(options: {
  agents: AgentLike[];
  profileId: string;
  requiredCapability: string;
}) {
  const onlineAgents = options.agents.filter((agent) => isAgentOnline(agent));
  const capableAgents = onlineAgents.filter((agent) => hasCapability(agent, options.requiredCapability));

  let selectedAgent = capableAgents.find((agent) => getRunningProfileIds(agent).includes(options.profileId));
  if (!selectedAgent) {
    selectedAgent = capableAgents
      .map((agent) => ({ agent, state: getAgentSelectionState(agent) }))
      .filter(({ state }) => !state.lockedProfileIds.includes(options.profileId))
      .sort((left, right) => compareAgentPriority(left.state, right.state))[0]?.agent;
  }

  return {
    selectedAgent: selectedAgent || null,
    onlineAgents,
    capableAgents,
    selectedState: selectedAgent ? getAgentSelectionState(selectedAgent) : null,
  };
}

export function resolveDuplicateTaskBlock(options: {
  action: 'start' | 'stop';
  profileId: string;
  duplicateTask: DuplicateTaskLike | null;
}) {
  if (!options.duplicateTask) {
    return null;
  }
  const code = options.action === 'start' ? 'DUPLICATE_START_TASK' : 'DUPLICATE_STOP_TASK';
  return {
    ok: false,
    code,
    message:
      options.action === 'start'
        ? 'A profile start task is already pending or running for this profile.'
        : 'A profile stop task is already pending or running for this profile.',
    detail: {
      profileId: options.profileId,
      taskId: String(options.duplicateTask.taskId || '').trim(),
      agentId: String(options.duplicateTask.agentId || '').trim(),
      status: String(options.duplicateTask.status || '').trim(),
      createdAt: options.duplicateTask.createdAt || null,
    },
  } satisfies PreLaunchBlock;
}

function normalizeCooldownSummary(input: unknown) {
  if (!input || typeof input !== 'object') {
    return { active: false, reason: '', until: '' };
  }
  const source = input as Record<string, unknown>;
  return {
    active: !!source.active,
    reason: String(source.reason || '').trim(),
    until: String(source.until || '').trim(),
  };
}

export function evaluateProfilePreLaunch(profile: ProfileLike): PreLaunchDecision {
  const profileId = String(profile.id || profile._id || '').trim();
  const lifecycleState = String(profile.lifecycleState || 'draft').trim() || 'draft';
  const runtimeMode = String(profile.runtimeMode || 'local').trim() || 'local';
  const cooldownSummary = normalizeCooldownSummary(profile.cooldownSummary);
  const workspace =
    profile.workspace && typeof profile.workspace === 'object'
      ? (profile.workspace as Record<string, unknown>)
      : null;
  const healthSummary =
    workspace?.healthSummary && typeof workspace.healthSummary === 'object'
      ? (workspace.healthSummary as Record<string, unknown>)
      : {};
  const consistencySummary =
    workspace?.consistencySummary && typeof workspace.consistencySummary === 'object'
      ? (workspace.consistencySummary as Record<string, unknown>)
      : {};

  if (['archived', 'disabled', 'blocked'].includes(lifecycleState)) {
    return {
      ok: false,
      code: 'PROFILE_LIFECYCLE_BLOCKED',
      message: 'Profile lifecycle state does not allow launch approval.',
      detail: { profileId, lifecycleState },
    };
  }

  if (cooldownSummary.active) {
    return {
      ok: false,
      code: 'PROFILE_COOLDOWN_ACTIVE',
      message: 'Profile launch is blocked by an active cooldown state.',
      detail: { profileId, cooldownUntil: cooldownSummary.until, reason: cooldownSummary.reason },
    };
  }

  if (runtimeMode === 'vm' || runtimeMode === 'container') {
    return {
      ok: false,
      code: 'RUNTIME_MODE_UNSUPPORTED',
      message: 'The selected runtime mode is not currently supported for launch.',
      detail: { profileId, runtimeMode },
    };
  }

  if (String(healthSummary.status || '').trim() === 'broken') {
    return {
      ok: false,
      code: 'WORKSPACE_NOT_READY',
      message: 'Workspace health is broken and must be repaired before launch.',
      detail: {
        profileId,
        workspaceHealthStatus: String(healthSummary.status || '').trim(),
        messages: Array.isArray(healthSummary.messages) ? healthSummary.messages : [],
      },
    };
  }

  if (String(consistencySummary.status || '').trim() === 'block') {
    return {
      ok: false,
      code: 'WORKSPACE_NOT_READY',
      message: 'Workspace consistency is blocked and must be repaired before launch.',
      detail: {
        profileId,
        workspaceConsistencyStatus: String(consistencySummary.status || '').trim(),
        messages: Array.isArray(consistencySummary.messages) ? consistencySummary.messages : [],
      },
    };
  }

  return {
    ok: true,
    code: 'APPROVED',
    message: 'Profile passed control-plane pre-launch checks.',
    detail: {
      profileId,
      lifecycleState,
      runtimeMode,
      workspaceHealthStatus: String(healthSummary.status || 'unknown').trim() || 'unknown',
      workspaceConsistencyStatus: String(consistencySummary.status || 'unknown').trim() || 'unknown',
      cooldownActive: cooldownSummary.active,
    },
  };
}

export function validateStartWithLease(options: {
  profile: ProfileLike;
  activeLease: Record<string, unknown> | null;
  conflictingLeases: Record<string, unknown>[];
  proxyAsset: Record<string, unknown> | null;
  platformPolicy: PlatformPolicyLike | null;
  runningProfileIds: string[];
}): LeaseValidationResult {
  const resolvedPlatformPolicy =
    options.platformPolicy ||
    getDefaultPlatformPolicy(
      String(options.profile.platform || '').trim(),
      String(options.profile.purpose || 'operation').trim() || 'operation'
    );
  return validateProfileLeaseForStart(options.profile, options.activeLease, options.conflictingLeases, {
    proxyAsset: options.proxyAsset,
    proxyPolicy: resolvedPlatformPolicy?.proxyPolicy || null,
    runningProfileIds: options.runningProfileIds,
  });
}
