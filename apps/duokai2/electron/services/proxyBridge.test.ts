import assert from 'node:assert/strict'
import test from 'node:test'

import {
  acquireLaunchProxy,
  closeAllProxyBridges,
  getProxyBridgeDiagnostics,
} from './proxyBridge.ts'

test('direct transport returns an idempotent no-op lease without opening a listener', async () => {
  const lease = await acquireLaunchProxy(null)
  assert.equal(lease.bridgeActive, false)
  assert.equal(lease.config, null)
  await lease.release()
  await lease.release()
  assert.deepEqual(await getProxyBridgeDiagnostics(), {
    activeBridgeCount: 0,
    totalLeaseCount: 0,
    bridges: [],
  })
  await closeAllProxyBridges()
})
