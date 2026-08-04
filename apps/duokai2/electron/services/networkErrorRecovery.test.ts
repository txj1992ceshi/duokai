import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyRecoverableGlobalNetworkError } from './networkErrorRecovery.ts'

function errorWithCode(message: string, code: string, stack: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string }
  error.code = code
  error.stack = stack
  return error
}

test('network TLS write EPIPE is recoverable and does not trigger global shutdown', () => {
  const classification = classifyRecoverableGlobalNetworkError(
    errorWithCode(
      'write EPIPE',
      'EPIPE',
      [
        'Error: write EPIPE',
        '    at afterWriteDispatched (node:internal/stream_base_commons:159:15)',
        '    at Socket._writeGeneric (node:net:966:11)',
        '    at TLSSocket.ondata (node:internal/streams/readable:1012:24)',
      ].join('\n'),
    ),
  )

  assert.equal(classification.recoverable, true)
  assert.deepEqual(classification.matchedBy, ['network-stream:EPIPE'])
  assert.equal(classification.stackHint.includes('stack:tls_socket'), true)
})

test('generic stdout EPIPE remains fatal without a network stack signal', () => {
  const classification = classifyRecoverableGlobalNetworkError(
    errorWithCode(
      'write EPIPE',
      'EPIPE',
      [
        'Error: write EPIPE',
        '    at Socket._writeGeneric (node:net:966:11)',
        '    at process.stdout.write (node:internal/process/task_queues:105:5)',
      ].join('\n'),
    ),
  )

  assert.equal(classification.recoverable, false)
  assert.deepEqual(classification.matchedBy, [])
})

test('filesystem-domain EPIPE remains fatal even with a stream stack', () => {
  const classification = classifyRecoverableGlobalNetworkError(
    errorWithCode(
      'write EPIPE while writeFileSync persisted state',
      'EPIPE',
      [
        'Error: write EPIPE while writeFileSync persisted state',
        '    at writeFileSync (node:fs:2417:20)',
        '    at TLSSocket.ondata (node:internal/streams/readable:1012:24)',
      ].join('\n'),
    ),
  )

  assert.equal(classification.recoverable, false)
  assert.equal(classification.matchedBy.includes('network-stream:EPIPE'), true)
  assert.equal(classification.fatalDomainDeniedBy.includes('fatal-domain:filesystem'), true)
})

test('existing ECONNRESET classification remains recoverable', () => {
  const classification = classifyRecoverableGlobalNetworkError(
    errorWithCode(
      'socket hang up',
      'ECONNRESET',
      'Error: socket hang up\n    at TLSSocket.ondata (node:internal/streams/readable:1012:24)',
    ),
  )

  assert.equal(classification.recoverable, true)
  assert.equal(classification.matchedBy.includes('code:ECONNRESET'), true)
})
