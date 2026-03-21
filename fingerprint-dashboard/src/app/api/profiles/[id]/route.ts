import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { ProfileModel } from '@/models/Profile';

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
      profile: {
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
        proxyVerification: profile.proxyVerification || null,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
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
    if (typeof body.status === 'string') updateData.status = body.status;
    if (Array.isArray(body.tags)) updateData.tags = body.tags;

    if (typeof body.lastActive === 'string') updateData.lastActive = body.lastActive;

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
      profile: {
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
        proxyVerification: profile.proxyVerification || null,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
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
