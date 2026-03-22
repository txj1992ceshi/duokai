import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionTaskStatus,
  isTerminalTaskStatus,
  validateAckPayload,
  validateHeartbeatPayload,
} from './agentProtocol.js';

test('task status transitions: allows valid forward flow', () => {
  assert.equal(canTransitionTaskStatus('PENDING', 'RECEIVED'), true);
  assert.equal(canTransitionTaskStatus('RECEIVED', 'RUNNING'), true);
  assert.equal(canTransitionTaskStatus('RUNNING', 'SUCCEEDED'), true);
  assert.equal(canTransitionTaskStatus('RUNNING', 'FAILED'), true);
  assert.equal(canTransitionTaskStatus('RUNNING', 'CANCELLED'), true);
});

test('task status transitions: blocks invalid or backward flow', () => {
  assert.equal(canTransitionTaskStatus('PENDING', 'SUCCEEDED'), false);
  assert.equal(canTransitionTaskStatus('RECEIVED', 'SUCCEEDED'), false);
  assert.equal(canTransitionTaskStatus('SUCCEEDED', 'RUNNING'), false);
  assert.equal(canTransitionTaskStatus('FAILED', 'RUNNING'), false);
});

test('terminal status helper', () => {
  assert.equal(isTerminalTaskStatus('SUCCEEDED'), true);
  assert.equal(isTerminalTaskStatus('FAILED'), true);
  assert.equal(isTerminalTaskStatus('CANCELLED'), true);
  assert.equal(isTerminalTaskStatus('RUNNING'), false);
});

test('ack payload validation: success path', () => {
  const result = validateAckPayload({
    status: 'RUNNING',
    idempotencyKey: 'abc',
    startedAt: '2026-03-21T12:00:00.000Z',
    errorCode: '',
    errorMessage: '',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status, 'RUNNING');
  assert.equal(result.value.idempotencyKey, 'abc');
  assert.equal(result.value.startedAt?.toISOString(), '2026-03-21T12:00:00.000Z');
});

test('ack payload validation: invalid status rejected', () => {
  const result = validateAckPayload({ status: 'UNKNOWN' });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /Invalid status/);
});

test('ack payload validation: invalid timestamp rejected', () => {
  const result = validateAckPayload({ status: 'RUNNING', startedAt: 'invalid-date' });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, 'startedAt is invalid date');
});

test('heartbeat payload validation sanitizes capabilities', () => {
  const result = validateHeartbeatPayload({
    agentVersion: '1.2.3',
    capabilities: ['PROFILE_START', 1, null, 'LOG_FLUSH'],
    hostInfo: { os: 'darwin' },
    runtimeStatus: { running: true },
  });

  assert.deepEqual(result.capabilities, ['PROFILE_START', 'LOG_FLUSH']);
  assert.equal(result.agentVersion, '1.2.3');
  assert.deepEqual(result.hostInfo, { os: 'darwin' });
});
