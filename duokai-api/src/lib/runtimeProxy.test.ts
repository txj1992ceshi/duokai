import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRuntimeProxyFailure, classifyStorageArtifactFailure, isRuntimeTimeoutError } from './runtimeProxy.js';

test('isRuntimeTimeoutError detects timeout-like failures', () => {
  assert.equal(isRuntimeTimeoutError(new Error('Request timed out after 60000ms')), true);
  assert.equal(isRuntimeTimeoutError(new Error('socket hang up')), false);
});

test('classifyRuntimeProxyFailure maps timeout to 504', () => {
  const result = classifyRuntimeProxyFailure(new Error('Request timeout while contacting runtime'));
  assert.deepEqual(result, {
    status: 504,
    code: 'RUNTIME_TIMEOUT',
    error: 'Runtime service request timed out',
  });
});

test('classifyRuntimeProxyFailure maps network failures to 502', () => {
  const result = classifyRuntimeProxyFailure(new Error('connect ECONNREFUSED 127.0.0.1:3101'));
  assert.deepEqual(result, {
    status: 502,
    code: 'RUNTIME_UNREACHABLE',
    error: 'Runtime service is unreachable',
  });
});

test('classifyStorageArtifactFailure distinguishes missing artifacts', () => {
  const missing = Object.assign(new Error('no such file'), { code: 'ENOENT' });
  assert.deepEqual(classifyStorageArtifactFailure(missing), {
    status: 424,
    code: 'STORAGE_STATE_ARTIFACT_MISSING',
    error: 'Synced storage-state artifact is missing',
  });
});

test('classifyStorageArtifactFailure treats parse/decode failures as invalid artifacts', () => {
  assert.deepEqual(classifyStorageArtifactFailure(new Error('Unexpected token < in JSON')), {
    status: 424,
    code: 'STORAGE_STATE_ARTIFACT_INVALID',
    error: 'Synced storage-state artifact is invalid',
  });
});
