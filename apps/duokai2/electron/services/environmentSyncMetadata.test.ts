import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveEnvironmentSyncMetadataUpdate } from './environmentSyncMetadata.ts'

const baseline = {
  status: 'synced' as const,
  message: '已自动从云端收敛环境配置',
  syncedAt: '2026-07-28T18:50:24.619Z',
}

test('identical automatic sync metadata is a zero-write no-op', () => {
  const resolved = resolveEnvironmentSyncMetadataUpdate(
    baseline,
    {
      status: 'synced',
      message: '已自动从云端收敛环境配置',
    },
    '2026-07-29T15:16:02.026Z',
  )

  assert.deepEqual(resolved, {
    changed: false,
    next: baseline,
  })
})

test('status changes receive the current timestamp', () => {
  const resolved = resolveEnvironmentSyncMetadataUpdate(
    baseline,
    {
      status: 'syncing',
      message: '正在同步当前环境配置到云端',
    },
    '2026-07-29T15:16:02.026Z',
  )

  assert.equal(resolved.changed, true)
  assert.equal(resolved.next.status, 'syncing')
  assert.equal(resolved.next.syncedAt, '2026-07-29T15:16:02.026Z')
})

test('an explicit timestamp refresh remains writable', () => {
  const resolved = resolveEnvironmentSyncMetadataUpdate(
    baseline,
    {
      status: baseline.status,
      message: baseline.message,
      syncedAt: '2026-07-29T15:16:02.026Z',
    },
    'unused',
  )

  assert.equal(resolved.changed, true)
  assert.equal(resolved.next.syncedAt, '2026-07-29T15:16:02.026Z')
})
