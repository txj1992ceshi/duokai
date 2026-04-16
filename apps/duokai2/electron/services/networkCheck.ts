import type { ProfileRecord, ProxyRecord, SettingsPayload } from '../../src/shared/types'

import { checkProfileEgress, type ProxyCheckResult } from './proxyCheck'

export interface NetworkHealthResult extends ProxyCheckResult {
  checkedAt: string
}

export async function checkNetworkHealth(
  profile: ProfileRecord,
  proxy: ProxyRecord | null,
  settings: SettingsPayload = {},
): Promise<NetworkHealthResult> {
  const result = await checkProfileEgress(profile, proxy, settings)
  return {
    ...result,
    checkedAt: new Date().toISOString(),
  }
}
