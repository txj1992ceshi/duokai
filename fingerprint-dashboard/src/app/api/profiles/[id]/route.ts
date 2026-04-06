import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { ProfileModel } from '@/models/Profile';

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

function serializeProfile(profile: Record<string, any>) {
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
    proxyVerification: profile.proxyVerification || null,
    workspace: profile.workspace || null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const { id } = await context.params;

    const profile = await ProfileModel.findOne({
      _id: id,
      userId: authUser.userId,
    }).lean();

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: serializeProfile(profile as Record<string, any>),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to fetch profile',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const { id } = await context.params;
    const body = await req.json();

    const updateData: Record<string, unknown> = {};

    if (typeof body.name === 'string') updateData.name = body.name.trim();
    if (typeof body.platform === 'string') updateData.platform = body.platform.trim();
    if (typeof body.purpose === 'string') updateData.purpose = body.purpose.trim();
    if (typeof body.runtimeMode === 'string') updateData.runtimeMode = body.runtimeMode.trim();
    if (typeof body.proxyBindingMode === 'string') updateData.proxyBindingMode = body.proxyBindingMode.trim();
    if (typeof body.lifecycleState === 'string') updateData.lifecycleState = body.lifecycleState.trim();
    if (Array.isArray(body.riskFlags)) updateData.riskFlags = body.riskFlags;
    if (body.cooldownSummary !== undefined) updateData.cooldownSummary = normalizeCooldownSummary(body.cooldownSummary);
    if (typeof body.fingerprintPresetRef === 'string') updateData.fingerprintPresetRef = body.fingerprintPresetRef.trim();
    if (typeof body.workspaceManifestRef === 'string') updateData.workspaceManifestRef = body.workspaceManifestRef.trim();
    if (typeof body.ownerLabel === 'string') updateData.ownerLabel = body.ownerLabel.trim();
    if (typeof body.status === 'string') updateData.status = body.status;
    if (Array.isArray(body.tags)) updateData.tags = body.tags;

    if (typeof body.lastActive === 'string') updateData.lastActive = body.lastActive;
    if (typeof body.lastLaunchAt === 'string') updateData.lastLaunchAt = body.lastLaunchAt;
    if (typeof body.lastSuccessAt === 'string') updateData.lastSuccessAt = body.lastSuccessAt;
    if (typeof body.lastRestoreAt === 'string') updateData.lastRestoreAt = body.lastRestoreAt;

    if (typeof body.proxy === 'string') updateData.proxy = body.proxy;
    if (typeof body.proxyType === 'string') updateData.proxyType = body.proxyType;
    if (typeof body.proxyHost === 'string') updateData.proxyHost = body.proxyHost;
    if (typeof body.proxyPort === 'string') updateData.proxyPort = body.proxyPort;
    if (typeof body.proxyUsername === 'string') updateData.proxyUsername = body.proxyUsername;
    if (typeof body.proxyPassword === 'string') updateData.proxyPassword = body.proxyPassword;

    if (typeof body.expectedProxyIp === 'string') updateData.expectedProxyIp = body.expectedProxyIp;
    if (typeof body.expectedProxyCountry === 'string') updateData.expectedProxyCountry = body.expectedProxyCountry;
    if (typeof body.expectedProxyRegion === 'string') updateData.expectedProxyRegion = body.expectedProxyRegion;

    if (typeof body.preferredProxyTransport === 'string') {
      updateData.preferredProxyTransport = body.preferredProxyTransport;
    }
    if (typeof body.lastResolvedProxyTransport === 'string') {
      updateData.lastResolvedProxyTransport = body.lastResolvedProxyTransport;
    }
    if (typeof body.lastHostEnvironment === 'string') {
      updateData.lastHostEnvironment = body.lastHostEnvironment;
    }

    if (typeof body.ua === 'string') updateData.ua = body.ua;
    if (typeof body.seed === 'string') updateData.seed = body.seed;
    if (typeof body.isMobile === 'boolean') updateData.isMobile = body.isMobile;

    if (typeof body.groupId === 'string') updateData.groupId = body.groupId;
    if (typeof body.runtimeSessionId === 'string') updateData.runtimeSessionId = body.runtimeSessionId;

    if (typeof body.startupPlatform === 'string') updateData.startupPlatform = body.startupPlatform;
    if (typeof body.startupUrl === 'string') updateData.startupUrl = body.startupUrl;

    if (body.startupNavigation && typeof body.startupNavigation === 'object') {
      updateData.startupNavigation = body.startupNavigation;
    }

    if (body.proxyVerification !== undefined) {
      updateData.proxyVerification = body.proxyVerification;
    }
    if (body.workspace !== undefined) {
      updateData.workspace = body.workspace;
    }

    const profile = await ProfileModel.findOneAndUpdate(
      {
        _id: id,
        userId: authUser.userId,
      },
      updateData,
      {
        new: true,
      }
    ).lean();

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: serializeProfile(profile as Record<string, any>),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to update profile',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const { id } = await context.params;

    const profile = await ProfileModel.findOneAndDelete({
      _id: id,
      userId: authUser.userId,
    }).lean();

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Profile deleted successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to delete profile',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}
