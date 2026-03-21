import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { ProfileModel } from '@/models/Profile';
import { ProfileStorageStateModel } from '@/models/ProfileStorageState';

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
      profiles: profiles.map((profile) => ({
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
        storageStateSynced: syncedProfileIds.has(String(profile._id)),
        proxyVerification: profile.proxyVerification || null,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      })),
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
      status: body.status || 'Ready',
      lastActive: body.lastActive || '',
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
    });

    return NextResponse.json({
      success: true,
      profile: {
        id: String(profile._id),
        userId: String(profile.userId),
        name: profile.name,
        status: profile.status,
        lastActive: profile.lastActive,
        tags: profile.tags,
        proxy: profile.proxy,
        proxyType: profile.proxyType,
        proxyHost: profile.proxyHost,
        proxyPort: profile.proxyPort,
        proxyUsername: profile.proxyUsername,
        proxyPassword: profile.proxyPassword,
        expectedProxyIp: profile.expectedProxyIp,
        expectedProxyCountry: profile.expectedProxyCountry,
        expectedProxyRegion: profile.expectedProxyRegion,
        preferredProxyTransport: profile.preferredProxyTransport,
        lastResolvedProxyTransport: profile.lastResolvedProxyTransport,
        lastHostEnvironment: profile.lastHostEnvironment,
        ua: profile.ua,
        seed: profile.seed,
        isMobile: profile.isMobile,
        groupId: profile.groupId,
        runtimeSessionId: profile.runtimeSessionId,
        startupPlatform: profile.startupPlatform,
        startupUrl: profile.startupUrl,
        startupNavigation: profile.startupNavigation,
        proxyVerification: profile.proxyVerification,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
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
