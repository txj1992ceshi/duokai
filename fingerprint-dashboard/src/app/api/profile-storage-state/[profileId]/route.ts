import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { resolveStorageStateJson, writeJsonArtifact } from '@/lib/storageArtifacts';
import { ProfileModel } from '@/models/Profile';
import { ProfileStorageStateModel } from '@/models/ProfileStorageState';

type RouteContext = {
  params: Promise<{ profileId: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const { profileId } = await context.params;

    const profile = await ProfileModel.findOne({
      _id: profileId,
      userId: authUser.userId,
    }).lean();

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    const storageState = await ProfileStorageStateModel.findOne({
      userId: authUser.userId,
      profileId,
    }).lean();

    const stateJson = await resolveStorageStateJson({
      inlineStateJson: storageState?.inlineStateJson,
      stateJson: storageState?.stateJson,
      fileRef: storageState?.fileRef || '',
    });

    return NextResponse.json({
      success: true,
      storageState: storageState
        ? {
            id: String(storageState._id),
            userId: String(storageState.userId),
            profileId: String(storageState.profileId),
            stateJson,
            inlineStateJson: stateJson,
            fileRef: storageState.fileRef || '',
            checksum: storageState.checksum || '',
            size: storageState.size || 0,
            contentType: storageState.contentType || 'application/json',
            retentionPolicy: storageState.retentionPolicy || 'latest-only',
            version: storageState.version,
            encrypted: storageState.encrypted,
            createdAt: storageState.createdAt,
            updatedAt: storageState.updatedAt,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error:
          message === 'Unauthorized'
            ? 'Unauthorized'
            : 'Failed to fetch storage state',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const authUser = requireUser(req);
    await connectMongo();

    const { profileId } = await context.params;
    const body = await req.json();

    const profile = await ProfileModel.findOne({
      _id: profileId,
      userId: authUser.userId,
    }).lean();

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    const inlineStateJson =
      body.inlineStateJson !== undefined ? body.inlineStateJson : body.stateJson;

    if (inlineStateJson === undefined) {
      return NextResponse.json(
        { success: false, error: 'stateJson is required' },
        { status: 400 }
      );
    }

    const existing = await ProfileStorageStateModel.findOne({
      userId: authUser.userId,
      profileId,
    }).lean();

    const nextVersion = existing ? (existing.version || 1) + 1 : 1;
    const artifact = await writeJsonArtifact({
      kind: 'storage-state-backup',
      ownerId: String(authUser.userId),
      objectId: `${profileId}/v${nextVersion}`,
      retentionPolicy: 'latest-only',
      payload: {
        profileId,
        version: nextVersion,
        stateJson: inlineStateJson,
      },
    });

    const storageState = await ProfileStorageStateModel.findOneAndUpdate(
      {
        userId: authUser.userId,
        profileId,
      },
      {
        userId: authUser.userId,
        profileId,
        stateJson: null,
        inlineStateJson: null,
        fileRef: artifact.fileRef,
        checksum: artifact.checksum,
        size: artifact.size,
        contentType: artifact.contentType,
        retentionPolicy: artifact.retentionPolicy,
        encrypted: !!body.encrypted,
        version: nextVersion,
      },
      {
        upsert: true,
        new: true,
      }
    ).lean();

    return NextResponse.json({
      success: true,
      storageState: {
        id: String(storageState!._id),
        userId: String(storageState!.userId),
        profileId: String(storageState!.profileId),
        version: storageState!.version,
        fileRef: storageState!.fileRef || '',
        checksum: storageState!.checksum || '',
        size: storageState!.size || 0,
        contentType: storageState!.contentType || 'application/json',
        retentionPolicy: storageState!.retentionPolicy || 'latest-only',
        updatedAt: storageState!.updatedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error:
          message === 'Unauthorized'
            ? 'Unauthorized'
            : 'Failed to save storage state',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}
