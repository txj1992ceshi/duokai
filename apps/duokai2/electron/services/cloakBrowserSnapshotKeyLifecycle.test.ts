import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  ElectronSafeStorageSigningKeyringProvider,
} from './cloakBrowserSnapshotKeyLifecycle.ts'
import {
  CloakSnapshotSignatureError,
  createInMemoryCloakSigningKey,
  type SafeStorageLike,
} from './cloakBrowserSnapshotSignature.ts'

function safeStorageFixture(backend = 'keychain'): SafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plainText) => Buffer.from(`sealed:${plainText}`, 'utf8'),
    decryptString: (encrypted) => {
      const value = encrypted.toString('utf8')
      if (!value.startsWith('sealed:')) throw new Error('invalid sealed value')
      return value.slice('sealed:'.length)
    },
    getSelectedStorageBackend: () => backend,
  }
}

async function tempKeyPath(): Promise<{ root: string; keyFilePath: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-keyring-'))
  return { root, keyFilePath: path.join(root, 'sealed-signing-key.json') }
}

const secureStorageTestPlatform: 'win32' | 'darwin' =
  process.platform === 'win32' ? 'win32' : 'darwin'

test('keyring creates one private active key without plaintext secret material', async () => {
  const fixture = await tempKeyPath()
  const secret = Buffer.alloc(32, 7)
  try {
    const provider = new ElectronSafeStorageSigningKeyringProvider({
      keyFilePath: fixture.keyFilePath,
      loadSafeStorage: async () => safeStorageFixture(),
      platform: secureStorageTestPlatform,
      randomKey: () => Buffer.from(secret),
      now: () => new Date('2026-07-27T17:00:00.000Z'),
    })
    const active = await provider.getActiveKey()
    const metadata = await provider.getMetadata()
    const raw = await readFile(fixture.keyFilePath, 'utf8')

    assert.equal(metadata.schemaVersion, 2)
    assert.equal(metadata.activeKeyId, active.keyId)
    assert.deepEqual(metadata.keys.map((key) => key.status), ['active'])
    assert.equal(raw.includes(secret.toString('base64')), false)
    assert.equal(JSON.parse(raw).schemaVersion, 2)
    if (process.platform !== 'win32') {
      assert.equal((await stat(fixture.keyFilePath)).mode & 0o077, 0)
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('rotation keeps retired keys available while signing switches to the new active key', async () => {
  const fixture = await tempKeyPath()
  const secrets = [Buffer.alloc(32, 1), Buffer.alloc(32, 2), Buffer.alloc(32, 3)]
  let index = 0
  let timestamp = 0
  try {
    const provider = new ElectronSafeStorageSigningKeyringProvider({
      keyFilePath: fixture.keyFilePath,
      loadSafeStorage: async () => safeStorageFixture(),
      platform: secureStorageTestPlatform,
      randomKey: () => Buffer.from(secrets[index++] ?? Buffer.alloc(32, 9)),
      now: () => new Date(Date.UTC(2026, 6, 27, 17, timestamp++)),
      maxRetiredKeys: 2,
    })
    const first = await provider.getActiveKey()
    await provider.rotate()
    const second = await provider.getActiveKey()
    await provider.rotate()
    const third = await provider.getActiveKey()

    assert.notEqual(first.keyId, second.keyId)
    assert.notEqual(second.keyId, third.keyId)
    assert.equal((await provider.getKey(first.keyId))?.secret.equals(first.secret), true)
    assert.equal((await provider.getKey(second.keyId))?.secret.equals(second.secret), true)
    assert.equal((await provider.getKey(third.keyId))?.secret.equals(third.secret), true)
    assert.deepEqual(
      (await provider.getMetadata()).keys.map((key) => key.status).sort(),
      ['active', 'retired', 'retired'],
    )
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('reset intentionally invalidates every previous key ID', async () => {
  const fixture = await tempKeyPath()
  const secrets = [Buffer.alloc(32, 4), Buffer.alloc(32, 5)]
  let index = 0
  try {
    const provider = new ElectronSafeStorageSigningKeyringProvider({
      keyFilePath: fixture.keyFilePath,
      loadSafeStorage: async () => safeStorageFixture(),
      platform: secureStorageTestPlatform,
      randomKey: () => Buffer.from(secrets[index++] ?? Buffer.alloc(32, 9)),
      now: () => new Date('2026-07-27T17:10:00.000Z'),
    })
    const previous = await provider.getActiveKey()
    const reset = await provider.reset()
    assert.notEqual(reset.activeKeyId, previous.keyId)
    assert.equal(await provider.getKey(previous.keyId), null)
    assert.equal(reset.keys.length, 1)
    assert.equal(reset.keys[0]?.status, 'active')
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('legacy single sealed-key files migrate atomically to schema 2 without changing key identity', async () => {
  const fixture = await tempKeyPath()
  const safeStorage = safeStorageFixture()
  const legacyKey = createInMemoryCloakSigningKey(
    Buffer.alloc(32, 6),
    '2026-07-27T17:20:00.000Z',
  )
  try {
    await writeFile(
      fixture.keyFilePath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          keyId: legacyKey.keyId,
          createdAt: legacyKey.createdAt,
          encryptedSecretBase64: safeStorage
            .encryptString(legacyKey.secret.toString('base64'))
            .toString('base64'),
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    )
    const provider = new ElectronSafeStorageSigningKeyringProvider({
      keyFilePath: fixture.keyFilePath,
      loadSafeStorage: async () => safeStorage,
      platform: secureStorageTestPlatform,
      now: () => new Date('2026-07-27T17:21:00.000Z'),
    })
    const active = await provider.getActiveKey()
    const migrated = JSON.parse(await readFile(fixture.keyFilePath, 'utf8')) as {
      schemaVersion: number
      activeKeyId: string
      keys: Array<{ keyId: string }>
    }
    assert.equal(active.keyId, legacyKey.keyId)
    assert.equal(active.secret.equals(legacyKey.secret), true)
    assert.equal(migrated.schemaVersion, 2)
    assert.equal(migrated.activeKeyId, legacyKey.keyId)
    assert.deepEqual(migrated.keys.map((key) => key.keyId), [legacyKey.keyId])
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('corrupt keyrings and Linux basic_text storage fail closed', async () => {
  const fixture = await tempKeyPath()
  try {
    await writeFile(
      fixture.keyFilePath,
      '{"schemaVersion":2,"activeKeyId":"missing","updatedAt":"bad","keys":[]}\n',
      { mode: 0o600 },
    )
    const corrupt = new ElectronSafeStorageSigningKeyringProvider({
      keyFilePath: fixture.keyFilePath,
      loadSafeStorage: async () => safeStorageFixture(),
      platform: secureStorageTestPlatform,
    })
    await assert.rejects(
      corrupt.getActiveKey(),
      (error: unknown) =>
        error instanceof CloakSnapshotSignatureError &&
        error.code === 'signing_key_unavailable',
    )

    await rm(fixture.keyFilePath, { force: true })
    const unsafe = new ElectronSafeStorageSigningKeyringProvider({
      keyFilePath: fixture.keyFilePath,
      loadSafeStorage: async () => safeStorageFixture('basic_text'),
      platform: 'linux',
    })
    await assert.rejects(
      unsafe.getActiveKey(),
      (error: unknown) =>
        error instanceof CloakSnapshotSignatureError && error.code === 'unsafe_key_storage',
    )
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})
