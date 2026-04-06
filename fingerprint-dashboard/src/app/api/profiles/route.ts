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

function serializeProfile(profile: Record<string, any>, storageStateSynced = false) {
  return {
    id: String(profile._id),
    userId: String(profile.userId),
    name: profile.name,
    platform: profile.platform || profile.startupPlatform || '',
    purpose: profile.purpose || 'operation',
    runtimeMode: profile.runtimeMode || 'local',
    proxyBindingMode: profile.proxyBindingMode || 'dedicated',
    lifecycleState: profile.lifecycleState || 'draft',
    riskFlags: Array.isArray(profile.riskFlags) ? profile.riskFlags : [],
    cooldownSummary:
      profile.cooldownSummary && typeof profile.cooldownSummary === 'object'
        ? profile.cooldownSummary
        : { active: false, reason: '', until: '' },
    fingerprintPresetRef: profile.fingerprintPresetRef || '',
    workspaceManifestRef: profile.workspaceManifestRef || '',
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
        serializeProfile(profile as Record<string, any>, syncedProfileIds.has(String(profile._id)))
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
      runtimeMode: String(body.runtimeMode || 'local').trim() || 'local',
      proxyBindingMode: String(body.proxyBindingMode || 'dedicated').trim() || 'dedicated',
      lifecycleState: String(body.lifecycleState || 'draft').trim() || 'draft',
      riskFlags: Array.isArray(body.riskFlags) ? body.riskFlags : [],
      cooldownSummary: normalizeCooldownSummary(body.cooldownSummary),
      fingerprintPresetRef: String(body.fingerprintPresetRef || '').trim(),
      workspaceManifestRef: String(body.workspaceManifestRef || '').trim(),
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
      profile: serializeProfile(profile as Record<string, any>),
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
