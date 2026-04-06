import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveControlTaskReasonCode } from './taskResults.js';

test('resolveControlTaskReasonCode prefers explicit errorCode', () => {
  assert.equal(
    resolveControlTaskReasonCode({
      status: 'FAILED',
      errorCode: 'RUNTIME_TIMEOUT',
      payload: { preLaunchDecision: { code: 'APPROVED' } },
    }),
    'RUNTIME_TIMEOUT'
  );
});

test('resolveControlTaskReasonCode falls back to pre-launch and lease codes', () => {
  assert.equal(
    resolveControlTaskReasonCode({
      status: 'FAILED',
      payload: {
        preLaunchDecision: { code: 'WORKSPACE_NOT_READY' },
        leaseValidation: { code: 'LEASE_OK' },
      },
    }),
    'WORKSPACE_NOT_READY'
  );
  assert.equal(
    resolveControlTaskReasonCode({
      status: 'FAILED',
      payload: {
        leaseValidation: { code: 'DEDICATED_IP_CONFLICT' },
      },
    }),
    'DEDICATED_IP_CONFLICT'
  );
});
