import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { SettingModel } from '@/models/Setting';

const DEFAULT_SETTINGS = {
  autoFingerprint: true,
  autoProxyVerification: true,
  defaultStartupPlatform: '',
  defaultStartupUrl: '',
  theme: 'system',
};

export async function GET(req: NextRequest) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const settings = await SettingModel.findOne({
      userId: authUser.userId,
    }).lean();

    return NextResponse.json({
      success: true,
      settings: settings
        ? {
            id: String(settings._id),
            userId: String(settings.userId),
            autoFingerprint: settings.autoFingerprint,
            autoProxyVerification: settings.autoProxyVerification,
            defaultStartupPlatform: settings.defaultStartupPlatform || '',
            defaultStartupUrl: settings.defaultStartupUrl || '',
            theme: settings.theme || 'system',
            createdAt: settings.createdAt,
            updatedAt: settings.updatedAt,
          }
        : DEFAULT_SETTINGS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to fetch settings',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const body = await req.json();

    const settings = await SettingModel.findOneAndUpdate(
      { userId: authUser.userId },
      {
        userId: authUser.userId,
        autoFingerprint:
          typeof body.autoFingerprint === 'boolean'
            ? body.autoFingerprint
            : DEFAULT_SETTINGS.autoFingerprint,
        autoProxyVerification:
          typeof body.autoProxyVerification === 'boolean'
            ? body.autoProxyVerification
            : DEFAULT_SETTINGS.autoProxyVerification,
        defaultStartupPlatform: String(body.defaultStartupPlatform || ''),
        defaultStartupUrl: String(body.defaultStartupUrl || ''),
        theme: String(body.theme || 'system'),
      },
      {
        upsert: true,
        new: true,
      }
    ).lean();

    return NextResponse.json({
      success: true,
      settings: {
        id: String(settings!._id),
        userId: String(settings!.userId),
        autoFingerprint: settings!.autoFingerprint,
        autoProxyVerification: settings!.autoProxyVerification,
        defaultStartupPlatform: settings!.defaultStartupPlatform || '',
        defaultStartupUrl: settings!.defaultStartupUrl || '',
        theme: settings!.theme || 'system',
        createdAt: settings!.createdAt,
        updatedAt: settings!.updatedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error: message === 'Unauthorized' ? 'Unauthorized' : 'Failed to save settings',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}
