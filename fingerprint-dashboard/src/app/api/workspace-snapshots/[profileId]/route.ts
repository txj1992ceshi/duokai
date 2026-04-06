import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { resolveWorkspaceSnapshotArtifact } from '@/lib/storageArtifacts';
import { ProfileModel } from '@/models/Profile';
import { WorkspaceSnapshotModel } from '@/models/WorkspaceSnapshot';

type RouteContext = {
  params: Promise<{ profileId: string }>;
};

function shouldIncludeArtifactContent(input: string | null) {
  const normalized = String(input || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'full';
}

async function serializeWorkspaceSnapshot(
  snapshot: Record<string, unknown> | null,
  includeContent = false
) {
  if (!snapshot) {
    return null;
  }

  const artifactPayload = includeContent
    ? await resolveWorkspaceSnapshotArtifact(String(snapshot.fileRef || ''))
    : null;

  return {
    snapshotId: String(snapshot.snapshotId || ''),
    profileId: String(snapshot.profileId || ''),
    templateRevision: String(snapshot.templateRevision || ''),
    templateFingerprintHash: String(snapshot.templateFingerprintHash || ''),
    manifest:
      (artifactPayload?.manifest && typeof artifactPayload.manifest === 'object'
        ? artifactPayload.manifest
        : snapshot.manifest) || {},
    workspaceManifestRef: String(snapshot.workspaceManifestRef || ''),
    storageStateRef: String(snapshot.storageStateRef || ''),
    workspaceMetadata:
      (artifactPayload?.workspaceMetadata && typeof artifactPayload.workspaceMetadata === 'object'
        ? artifactPayload.workspaceMetadata
        : snapshot.workspaceMetadata) || {},
    storageState:
      (artifactPayload?.storageState && typeof artifactPayload.storageState === 'object'
        ? artifactPayload.storageState
        : snapshot.storageState) || {},
    directoryManifest: Array.isArray(artifactPayload?.directoryManifest)
      ? artifactPayload.directoryManifest
      : Array.isArray(snapshot.directoryManifest)
        ? snapshot.directoryManifest
        : [],
    healthSummary:
      (artifactPayload?.healthSummary && typeof artifactPayload.healthSummary === 'object'
        ? artifactPayload.healthSummary
        : snapshot.healthSummary) || {},
    consistencySummary:
      (artifactPayload?.consistencySummary && typeof artifactPayload.consistencySummary === 'object'
        ? artifactPayload.consistencySummary
        : snapshot.consistencySummary) || {},
    validatedStartAt: String(snapshot.validatedStartAt || ''),
    fileRef: String(snapshot.fileRef || ''),
    checksum: String(snapshot.checksum || ''),
    size: Number(snapshot.size || 0),
    contentType: String(snapshot.contentType || 'application/json'),
    retentionPolicy: String(snapshot.retentionPolicy || 'recent-n'),
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const authUser = requireUser(req);
    await connectMongo();
    const includeContent = shouldIncludeArtifactContent(req.nextUrl.searchParams.get('includeContent'));

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

    const snapshots = await WorkspaceSnapshotModel.find({
      userId: authUser.userId,
      profileId,
    })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      snapshots: await Promise.all(
        snapshots.map((snapshot) =>
          serializeWorkspaceSnapshot(snapshot as Record<string, unknown>, includeContent)
        )
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error:
          message === 'Unauthorized'
            ? 'Unauthorized'
            : 'Failed to fetch workspace snapshots',
      },
      {
        status: message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
}
