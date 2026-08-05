import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { applyPlatformTemplate, createDefaultFingerprint } from './factories.ts'
import { assignStableHardwareFingerprint } from '../../src/shared/hardwareProfiles.ts'
import { CLOAK_BROWSER_MAJOR, CLOAK_BROWSER_VERSION } from '../../src/shared/cloakBrowserVersion.ts'

test('platform presets never overwrite the generated machine identity', () => {
  const identity = assignStableHardwareFingerprint(createDefaultFingerprint(), 'policy-profile', {
    forceRegenerate: true,
    seed: 'policy-profile',
    hostOperatingSystem: 'macOS',
    enforceHostCompatibility: true,
  })
  const before = {
    operatingSystem: identity.advanced.operatingSystem,
    browserVersion: identity.advanced.browserVersion,
    resolution: identity.resolution,
    cpuCores: identity.advanced.cpuCores,
    memoryGb: identity.advanced.memoryGb,
    renderer: identity.advanced.webglRenderer,
    seed: identity.runtimeMetadata.hardwareSeed,
    templateId: identity.runtimeMetadata.hardwareTemplateId,
  }

  for (const platform of ['linkedin', 'tiktok']) {
    const { fingerprint } = applyPlatformTemplate(identity, platform)
    assert.deepEqual(
      {
        operatingSystem: fingerprint.advanced.operatingSystem,
        browserVersion: fingerprint.advanced.browserVersion,
        resolution: fingerprint.resolution,
        cpuCores: fingerprint.advanced.cpuCores,
        memoryGb: fingerprint.advanced.memoryGb,
        renderer: fingerprint.advanced.webglRenderer,
        seed: fingerprint.runtimeMetadata.hardwareSeed,
        templateId: fingerprint.runtimeMetadata.hardwareTemplateId,
      },
      before,
    )
  }
})

test('profile editor exposes the automatic identity policy and locks saved identities', () => {
  const source = readFileSync(new URL('../../src/components/profile/ProfileDrawer.tsx', import.meta.url), 'utf8')
  assert.match(source, /机器身份：自动生成（推荐）/)
  assert.match(source, /系统家族：与当前电脑兼容/)
  assert.match(source, /设备画像：每个环境独立生成/)
  assert.match(source, /地区信息：跟随代理出口/)
  assert.match(source, /身份稳定性：创建后固定/)
  assert.match(source, /!selectedProfileId/)
  assert.doesNotMatch(source, /OPERATING_SYSTEM_OPTIONS/)
})

test('local mac package uses opt-in ad-hoc signing without changing formal release signing', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { scripts: Record<string, string> }
  const config = readFileSync(new URL('../../electron-builder.config.cjs', import.meta.url), 'utf8')

  assert.match(packageJson.scripts['build:mac'], /DUOKAI_ADHOC_SIGN=1/)
  assert.doesNotMatch(packageJson.scripts['build:mac:release'], /DUOKAI_ADHOC_SIGN=1/)
  assert.match(config, /process\.env\.DUOKAI_ADHOC_SIGN !== '1'/)
  assert.match(config, /'--deep'/)
  assert.match(config, /'--sign'/)
})

test('generated identity baseline matches the exact bundled Cloak browser', () => {
  const generated = assignStableHardwareFingerprint(createDefaultFingerprint(), 'exact-cloak-version', {
    forceRegenerate: true,
    seed: 'exact-cloak-version',
    hostOperatingSystem: 'macOS',
    enforceHostCompatibility: true,
  })
  assert.equal(generated.advanced.browserVersion, CLOAK_BROWSER_MAJOR)
  assert.equal(generated.advanced.browserKernelVersion, CLOAK_BROWSER_MAJOR)
  assert.equal(generated.userAgent.includes(`Chrome/${CLOAK_BROWSER_MAJOR}.0.0.0`), true)
  assert.equal(CLOAK_BROWSER_VERSION.startsWith(`${CLOAK_BROWSER_MAJOR}.`), true)
})
