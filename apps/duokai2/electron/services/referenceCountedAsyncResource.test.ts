import assert from 'node:assert/strict'
import test from 'node:test'

import { ReferenceCountedAsyncResourcePool } from './referenceCountedAsyncResource.ts'

test('resource pool shares one creation and closes at zero references', async () => {
  const pool = new ReferenceCountedAsyncResourcePool<{ id: number }>()
  let created = 0
  let closed = 0
  const create = async () => ({ id: ++created })
  const close = async () => {
    closed += 1
  }

  const first = await pool.acquire('bridge', create, close)
  const second = await pool.acquire('bridge', create, close)
  assert.equal(created, 1)
  assert.equal(first.resource, second.resource)
  assert.equal((await pool.inspect())[0]?.referenceCount, 2)

  await first.release()
  assert.equal(closed, 0)
  assert.equal((await pool.inspect())[0]?.referenceCount, 1)

  await second.release()
  assert.equal(closed, 1)
  assert.deepEqual(await pool.inspect(), [])
})

test('release is idempotent and a later acquire creates a new resource', async () => {
  const pool = new ReferenceCountedAsyncResourcePool<{ id: number }>()
  let created = 0
  let closed = 0
  const lease = await pool.acquire(
    'bridge',
    async () => ({ id: ++created }),
    async () => {
      closed += 1
    },
  )
  await lease.release()
  await lease.release()
  assert.equal(closed, 1)

  const next = await pool.acquire(
    'bridge',
    async () => ({ id: ++created }),
    async () => {
      closed += 1
    },
  )
  assert.equal(next.resource.id, 2)
  await next.release()
  assert.equal(closed, 2)
})

test('failed creation is removed and can be retried', async () => {
  const pool = new ReferenceCountedAsyncResourcePool<{ id: number }>()
  let attempts = 0
  await assert.rejects(
    pool.acquire(
      'bridge',
      async () => {
        attempts += 1
        throw new Error('fixture failure')
      },
      async () => undefined,
    ),
    /fixture failure/,
  )
  assert.deepEqual(await pool.inspect(), [])

  const lease = await pool.acquire(
    'bridge',
    async () => ({ id: ++attempts }),
    async () => undefined,
  )
  assert.equal(lease.resource.id, 2)
  await lease.release()
})

test('closeAll closes every live resource once', async () => {
  const pool = new ReferenceCountedAsyncResourcePool<{ id: string }>()
  const closed: string[] = []
  await pool.acquire('a', async () => ({ id: 'a' }), async (resource) => {
    closed.push(resource.id)
  })
  await pool.acquire('b', async () => ({ id: 'b' }), async (resource) => {
    closed.push(resource.id)
  })
  assert.deepEqual(await pool.closeAll(), [])
  assert.deepEqual(closed.sort(), ['a', 'b'])
  assert.deepEqual(await pool.inspect(), [])
})
