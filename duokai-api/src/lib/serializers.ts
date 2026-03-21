export function serializeUser(user: any) {
  return {
    id: String(user._id),
    email: user.email || '',
    username: user.username || '',
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function serializeProfile(profile: any, storageStateSynced = false) {
  return {
    id: String(profile._id),
    userId: String(profile.userId),
    name: profile.name,
    status: profile.status,
    lastActive: profile.lastActive || '',
    tags: profile.tags || [],
    proxy: profile.proxy || '',
    proxyType: profile.proxyType || 'direct',
    proxyHost: profile.proxyHost || '',
    proxyPort: profile.proxyPort || '',
    proxyUsername: profile.proxyUsername || '',
    proxyPassword: profile.proxyPassword || '',
    expectedProxyIp: profile.expectedProxyIp || '',
    expectedProxyCountry: profile.expectedProxyCountry || '',
    expectedProxyRegion: profile.expectedProxyRegion || '',
    preferredProxyTransport: profile.preferredProxyTransport || '',
    lastResolvedProxyTransport: profile.lastResolvedProxyTransport || '',
    lastHostEnvironment: profile.lastHostEnvironment || '',
    ua: profile.ua || '',
    seed: profile.seed || '',
    isMobile: !!profile.isMobile,
    groupId: profile.groupId || '',
    runtimeSessionId: profile.runtimeSessionId || '',
    startupPlatform: profile.startupPlatform || '',
    startupUrl: profile.startupUrl || '',
    startupNavigation: profile.startupNavigation || {
      ok: false,
      requestedUrl: '',
      finalUrl: '',
      error: '',
    },
    storageStateSynced,
    proxyVerification: profile.proxyVerification || null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function serializeGroup(group: any) {
  return {
    id: String(group._id),
    userId: String(group.userId),
    name: group.name,
    color: group.color || '',
    notes: group.notes || '',
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

export function serializeBehavior(behavior: any) {
  return {
    id: String(behavior._id),
    userId: String(behavior.userId),
    name: behavior.name,
    description: behavior.description || '',
    enabled: !!behavior.enabled,
    actions: Array.isArray(behavior.actions) ? behavior.actions : [],
    createdAt: behavior.createdAt,
    updatedAt: behavior.updatedAt,
  };
}

export function serializeSetting(settings: any) {
  return {
    id: String(settings._id),
    userId: String(settings.userId),
    autoFingerprint: settings.autoFingerprint,
    autoProxyVerification: settings.autoProxyVerification,
    defaultStartupPlatform: settings.defaultStartupPlatform || '',
    defaultStartupUrl: settings.defaultStartupUrl || '',
    theme: settings.theme || 'system',
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}
