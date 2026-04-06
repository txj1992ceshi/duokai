import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRetryTaskPayload, normalizeTaskAttemptCount } from './taskRetries.js';

test('normalizeTaskAttemptCount clamps invalid values to fallback', () => {
  assert.equal(normalizeTaskAttemptCount(undefined, 3), 3);
  assert.equal(normalizeTaskAttemptCount(0, 2), 2);
  assert.equal(normalizeTaskAttemptCount(2.9, 1), 2);
});

test('buildRetryTaskPayload increments attempt metadata and links retry chain', () => {
  const payload = buildRetryTaskPayload({
    existingTask: {
      taskId: 'task-1',
      agentId: 'agent-1',
      type: 'PROFILE_START',
      payload: { profileId: 'profile-1' },
      idempotencyKey: 'start:profile-1',
      createdByUserId: 'user-1',
      createdByEmail: 'user@example.com',
      attemptCount: 1,
      maxAttempts: 3,
    },
  });

  assert.equal(payload.attemptCount, 2);
  assert.equal(payload.maxAttempts, 3);
  assert.equal(payload.retryOfTaskId, 'task-1');
  assert.equal(payload.idempotencyKey, 'start:profile-1:retry:2');
});
