import type { ProfileRecord, ProxyRecord } from '../../src/shared/types'

import { checkProfileEgress, type ProxyCheckResult } from './proxyCheck'

export interface NetworkHealthResult extends ProxyCheckResult {
  checkedAt: string
}

export async function checkNetworkHealth(
  profile: ProfileRecord,
  proxy: ProxyRecord | null,
): Promise<NetworkHealthResult> {
  const result = await checkProfileEgress(profile, proxy)
  return {
    ...result,
    checkedAt: new Date().toISOString(),
  }
}

