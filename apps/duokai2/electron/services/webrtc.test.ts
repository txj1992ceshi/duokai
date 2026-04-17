import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROXY_AWARE_WEBRTC_POLICY,
  applyWebRtcModeToLaunchArgs,
  buildWebRtcLaunchArgs,
} from './webrtc.ts'

test('buildWebRtcLaunchArgs maps all WebRTC modes to their launch flags', () => {
  assert.deepEqual(buildWebRtcLaunchArgs('default'), [])
  assert.deepEqual(buildWebRtcLaunchArgs('proxy-aware'), [
    `--force-webrtc-ip-handling-policy=${PROXY_AWARE_WEBRTC_POLICY}`,
  ])
  assert.deepEqual(buildWebRtcLaunchArgs('disabled'), ['--disable-webrtc'])
})

test('applyWebRtcModeToLaunchArgs deduplicates and replaces prior WebRTC flags', () => {
  const args = applyWebRtcModeToLaunchArgs(
    [
      '--mute-audio',
      '--disable-webrtc',
      '--force-webrtc-ip-handling-policy=default_public_interface_only',
    ],
    'proxy-aware',
  )

  assert.deepEqual(args, [
    '--mute-audio',
    `--force-webrtc-ip-handling-policy=${PROXY_AWARE_WEBRTC_POLICY}`,
  ])
})
