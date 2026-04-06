import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTaskIdempotencyKey,
  getControlActionDefinition,
  normalizeControlPlaneAction,
} from './controlTasks.js';

test('normalizeControlPlaneAction accepts canonical actions', () => {
  assert.equal(normalizeControlPlaneAction('start'), 'start');
  assert.equal(normalizeControlPlaneAction('snapshot'), 'snapshot');
  assert.equal(normalizeControlPlaneAction('open-platform'), 'open-platform');
  assert.equal(normalizeControlPlaneAction('invalid'), null);
});

test('getControlActionDefinition maps action to task type and capability', () => {
  const restore = getControlActionDefinition('restore');
  assert.equal(restore.taskType, 'WORKSPACE_RESTORE');
  assert.equal(restore.requiredCapability, 'workspace.restore');
  assert.equal(restore.requiresSnapshotId, true);
});

test('buildTaskIdempotencyKey includes action and identifiers', () => {
  const key = buildTaskIdempotencyKey('restore', 'profile-1', 'snapshot-1');
  assert.match(key, /^restore:profile-1:snapshot-1:/);
});

test('buildTaskIdempotencyKey stays stable for start and stop dedupe', () => {
  assert.equal(buildTaskIdempotencyKey('start', 'profile-1'), 'start:profile-1');
  assert.equal(buildTaskIdempotencyKey('stop', 'profile-1'), 'stop:profile-1');
});
