type ProxyAssetLike = {
  _id?: unknown;
  id?: string;
  sharingMode?: string;
  maxProfilesPerIp?: number | null;
  maxConcurrentRunsPerIp?: number | null;
};

type LeaseLike = {
  proxyAssetId?: string;
  profileId?: string;
  state?: string;
};

type ProfileLike = {
  _id?: unknown;
  id?: string;
  proxyAssetId?: string;
};

function getId(value: { _id?: unknown; id?: string }) {
  return String(value.id || value._id || '').trim();
}

export function buildProxyAssetUsageMap(
  assets: ProxyAssetLike[],
  profiles: ProfileLike[],
  leases: LeaseLike[],
  runningProfileIds: string[],
) {
  const runningSet = new Set(runningProfileIds.map((item) => String(item || '').trim()).filter(Boolean));
  const map = new Map<
    string,
    {
      boundProfileIds: string[];
      activeLeaseProfileIds: string[];
      runningProfileIds: string[];
    }
  >();

  for (const asset of assets) {
    const assetId = getId(asset);
    if (!assetId) continue;
    map.set(assetId, {
      boundProfileIds: [],
      activeLeaseProfileIds: [],
      runningProfileIds: [],
    });
  }

  for (const profile of profiles) {
    const assetId = String(profile.proxyAssetId || '').trim();
    const profileId = getId(profile);
    if (!assetId || !profileId || !map.has(assetId)) continue;
    map.get(assetId)!.boundProfileIds.push(profileId);
  }

  for (const lease of leases) {
    const assetId = String(lease.proxyAssetId || '').trim();
    const profileId = String(lease.profileId || '').trim();
    if (!assetId || !profileId || !map.has(assetId)) continue;
    if (String(lease.state || '').trim() !== 'active') continue;
    map.get(assetId)!.activeLeaseProfileIds.push(profileId);
  }

  for (const [assetId, usage] of map.entries()) {
    const candidateIds = new Set([...usage.boundProfileIds, ...usage.activeLeaseProfileIds]);
    usage.runningProfileIds = [...candidateIds].filter((profileId) => runningSet.has(profileId));
    usage.boundProfileIds = [...new Set(usage.boundProfileIds)];
    usage.activeLeaseProfileIds = [...new Set(usage.activeLeaseProfileIds)];
  }

  return map;
}

export function serializeProxyAssetWithUsage(
  asset: ProxyAssetLike & Record<string, unknown>,
  usage?: {
    boundProfileIds: string[];
    activeLeaseProfileIds: string[];
    runningProfileIds: string[];
  }
) {
  const boundProfileIds = usage?.boundProfileIds || [];
  const activeLeaseProfileIds = usage?.activeLeaseProfileIds || [];
  const runningProfileIds = usage?.runningProfileIds || [];
  return {
    ...asset,
    id: getId(asset),
    sharingMode: String(asset.sharingMode || 'dedicated').trim() || 'dedicated',
    maxProfilesPerIp: Math.max(1, Number(asset.maxProfilesPerIp || 1) || 1),
    maxConcurrentRunsPerIp: Math.max(1, Number(asset.maxConcurrentRunsPerIp || 1) || 1),
    boundProfilesCount: boundProfileIds.length,
    activeLeasesCount: activeLeaseProfileIds.length,
    runningProfilesCount: runningProfileIds.length,
    affectedProfileIds: [...new Set([...boundProfileIds, ...activeLeaseProfileIds, ...runningProfileIds])],
  };
}
