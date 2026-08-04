import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCloakClientHintsPolicy,
  evaluateCloakClientHintsCoherence,
  installCloakClientHintsPolicy,
} from './cloakBrowserClientHints.ts'

function windowsPolicy() {
  return buildCloakClientHintsPolicy({
    platform: 'windows',
    locale: 'fr-FR',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    chromiumVersion: '145.0.7632.109',
    platformVersion: '19.0.0',
    architecture: 'x86',
    bitness: '64',
    wow64: false,
  })
}

test('buildCloakClientHintsPolicy creates coherent Windows x86 metadata', () => {
  const policy = windowsPolicy()

  assert.equal(policy.enforcement, 'cdp-native-override')
  assert.equal(policy.acceptLanguage, 'fr-FR,fr')
  assert.equal(policy.navigatorPlatform, 'Win32')
  assert.equal(policy.metadata.platform, 'Windows')
  assert.equal(policy.metadata.architecture, 'x86')
  assert.equal(policy.metadata.bitness, '64')
  assert.equal(policy.metadata.fullVersion, '145.0.7632.109')
})

test('evaluateCloakClientHintsCoherence reports architecture drift', () => {
  const policy = windowsPolicy()
  const failed = evaluateCloakClientHintsCoherence(policy, {
    userAgent: policy.userAgent,
    navigatorPlatform: 'Win32',
    architecture: 'arm',
    bitness: '64',
    platform: 'Windows',
    platformVersion: '19.0.0',
    wow64: false,
  })
  assert.equal(failed.passed, false)
  assert.equal(failed.mismatches.some((value) => value.startsWith('architecture:')), true)

  const passed = evaluateCloakClientHintsCoherence(policy, {
    userAgent: policy.userAgent,
    navigatorPlatform: policy.navigatorPlatform,
    architecture: policy.metadata.architecture,
    bitness: policy.metadata.bitness,
    platform: policy.metadata.platform,
    platformVersion: policy.metadata.platformVersion,
    wow64: policy.metadata.wow64,
  })
  assert.deepEqual(passed, { passed: true, mismatches: [] })
})

test('installCloakClientHintsPolicy covers existing and explicitly created pages', async () => {
  const existingPage = {}
  const createdPage = {}
  const calls: Array<{ page: object; method: string; params?: Record<string, unknown> }> = []
  const context = {
    pages: () => [existingPage],
    newPage: async () => createdPage,
    newCDPSession: async (page: object) => ({
      send: async (method: string, params?: Record<string, unknown>) => {
        calls.push({ page, method, params })
        return {}
      },
      detach: async () => undefined,
    }),
  }

  const policy = windowsPolicy()
  await installCloakClientHintsPolicy(context, policy)
  const page = await context.newPage()

  assert.equal(page, createdPage)
  assert.equal(calls.length, 2)
  assert.equal(calls.every((call) => call.method === 'Emulation.setUserAgentOverride'), true)
  assert.equal(
    calls.every(
      (call) =>
        (call.params?.userAgentMetadata as { architecture?: string } | undefined)?.architecture ===
        'x86',
    ),
    true,
  )
})
