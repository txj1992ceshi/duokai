import { Router } from 'express';
import { logAdminAction } from '../lib/audit.js';
import { connectMongo } from '../lib/mongodb.js';
import { HttpError, asyncHandler } from '../lib/http.js';
import { normalizeConfigProfilePayload, resolveUserConfigStateId } from '../lib/configProfiles.js';
import { normalizeWorkspacePayload } from '../lib/serializers.js';
import { collectStorageDiagnosticsSummary } from '../lib/storageDiagnostics.js';
import { hasLegacyInlineStorageStatePayload } from '../lib/storageView.js';
import { requireAdmin } from '../middlewares/auth.js';
import { AgentConfigStateModel } from '../models/AgentConfigState.js';
import { ConfigSyncEventModel } from '../models/ConfigSyncEvent.js';
import { ProfileStorageStateModel } from '../models/ProfileStorageState.js';
import { WorkspaceSnapshotModel } from '../models/WorkspaceSnapshot.js';
import { UserModel } from '../models/User.js';

const router = Router();

router.use(requireAdmin);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAdminConfigProfile(profile: unknown) {
  if (!profile || typeof profile !== 'object') {
    return null;
  }
  const raw = profile as Record<string, unknown>;
  const profileId = String(raw.id || '').trim();
  if (!profileId) {
    return null;
  }
  const normalized = normalizeConfigProfilePayload(profileId, raw) as Record<string, unknown>;
  const fingerprintConfig =
    normalized.fingerprintConfig && typeof normalized.fingerprintConfig === 'object'
      ? (normalized.fingerprintConfig as Record<string, unknown>)
      : {};
  const proxySettings =
    fingerprintConfig.proxySettings && typeof fingerprintConfig.proxySettings === 'object'
      ? (fingerprintConfig.proxySettings as Record<string, unknown>)
      : {};
  const basicSettings =
    fingerprintConfig.basicSettings && typeof fingerprintConfig.basicSettings === 'object'
      ? (fingerprintConfig.basicSettings as Record<string, unknown>)
      : {};
  const runtimeMetadata =
    fingerprintConfig.runtimeMetadata && typeof fingerprintConfig.runtimeMetadata === 'object'
      ? (fingerprintConfig.runtimeMetadata as Record<string, unknown>)
      : {};
  const deviceProfile =
    normalized.deviceProfile && typeof normalized.deviceProfile === 'object'
      ? (normalized.deviceProfile as Record<string, unknown>)
      : {};
  const workspace = normalizeWorkspacePayload(profileId, normalized.workspace);

  return {
    id: profileId,
    name: String(normalized.name || '').trim(),
    userId: '',
    status: String(normalized.status || 'stopped').trim() || 'stopped',
    groupId: String(normalized.groupName || '').trim(),
    proxyType: String(proxySettings.proxyType || proxySettings.proxyMode || 'direct').trim() || 'direct',
    proxyHost: String(proxySettings.host || '').trim(),
    proxyPort: String(proxySettings.port || '').trim(),
    expectedProxyIp: String(runtimeMetadata.lastResolvedIp || '').trim(),
    ua: String(fingerprintConfig.userAgent || deviceProfile.userAgent || '').trim(),
    seed: String(fingerprintConfig.language || '').trim(),
    isMobile:
      String(deviceProfile.deviceClass || '').trim() === 'mobile' ||
      String(deviceProfile.platform || '').trim().toLowerCase().includes('android') ||
      String(deviceProfile.platform || '').trim().toLowerCase().includes('ios'),
    startupPlatform: String(
      normalized.platform || basicSettings.platform || normalized.environmentPurpose || ''
    ).trim(),
    startupUrl: String(basicSettings.customPlatformUrl || '').trim(),
    storageStateSynced: false,
    ownerEmail: '',
    ownerName: '',
    createdAt: String(normalized.createdAt || '').trim(),
    updatedAt: String(normalized.updatedAt || '').trim(),
    canonicalSyncVersion: Number(raw.configSyncVersion || normalized.configSyncVersion || 0),
    lastEnvironmentSyncAt: String(runtimeMetadata.lastEnvironmentSyncAt || '').trim(),
    lastEnvironmentSyncStatus: String(runtimeMetadata.lastEnvironmentSyncStatus || '').trim(),
    lastEnvironmentSyncMessage: String(runtimeMetadata.lastEnvironmentSyncMessage || '').trim(),
    lastEnvironmentSyncVersion: Number(runtimeMetadata.lastEnvironmentSyncVersion || 0),
    lastStorageStateSyncAt: String(runtimeMetadata.lastStorageStateSyncedAt || '').trim(),
    lastStorageStateSyncStatus: String(runtimeMetadata.lastStorageStateSyncStatus || '').trim(),
    lastStorageStateSyncMessage: String(runtimeMetadata.lastStorageStateSyncMessage || '').trim(),
    lastWorkspaceSummarySyncAt: String(runtimeMetadata.lastWorkspaceSummarySyncAt || '').trim(),
    lastWorkspaceSummarySyncStatus: String(runtimeMetadata.lastWorkspaceSummarySyncStatus || '').trim(),
    lastWorkspaceSummarySyncMessage: String(runtimeMetadata.lastWorkspaceSummarySyncMessage || '').trim(),
    lastWorkspaceSnapshotSyncAt: String(runtimeMetadata.lastWorkspaceSnapshotSyncAt || '').trim(),
    lastWorkspaceSnapshotSyncStatus: String(runtimeMetadata.lastWorkspaceSnapshotSyncStatus || '').trim(),
    lastWorkspaceSnapshotSyncMessage: String(runtimeMetadata.lastWorkspaceSnapshotSyncMessage || '').trim(),
    lastValidationLevel: String(runtimeMetadata.lastValidationLevel || '').trim(),
    lastValidationMessages: Array.isArray(runtimeMetadata.lastValidationMessages)
      ? runtimeMetadata.lastValidationMessages
      : [],
    launchValidationStage: String(runtimeMetadata.launchValidationStage || '').trim(),
    lastLaunchBlock:
      raw.lastLaunchBlock && typeof raw.lastLaunchBlock === 'object' ? raw.lastLaunchBlock : null,
    workspace,
    environmentPurpose: String(normalized.environmentPurpose || '').trim(),
    notes: String(normalized.notes || '').trim(),
    tags: Array.isArray(normalized.tags) ? normalized.tags : [],
  };
}

function getSyncProfileStatus(profile: {
  proxyType?: string;
  proxyHost?: string;
  proxyPort?: string;
  ua?: string;
  seed?: string;
  isMobile?: boolean;
  startupPlatform?: string;
  startupUrl?: string;
}) {
  const hasProxy =
    profile.proxyType === 'direct' || Boolean(profile.proxyHost) || Boolean(profile.proxyPort);
  const hasFingerprint =
    Boolean(profile.ua) || Boolean(profile.seed) || typeof profile.isMobile === 'boolean';
  const hasEnvironment = Boolean(profile.startupPlatform) || Boolean(profile.startupUrl);

  if (hasProxy && hasFingerprint && hasEnvironment) return 'ready';
  if (hasProxy || hasFingerprint || hasEnvironment) return 'partial';
  return 'empty';
}

type AdminIssueCategory =
  | 'launch-block'
  | 'launch-failure'
  | 'environment-sync-warning'
  | 'storage-state-warning'
  | 'workspace-snapshot-warning'
  | 'recovery-event';

type AdminIssueSeverity = 'blocking' | 'warning' | 'info';

type AdminIssueItem = {
  id: string;
  category: AdminIssueCategory;
  severity: AdminIssueSeverity;
  reasonCode: string;
  message: string;
  occurredAt: string;
  recoveredAt: string;
  isRecovered: boolean;
  userId: string;
  profileId: string;
  profileName: string;
  ownerEmail: string;
  ownerName: string;
  deviceId: string;
};

function normalizeIssueTime(value: unknown, fallback = '') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return fallback || text;
  return new Date(timestamp).toISOString();
}

function buildIssueId(profileId: string, category: AdminIssueCategory, occurredAt: string, suffix = '') {
  return `${profileId}:${category}:${occurredAt || 'unknown'}:${suffix || 'item'}`;
}

function createIssue(input: Omit<AdminIssueItem, 'id'> & { suffix?: string }): AdminIssueItem {
  return {
    ...input,
    id: buildIssueId(input.profileId, input.category, input.occurredAt, input.suffix || input.reasonCode),
  };
}

function getIssueMessage(value: unknown, fallback: string) {
  const text = String(value || '').trim();
  return text || fallback;
}

function buildCurrentIssues(profile: Record<string, unknown>): AdminIssueItem[] {
  const issues: AdminIssueItem[] = [];
  const profileId = String(profile.id || '').trim();
  const userId = String(profile.userId || '').trim();
  const profileName = String(profile.name || '').trim();
  const ownerEmail = String(profile.ownerEmail || '').trim();
  const ownerName = String(profile.ownerName || '').trim();
  const deviceId = String(profile.lastWriterDeviceId || '').trim();
  const updatedAt = normalizeIssueTime(profile.updatedAt || profile.createdAt || '');
  const lastValidationMessages = Array.isArray(profile.lastValidationMessages)
    ? profile.lastValidationMessages.filter((item) => typeof item === 'string')
    : [];
  const launchBlock =
    profile.lastLaunchBlock && typeof profile.lastLaunchBlock === 'object'
      ? (profile.lastLaunchBlock as Record<string, unknown>)
      : null;

  if (String(profile.lastValidationLevel || '').trim() === 'block') {
    issues.push(
      createIssue({
        category: 'launch-block',
        severity: 'blocking',
        reasonCode: 'launch_validation_block',
        message: getIssueMessage(
          launchBlock?.reason || lastValidationMessages[0],
          '启动前校验命中阻断条件'
        ),
        occurredAt: updatedAt,
        recoveredAt: '',
        isRecovered: false,
        userId,
        profileId,
        profileName,
        ownerEmail,
        ownerName,
        deviceId,
      })
    );
  } else if (String(profile.status || '').trim() === 'error') {
    issues.push(
      createIssue({
        category: 'launch-failure',
        severity: 'warning',
        reasonCode: 'launch_runtime_failure',
        message: getIssueMessage(lastValidationMessages[0], '最近一次环境启动失败'),
        occurredAt: updatedAt,
        recoveredAt: '',
        isRecovered: false,
        userId,
        profileId,
        profileName,
        ownerEmail,
        ownerName,
        deviceId,
      })
    );
  }

  const environmentStatus = String(profile.lastEnvironmentSyncStatus || '').trim();
  if (environmentStatus === 'error' || environmentStatus === 'conflict') {
    issues.push(
      createIssue({
        category: 'environment-sync-warning',
        severity: 'warning',
        reasonCode: environmentStatus === 'conflict' ? 'environment_sync_conflict' : 'environment_sync_error',
        message: getIssueMessage(profile.lastEnvironmentSyncMessage, '环境同步告警'),
        occurredAt: normalizeIssueTime(profile.lastEnvironmentSyncAt, updatedAt),
        recoveredAt: '',
        isRecovered: false,
        userId,
        profileId,
        profileName,
        ownerEmail,
        ownerName,
        deviceId,
      })
    );
  }
  if (environmentStatus === 'recovery') {
    issues.push(
      createIssue({
        category: 'recovery-event',
        severity: 'info',
        reasonCode: 'environment_sync_recovery',
        message: getIssueMessage(profile.lastEnvironmentSyncMessage, '检测到上次环境同步中断，已进入恢复态'),
        occurredAt: normalizeIssueTime(profile.lastEnvironmentSyncAt, updatedAt),
        recoveredAt: '',
        isRecovered: false,
        userId,
        profileId,
        profileName,
        ownerEmail,
        ownerName,
        deviceId,
      })
    );
  }

  const storageStatus = String(profile.lastStorageStateSyncStatus || '').trim();
  if (storageStatus === 'error' || storageStatus === 'conflict') {
    issues.push(
      createIssue({
        category: 'storage-state-warning',
        severity: 'warning',
        reasonCode: storageStatus === 'conflict' ? 'storage_state_sync_conflict' : 'storage_state_sync_error',
        message: getIssueMessage(profile.lastStorageStateSyncMessage, '登录态同步告警'),
        occurredAt: normalizeIssueTime(profile.lastStorageStateSyncAt, updatedAt),
        recoveredAt: '',
        isRecovered: false,
        userId,
        profileId,
        profileName,
        ownerEmail,
        ownerName,
        deviceId,
      })
    );
  }

  const workspaceSnapshotStatus = String(profile.lastWorkspaceSnapshotSyncStatus || '').trim();
  if (workspaceSnapshotStatus === 'error') {
    issues.push(
      createIssue({
        category: 'workspace-snapshot-warning',
        severity: 'warning',
        reasonCode: 'workspace_snapshot_sync_error',
        message: getIssueMessage(profile.lastWorkspaceSnapshotSyncMessage, 'Workspace 快照同步告警'),
        occurredAt: normalizeIssueTime(profile.lastWorkspaceSnapshotSyncAt, updatedAt),
        recoveredAt: '',
        isRecovered: false,
        userId,
        profileId,
        profileName,
        ownerEmail,
        ownerName,
        deviceId,
      })
    );
  }

  const workspaceSummaryStatus = String(profile.lastWorkspaceSummarySyncStatus || '').trim();
  if (workspaceSummaryStatus === 'error') {
    issues.push(
      createIssue({
        category: 'workspace-snapshot-warning',
        severity: 'warning',
        reasonCode: 'workspace_summary_sync_error',
        message: getIssueMessage(profile.lastWorkspaceSummarySyncMessage, 'Workspace 摘要同步告警'),
        occurredAt: normalizeIssueTime(profile.lastWorkspaceSummarySyncAt, updatedAt),
        recoveredAt: '',
        isRecovered: false,
        userId,
        profileId,
        profileName,
        ownerEmail,
        ownerName,
        deviceId,
        suffix: 'workspace-summary',
      })
    );
  }

  const workspace =
    profile.workspace && typeof profile.workspace === 'object'
      ? (profile.workspace as Record<string, unknown>)
      : null;
  const recovery =
    workspace?.recovery && typeof workspace.recovery === 'object'
      ? (workspace.recovery as Record<string, unknown>)
      : null;
  const recoveryAt = normalizeIssueTime(recovery?.lastRecoveryAt || '');
  if (recoveryAt) {
    issues.push(
      createIssue({
        category: 'recovery-event',
        severity: 'info',
        reasonCode: 'workspace_recovery',
        message: getIssueMessage(recovery?.lastRecoveryReason, '环境已执行自动恢复'),
        occurredAt: recoveryAt,
        recoveredAt: recoveryAt,
        isRecovered: true,
        userId,
        profileId,
        profileName,
        ownerEmail,
        ownerName,
        deviceId,
        suffix: 'workspace-recovery',
      })
    );
  }

  return issues;
}

function buildEnvironmentSyncEventIssues(
  profile: Record<string, unknown>,
  events: Record<string, unknown>[],
): AdminIssueItem[] {
  const issues: AdminIssueItem[] = [];
  const profileId = String(profile.id || '').trim();
  const userId = String(profile.userId || '').trim();
  const profileName = String(profile.name || '').trim();
  const ownerEmail = String(profile.ownerEmail || '').trim();
  const ownerName = String(profile.ownerName || '').trim();
  const successTimes = events
    .filter((event) => String(event.status || '').trim() === 'succeeded')
    .map((event) => Date.parse(String(event.createdAt || '')))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  for (const event of events) {
    const status = String(event.status || '').trim();
    if (!status.includes('failed')) {
      continue;
    }

    const occurredAt = normalizeIssueTime(event.createdAt || profile.updatedAt || '');
    const occurredTimestamp = Date.parse(occurredAt);
    const recoveredTimestamp = successTimes.find((time) => time > occurredTimestamp);
    const recoveredAt = recoveredTimestamp ? new Date(recoveredTimestamp).toISOString() : '';

    issues.push(
      createIssue({
        category: 'environment-sync-warning',
        severity: 'warning',
        reasonCode: `environment_sync_${status.replace(/[^a-z0-9-]+/gi, '_')}`,
        message: getIssueMessage(
          event.errorMessage || event.reason,
          '环境自动同步出现告警'
        ),
        occurredAt,
        recoveredAt,
        isRecovered: Boolean(recoveredAt),
        userId,
        profileId,
        profileName,
        ownerEmail,
        ownerName,
        deviceId: String(event.deviceId || '').trim(),
        suffix: String(event._id || '').trim(),
      })
    );
  }

  return issues;
}

function buildProfileIssueTimeline(
  profile: Record<string, unknown>,
  events: Record<string, unknown>[],
) {
  const currentIssues = buildCurrentIssues(profile);
  const eventIssues = buildEnvironmentSyncEventIssues(profile, events);
  const timeline = [...currentIssues, ...eventIssues].sort((left, right) => {
    const rightTime = Date.parse(String(right.occurredAt || ''));
    const leftTime = Date.parse(String(left.occurredAt || ''));
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
  const activeIssues = timeline.filter((item) => !item.isRecovered && item.severity !== 'info');
  const recoveredIssues = timeline.filter((item) => item.isRecovered || item.severity === 'info');
  return {
    timeline,
    activeIssues,
    recoveredIssues,
  };
}

function filterIssueItems(
  items: AdminIssueItem[],
  query: {
    keyword?: string;
    severity?: string;
    category?: string;
    recovered?: string;
  },
) {
  const keyword = String(query.keyword || '').trim();
  const severity = String(query.severity || '').trim();
  const category = String(query.category || '').trim();
  const recovered = String(query.recovered || '').trim();
  const regex = keyword ? new RegExp(escapeRegExp(keyword), 'i') : null;

  return items.filter((item) => {
    if (severity && item.severity !== severity) return false;
    if (category && item.category !== category) return false;
    if (recovered === 'active' && item.isRecovered) return false;
    if (recovered === 'recovered' && !item.isRecovered) return false;
    if (regex) {
      const matched =
        regex.test(item.profileName) ||
        regex.test(item.ownerEmail) ||
        regex.test(item.ownerName) ||
        regex.test(item.message) ||
        regex.test(item.reasonCode);
      if (!matched) return false;
    }
    return true;
  });
}

function buildIssueSummary(items: AdminIssueItem[]) {
  const currentItems = items.filter((item) => !item.isRecovered && item.severity !== 'info');
  const currentUsers = new Set(currentItems.map((item) => item.userId).filter(Boolean));
  const currentBlockingProfiles = new Set(
    currentItems.filter((item) => item.severity === 'blocking').map((item) => item.profileId)
  );
  const currentSyncWarningProfiles = new Set(
    currentItems
      .filter((item) =>
        item.category === 'environment-sync-warning' ||
        item.category === 'storage-state-warning' ||
        item.category === 'workspace-snapshot-warning'
      )
      .map((item) => item.profileId)
  );
  const now = Date.now();
  const last24h = now - 24 * 60 * 60 * 1000;
  const recentIssueCount = items.filter((item) => {
    const occurredAt = Date.parse(String(item.occurredAt || ''));
    return Number.isFinite(occurredAt) && occurredAt >= last24h && item.severity !== 'info';
  }).length;
  const recoveredCount = items.filter((item) => {
    const recoveredAt = Date.parse(String(item.recoveredAt || ''));
    return Number.isFinite(recoveredAt) && recoveredAt >= last24h;
  }).length;

  return {
    currentIssueUserCount: currentUsers.size,
    currentBlockingProfileCount: currentBlockingProfiles.size,
    currentSyncWarningProfileCount: currentSyncWarningProfiles.size,
    recentIssueCount24h: recentIssueCount,
    recoveredCount24h: recoveredCount,
  };
}

async function listCanonicalAdminProfiles() {
  const [configStates, storageStates, workspaceSnapshots, users, syncEvents] = await Promise.all([
    AgentConfigStateModel.find({
      agentId: /^user:/,
    })
      .select('agentId profiles updatedAt')
      .lean(),
    ProfileStorageStateModel.find({}).select('profileId fileRef inlineStateJson stateJson').lean(),
    WorkspaceSnapshotModel.find({}).select('profileId fileRef').lean(),
    UserModel.find({}).select('_id email name status').lean(),
    ConfigSyncEventModel.find({ scope: 'environment' })
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean(),
  ]);

  const syncedProfileIds = new Set(storageStates.map((item) => String(item.profileId)));
  const workspaceSnapshotProfileIds = new Set(workspaceSnapshots.map((item) => String(item.profileId)));
  const storageStateBackedByFile = storageStates.filter((item) => String(item.fileRef || '').trim()).length;
  const storageStateLegacyInlineCount = storageStates.filter(
    (item) => hasLegacyInlineStorageStatePayload(item as Record<string, unknown>)
  ).length;
  const workspaceSnapshotBackedByFile = workspaceSnapshots.filter((item) =>
    String(item.fileRef || '').trim()
  ).length;
  const userMap = new Map(
    users.map((user) => [
      String(user._id),
      {
        ownerEmail: user.email || '',
        ownerName: user.name || '',
        status: user.status || '',
      },
    ]),
  );
  const profileEventMap = new Map<string, Record<string, unknown>[]>();
  const userEventCountMap = new Map<string, number>();
  for (const event of syncEvents) {
    const eventUserId = String(event.userId || '');
    userEventCountMap.set(eventUserId, (userEventCountMap.get(eventUserId) || 0) + 1);
    const eventProfileIds = Array.isArray(event.profileIds)
      ? event.profileIds
          .map((item: unknown) => String(item || '').trim())
          .filter(Boolean)
      : [];
    for (const profileId of eventProfileIds) {
      const existing = profileEventMap.get(profileId) || [];
      existing.push(event as unknown as Record<string, unknown>);
      profileEventMap.set(profileId, existing);
    }
  }

  const profiles: Array<Record<string, unknown>> = [];
  for (const state of configStates) {
    const agentId = String(state.agentId || '').trim();
    if (!agentId.startsWith('user:')) {
      continue;
    }
    const userId = agentId.slice('user:'.length);
    const owner = userMap.get(userId) || { ownerEmail: '', ownerName: '', status: '' };
    const stateProfiles = Array.isArray(state.profiles) ? state.profiles : [];
    for (const rawProfile of stateProfiles) {
      const normalized = normalizeAdminConfigProfile(rawProfile);
      if (!normalized) {
        continue;
      }
      const profileEvents = profileEventMap.get(String(normalized.id)) || [];
      const latestAutoPushEvent =
        profileEvents.find(
          (event) =>
            String(event.mode || '') === 'auto' &&
            String(event.direction || '') === 'push'
        ) || null;
      const latestAutoPullEvent =
        profileEvents.find(
          (event) =>
            String(event.mode || '') === 'auto' &&
            String(event.direction || '') === 'pull'
        ) || null;
      const latestErrorEvent =
        profileEvents.find((event) => String(event.status || '').includes('failed')) || null;
      const latestEvent = profileEvents[0] || null;
      profiles.push({
        ...normalized,
        userId,
        ownerEmail: owner.ownerEmail,
        ownerName: owner.ownerName,
        storageStateSynced: syncedProfileIds.has(String(normalized.id)),
        workspaceSnapshotSynced: workspaceSnapshotProfileIds.has(String(normalized.id)),
        autoSyncTaskCount: userEventCountMap.get(userId) || 0,
        lastAutoPushAt: String(latestAutoPushEvent?.createdAt || '').trim(),
        lastAutoPullAt: String(latestAutoPullEvent?.createdAt || '').trim(),
        lastAutoSyncError: String(latestErrorEvent?.errorMessage || '').trim(),
        lastWriterDeviceId: String(latestEvent?.deviceId || '').trim(),
      });
    }
  }

  profiles.sort((left, right) => {
    const rightTime = Date.parse(String(right.updatedAt || right.createdAt || ''));
    const leftTime = Date.parse(String(left.updatedAt || left.createdAt || ''));
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });

  return {
    profiles,
    users,
    profileEventMap,
    storageSummary: {
      storageStateBackedByFile,
      workspaceSnapshotBackedByFile,
      legacyInlinePayloadCount: storageStateLegacyInlineCount,
      storageStateLegacyInlineCount,
    },
  };
}

router.get(
  '/issues/summary',
  asyncHandler(async (_req, res) => {
    await connectMongo();

    const { profiles, profileEventMap } = await listCanonicalAdminProfiles();
    const issues = profiles.flatMap((profile) =>
      buildProfileIssueTimeline(
        profile,
        profileEventMap.get(String(profile.id || '')) || []
      ).timeline
    );

    res.json({
      success: true,
      summary: buildIssueSummary(issues),
    });
  })
);

router.get(
  '/issues/users',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
    const severity = typeof req.query.severity === 'string' ? req.query.severity.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const recovered = typeof req.query.recovered === 'string' ? req.query.recovered.trim() : '';

    const { profiles, profileEventMap } = await listCanonicalAdminProfiles();
    const allIssues = filterIssueItems(
      profiles.flatMap((profile) =>
        buildProfileIssueTimeline(
          profile,
          profileEventMap.get(String(profile.id || '')) || []
        ).timeline
      ),
      { keyword, severity, category, recovered }
    );

    const grouped = new Map<
      string,
      {
        userId: string;
        ownerEmail: string;
        ownerName: string;
        currentIssueProfileIds: Set<string>;
        currentIssueProfileCount: number;
        blockingCount: number;
        syncWarningCount: number;
        lastIssueAt: string;
        lastIssueSummary: string;
      }
    >();

    for (const issue of allIssues) {
      const existing = grouped.get(issue.userId) || {
        userId: issue.userId,
        ownerEmail: issue.ownerEmail,
        ownerName: issue.ownerName,
        currentIssueProfileIds: new Set<string>(),
        currentIssueProfileCount: 0,
        blockingCount: 0,
        syncWarningCount: 0,
        lastIssueAt: '',
        lastIssueSummary: '',
      };
      if (!issue.isRecovered && issue.severity !== 'info') {
        existing.currentIssueProfileIds.add(issue.profileId);
        if (issue.severity === 'blocking') existing.blockingCount += 1;
        if (
          issue.category === 'environment-sync-warning' ||
          issue.category === 'storage-state-warning' ||
          issue.category === 'workspace-snapshot-warning'
        ) {
          existing.syncWarningCount += 1;
        }
      }
      const existingTime = Date.parse(existing.lastIssueAt || '');
      const issueTime = Date.parse(issue.occurredAt || '');
      if (!existing.lastIssueAt || (Number.isFinite(issueTime) && issueTime > (Number.isFinite(existingTime) ? existingTime : 0))) {
        existing.lastIssueAt = issue.occurredAt;
        existing.lastIssueSummary = issue.message;
      }
      grouped.set(issue.userId, existing);
    }

    const items = Array.from(grouped.values())
      .map((item) => ({
        userId: item.userId,
        ownerEmail: item.ownerEmail,
        ownerName: item.ownerName,
        currentIssueProfileCount: item.currentIssueProfileIds.size,
        blockingCount: item.blockingCount,
        syncWarningCount: item.syncWarningCount,
        lastIssueAt: item.lastIssueAt,
        lastIssueSummary: item.lastIssueSummary,
      }))
      .filter((item) => item.userId)
      .sort((left, right) => {
        const rightTime = Date.parse(String(right.lastIssueAt || ''));
        const leftTime = Date.parse(String(left.lastIssueAt || ''));
        return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
      });

    res.json({
      success: true,
      users: items,
      total: items.length,
    });
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const syncFilter = typeof req.query.syncFilter === 'string' ? req.query.syncFilter.trim() : '';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)));

    const [{ profiles, users, storageSummary }, diagnostics] = await Promise.all([
      listCanonicalAdminProfiles(),
      collectStorageDiagnosticsSummary(),
    ]);
    const matchedUserIds =
      keyword.length > 0
        ? new Set(
            users
              .filter((user) => {
                const regex = new RegExp(escapeRegExp(keyword), 'i');
                return regex.test(String(user.email || '')) || regex.test(String(user.name || ''));
              })
              .map((user) => String(user._id)),
          )
        : null;
    const keywordRegex = keyword.length > 0 ? new RegExp(escapeRegExp(keyword), 'i') : null;

    const filteredProfiles = profiles.filter((profile) => {
      if (userId && String(profile.userId || '') !== userId) {
        return false;
      }

      if (keywordRegex) {
        const matchesKeyword =
          keywordRegex.test(String(profile.name || '')) ||
          keywordRegex.test(String(profile.proxyHost || '')) ||
          keywordRegex.test(String(profile.expectedProxyIp || '')) ||
          keywordRegex.test(String(profile.ownerEmail || '')) ||
          keywordRegex.test(String(profile.ownerName || '')) ||
          Boolean(matchedUserIds?.has(String(profile.userId || '')));
        if (!matchesKeyword) {
          return false;
        }
      }

      if (syncFilter === 'ready' || syncFilter === 'partial' || syncFilter === 'empty') {
        return getSyncProfileStatus(profile) === syncFilter;
      }

      return true;
    });

    const total = filteredProfiles.length;
    const pagedProfiles = filteredProfiles.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      success: true,
      profiles: pagedProfiles,
      total,
      page,
      pageSize,
      stats: {
        totalProfiles: total,
        readyProfiles: filteredProfiles.filter((profile) => getSyncProfileStatus(profile) === 'ready')
          .length,
        partialProfiles: filteredProfiles.filter((profile) => getSyncProfileStatus(profile) === 'partial')
          .length,
        syncedStorageProfiles: filteredProfiles.filter((profile) => Boolean(profile.storageStateSynced))
          .length,
        autoSyncTaskCount: filteredProfiles.reduce(
          (total, profile) => total + Number(profile.autoSyncTaskCount || 0),
          0
        ),
        storageStateBackedByFile: storageSummary.storageStateBackedByFile,
        workspaceSnapshotBackedByFile: storageSummary.workspaceSnapshotBackedByFile,
        legacyInlinePayloadCount: diagnostics.legacyInlinePayloadCount,
      },
      diagnostics,
    });
  })
);

router.get(
  '/:id/issues',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const profileId = String(req.params.id || '').trim();
    const { profiles, profileEventMap } = await listCanonicalAdminProfiles();
    const profile = profiles.find((item) => String(item.id || '') === profileId) || null;

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const issues = buildProfileIssueTimeline(
      profile,
      profileEventMap.get(profileId) || []
    );

    res.json({
      success: true,
      profileId,
      currentIssues: issues.activeIssues,
      recoveredIssues: issues.recoveredIssues,
      timeline: issues.timeline,
      summary: {
        blockingCount: issues.activeIssues.filter((item) => item.severity === 'blocking').length,
        warningCount: issues.activeIssues.filter((item) => item.severity === 'warning').length,
        recoveredCount: issues.recoveredIssues.length,
      },
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const profileId = String(req.params.id || '').trim();
    const { profiles, profileEventMap } = await listCanonicalAdminProfiles();
    const profile = profiles.find((item) => String(item.id || '') === profileId) || null;

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    res.json({
      success: true,
      profile,
      issues: buildProfileIssueTimeline(
        profile,
        profileEventMap.get(profileId) || []
      ),
    });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const profileId = String(req.params.id || '').trim();
    const nextUserId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    if (!profileId) {
      throw new HttpError(400, 'profileId is required');
    }
    if (!nextUserId) {
      throw new HttpError(400, 'userId is required');
    }

    const [configStates, targetUser, users, storageState] = await Promise.all([
      AgentConfigStateModel.find({ agentId: /^user:/ }).lean(),
      UserModel.findById(nextUserId).lean(),
      UserModel.find({}).select('_id email name').lean(),
      ProfileStorageStateModel.findOne({ profileId }).select('_id').lean(),
    ]);

    if (!targetUser) {
      throw new HttpError(404, 'Target user not found');
    }
    if (targetUser.status !== 'active') {
      throw new HttpError(400, 'Target user is disabled');
    }

    const ownerMap = new Map(
      users.map((user) => [
        String(user._id),
        {
          ownerEmail: user.email || '',
          ownerName: user.name || '',
        },
      ]),
    );

    const sourceState = configStates.find((state) =>
      Array.isArray(state.profiles) &&
      state.profiles.some(
        (item: unknown) =>
          Boolean(item) &&
          typeof item === 'object' &&
          String((item as Record<string, unknown>).id || '').trim() === profileId,
      ),
    );

    if (!sourceState) {
      throw new HttpError(404, 'Profile not found');
    }

    const sourceUserId = String(sourceState.agentId || '').replace(/^user:/, '');
    const sourceProfiles = Array.isArray(sourceState.profiles) ? sourceState.profiles : [];
    const movedProfile =
      sourceProfiles.find(
        (item: unknown) =>
          Boolean(item) &&
          typeof item === 'object' &&
          String((item as Record<string, unknown>).id || '').trim() === profileId,
      ) || null;

    if (!movedProfile) {
      throw new HttpError(404, 'Profile not found');
    }

    if (sourceUserId !== nextUserId) {
      const nextSourceProfiles = sourceProfiles.filter((item: unknown) => {
        if (!item || typeof item !== 'object') {
          return true;
        }
        return String((item as Record<string, unknown>).id || '').trim() !== profileId;
      });

      await AgentConfigStateModel.findOneAndUpdate(
        { agentId: sourceState.agentId },
        {
          $set: { profiles: nextSourceProfiles },
          $inc: { syncVersion: 1 },
        },
        { new: true },
      );

      const targetState = configStates.find(
        (state) => String(state.agentId || '') === resolveUserConfigStateId(nextUserId),
      );
      const targetProfiles = Array.isArray(targetState?.profiles) ? targetState!.profiles : [];
      const dedupedTargetProfiles = targetProfiles.filter((item: unknown) => {
        if (!item || typeof item !== 'object') {
          return true;
        }
        return String((item as Record<string, unknown>).id || '').trim() !== profileId;
      });

      await AgentConfigStateModel.findOneAndUpdate(
        { agentId: resolveUserConfigStateId(nextUserId) },
        {
          $set: { profiles: [...dedupedTargetProfiles, movedProfile] },
          ...(targetState
            ? { $inc: { syncVersion: 1 } }
            : { $setOnInsert: { syncVersion: 1, globalConfigSyncVersion: 0 } }),
        },
        { upsert: true, new: true },
      );
    }

    const normalized = normalizeAdminConfigProfile(movedProfile);
    const toOwner = ownerMap.get(String(targetUser._id)) || {
      ownerEmail: targetUser.email || '',
      ownerName: targetUser.name || '',
    };
    const fromOwner = ownerMap.get(sourceUserId) || { ownerEmail: '', ownerName: '' };

    await logAdminAction({
      adminUserId: req.authUser!.userId,
      adminEmail: req.authUser!.email,
      action: 'transfer_profile_ownership',
      targetType: 'profile',
      targetId: profileId,
      targetLabel: normalized?.name || profileId,
      detail: {
        fromUserId: sourceUserId,
        fromOwnerEmail: fromOwner.ownerEmail,
        toUserId: String(targetUser._id),
        toOwnerEmail: toOwner.ownerEmail,
      },
    });

    res.json({
      success: true,
      profile: {
        ...normalized,
        userId: String(targetUser._id),
        ownerEmail: toOwner.ownerEmail,
        ownerName: toOwner.ownerName,
        storageStateSynced: Boolean(storageState),
      },
    });
  })
);

export default router;
