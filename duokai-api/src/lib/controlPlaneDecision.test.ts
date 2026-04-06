import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareAgentPriority,
  evaluateProfilePreLaunch,
  getAgentSelectionState,
  resolveDuplicateTaskBlock,
  selectAgentForAction,
  validateAgentRuntimeModeSupport,
} from './controlPlaneDecision.js';

test('evaluateProfilePreLaunch blocks unsupported runtime mode', () => {
  const result = evaluateProfilePreLaunch({
    _id: 'profile-1',
    runtimeMode: 'vm',
    lifecycleState: 'draft',
    cooldownSummary: { active: false },
    workspace: {
      healthSummary: { status: 'healthy', messages: [] },
      consistencySummary: { status: 'pass', messages: [] },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'RUNTIME_MODE_UNSUPPORTED');
});

test('evaluateProfilePreLaunch blocks strong-local when feature flag is disabled', () => {
  const previous = process.env.DUOKAI_ENABLE_STRONG_LOCAL;
  process.env.DUOKAI_ENABLE_STRONG_LOCAL = '0';
  try {
    const result = evaluateProfilePreLaunch({
      _id: 'profile-1',
      runtimeMode: 'strong-local',
      lifecycleState: 'draft',
      cooldownSummary: { active: false },
      workspace: {
        healthSummary: { status: 'healthy', messages: [] },
        consistencySummary: { status: 'pass', messages: [] },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'STRONG_LOCAL_DISABLED');
  } finally {
    if (previous === undefined) {
      delete process.env.DUOKAI_ENABLE_STRONG_LOCAL;
    } else {
      process.env.DUOKAI_ENABLE_STRONG_LOCAL = previous;
    }
  }
});

test('evaluateProfilePreLaunch blocks workspace readiness failures', () => {
  const result = evaluateProfilePreLaunch({
    _id: 'profile-1',
    runtimeMode: 'local',
    lifecycleState: 'draft',
    cooldownSummary: { active: false },
    workspace: {
      healthSummary: { status: 'healthy', messages: [] },
      consistencySummary: { status: 'block', messages: ['workspace drift'] },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'WORKSPACE_NOT_READY');
});

test('resolveDuplicateTaskBlock returns stable duplicate code for start', () => {
  const result = resolveDuplicateTaskBlock({
    action: 'start',
    profileId: 'profile-1',
    duplicateTask: {
      taskId: 'task-1',
      agentId: 'agent-1',
      status: 'PENDING',
      createdAt: '2026-04-07T00:00:00.000Z',
    },
  });

  assert.equal(result?.code, 'DUPLICATE_START_TASK');
});

test('selectAgentForAction prefers running agent before lower-load agent', () => {
  const selected = selectAgentForAction({
    profileId: 'profile-1',
    requiredCapability: 'runtime.launch',
    agents: [
      {
        agentId: 'agent-b',
        status: 'ONLINE',
        capabilities: ['runtime.launch'],
        lastSeenAt: new Date().toISOString(),
        runtimeStatus: { runningProfileIds: [], lockedProfileIds: [], staleLockProfileIds: [] },
      },
      {
        agentId: 'agent-a',
        status: 'ONLINE',
        capabilities: ['runtime.launch'],
        lastSeenAt: new Date().toISOString(),
        runtimeStatus: { runningProfileIds: ['profile-1'], lockedProfileIds: [], staleLockProfileIds: [] },
      },
    ],
  });

  assert.equal(selected.selectedAgent?.agentId, 'agent-a');
});

test('compareAgentPriority prefers fewer stale locks, then fewer running profiles', () => {
  const lowLoad = getAgentSelectionState({
    agentId: 'agent-a',
    runtimeStatus: { runningProfileIds: [], lockedProfileIds: [], staleLockProfileIds: [] },
    lastSeenAt: new Date().toISOString(),
  });
  const stale = getAgentSelectionState({
    agentId: 'agent-b',
    runtimeStatus: { runningProfileIds: [], lockedProfileIds: [], staleLockProfileIds: ['profile-1'] },
    lastSeenAt: new Date().toISOString(),
  });

  assert.ok(compareAgentPriority(lowLoad, stale) < 0);
});

test('validateAgentRuntimeModeSupport blocks agent without requested strong-local support', () => {
  const result = validateAgentRuntimeModeSupport({
    profile: {
      _id: 'profile-1',
      runtimeMode: 'strong-local',
    },
    agent: {
      agentId: 'agent-1',
      runtimeStatus: {
        supportedRuntimeModes: ['local'],
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'AGENT_RUNTIME_MODE_UNSUPPORTED');
});
