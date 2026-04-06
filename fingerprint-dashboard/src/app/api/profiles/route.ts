import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { ProfileModel } from '@/models/Profile';
import { ProfileStorageStateModel } from '@/models/ProfileStorageState';

function normalizeCooldownSummary(input: unknown) {
  if (!input || typeof input !== 'object') {
    return { active: false, reason: '', until: '' };
  }
  const source = input as Record<string, unknown>;
  return {
    active: !!source.active,
    reason: String(source.reason || '').trim(),
    until: String(source.until || '').trim(),
  };
}

function resolveDefaultIpUsageMode(purpose: unknown) {
  return String(purpose || '').trim() === 'register' ? 'dedicated' : 'shared';
}

function normalizeRuntimeMode(input: unknown) {
  const normalized = String(input || '').trim();
  if (normalized === 'strong-local' || normalized === 'vm' || normalized === 'container') {
    return normalized;
  }
  return 'local';
}

function serializeProfile(profile: Record<string, unknown>, storageStateSynced = false) {
  return {
    id: String(profile._id),
    userId: String(profile.userId),
    name: profile.name,
    platform: profile.platform || profile.startupPlatform || '',
    purpose: profile.purpose || 'operation',
    runtimeMode: normalizeRuntimeMode(profile.runtimeMode),
    proxyBindingMode: profile.proxyBindingMode || 'dedicated',
    ipUsageMode: profile.ipUsageMode || resolveDefaultIpUsageMode(profile.purpose || 'operation'),
    lifecycleState: profile.lifecycleState || 'draft',
    riskFlags: Array.isArray(profile.riskFlags) ? profile.riskFlags : [],
    cooldownSummary:
      profile.cooldownSummary && typeof profile.cooldownSummary === 'object'
        ? profile.cooldownSummary
        : { active: false, reason: '', until: '' },
    fingerprintPresetRef: profile.fingerprintPresetRef || '',
    workspaceManifestRef: profile.workspaceManifestRef || '',
    proxyAssetId: profile.proxyAssetId || '',
    activeLeaseId: profile.activeLeaseId || '',
    ownerLabel: profile.ownerLabel || '',
    status: profile.status,
    lastActive: profile.lastActive || '',
    lastLaunchAt: profile.lastLaunchAt || '',
    lastSuccessAt: profile.lastSuccessAt || '',
    lastRestoreAt: profile.lastRestoreAt || '',
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
    workspace: profile.workspace || null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export async function GET(req: NextRequest) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const profiles = await ProfileModel.find({
      userId: authUser.userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    const storageStates = await ProfileStorageStateModel.find({
      userId: authUser.userId,
    })
      .select('profileId')
      .lean();
    const syncedProfileIds = new Set(
      storageStates.map((state) => String(state.profileId))
    );

    return NextResponse.json({
        success: true,
      profiles: profiles.map((profile) =>
        serializeProfile(profile as Record<string, unknown>, syncedProfileIds.has(String(profile._id)))
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to fetch profiles',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const body = await req.json();

    const profile = await ProfileModel.create({
      userId: authUser.userId,
      name: String(body.name || 'New Profile').trim(),
      platform: String(body.platform || body.startupPlatform || '').trim(),
      purpose: String(body.purpose || 'operation').trim() || 'operation',
      runtimeMode: normalizeRuntimeMode(body.runtimeMode),
      proxyBindingMode: String(body.proxyBindingMode || 'dedicated').trim() || 'dedicated',
      ipUsageMode:
        String(body.ipUsageMode || resolveDefaultIpUsageMode(body.purpose || 'operation')).trim() ||
        'dedicated',
      lifecycleState: String(body.lifecycleState || 'draft').trim() || 'draft',
      riskFlags: Array.isArray(body.riskFlags) ? body.riskFlags : [],
      cooldownSummary: normalizeCooldownSummary(body.cooldownSummary),
      fingerprintPresetRef: String(body.fingerprintPresetRef || '').trim(),
      workspaceManifestRef: String(body.workspaceManifestRef || '').trim(),
      proxyAssetId: String(body.proxyAssetId || '').trim(),
      activeLeaseId: String(body.activeLeaseId || '').trim(),
      ownerLabel: String(body.ownerLabel || '').trim(),
      status: body.status || 'Ready',
      lastActive: body.lastActive || '',
      lastLaunchAt: String(body.lastLaunchAt || '').trim(),
      lastSuccessAt: String(body.lastSuccessAt || '').trim(),
      lastRestoreAt: String(body.lastRestoreAt || '').trim(),
      tags: Array.isArray(body.tags) ? body.tags : [],

      proxy: body.proxy || '',
      proxyType: body.proxyType || 'direct',
      proxyHost: body.proxyHost || '',
      proxyPort: body.proxyPort || '',
      proxyUsername: body.proxyUsername || '',
      proxyPassword: body.proxyPassword || '',

      expectedProxyIp: body.expectedProxyIp || '',
      expectedProxyCountry: body.expectedProxyCountry || '',
      expectedProxyRegion: body.expectedProxyRegion || '',

      preferredProxyTransport: body.preferredProxyTransport || '',
      lastResolvedProxyTransport: body.lastResolvedProxyTransport || '',
      lastHostEnvironment: body.lastHostEnvironment || '',

      ua: body.ua || '',
      seed: body.seed || '',
      isMobile: !!body.isMobile,

      groupId: body.groupId || '',
      runtimeSessionId: body.runtimeSessionId || '',

      startupPlatform: body.startupPlatform || '',
      startupUrl: body.startupUrl || '',
      startupNavigation: body.startupNavigation || {
        ok: false,
        requestedUrl: '',
        finalUrl: '',
        error: '',
      },

      proxyVerification: body.proxyVerification || null,
      workspace: body.workspace || null,
    });

    return NextResponse.json({
      success: true,
      profile: serializeProfile(profile as Record<string, unknown>),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to create profile',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}
