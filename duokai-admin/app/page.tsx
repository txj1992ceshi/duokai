'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/api-client';
import { readAdminAuth } from '@/lib/require-admin-client';
import AppButton from '@/components/AppButton';
import ErrorBanner from '@/components/ErrorBanner';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';

type AdminUser = {
  id: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
};

type AdminProfile = {
  id: string;
  proxyType?: string;
  proxyHost?: string;
  proxyPort?: string;
  ua?: string;
  seed?: string;
  isMobile?: boolean;
  startupPlatform?: string;
  startupUrl?: string;
  storageStateSynced?: boolean;
  workspaceSnapshotSynced?: boolean;
};

type ProfileStats = {
  totalProfiles: number;
  readyProfiles: number;
  partialProfiles: number;
  syncedStorageProfiles: number;
  storageStateBackedByFile: number;
  workspaceSnapshotBackedByFile: number;
  legacyInlinePayloadCount: number;
};

type StorageDiagnostics = {
  fileRepositoryRoot?: string;
  fileRepositoryReady?: boolean;
  fileRepositoryWritable?: boolean;
  unreadableFileRefCount?: number;
};

type IssueSummary = {
  currentIssueUserCount: number;
  currentBlockingProfileCount: number;
  currentSyncWarningProfileCount: number;
  recentIssueCount24h: number;
  recoveredCount24h: number;
};

type RuntimeStatusPayload = {
  online?: boolean;
  sessions?: Array<{ sessionId?: string }>;
};

function getProfileSyncSummary(profile: AdminProfile): 'Ready' | 'Partial' | 'Empty' {
  const hasProxy =
    profile.proxyType === 'direct' ||
    Boolean(profile.proxyHost) ||
    Boolean(profile.proxyPort);
  const hasFingerprint =
    Boolean(profile.ua) || Boolean(profile.seed) || typeof profile.isMobile === 'boolean';
  const hasEnvironment = Boolean(profile.startupPlatform) || Boolean(profile.startupUrl);

  if (hasProxy && hasFingerprint && hasEnvironment) return 'Ready';
  if (hasProxy || hasFingerprint || hasEnvironment) return 'Partial';
  return 'Empty';
}

export default function AdminHomePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusPayload>({});
  const [profileStats, setProfileStats] = useState<ProfileStats>({
    totalProfiles: 0,
    readyProfiles: 0,
    partialProfiles: 0,
    syncedStorageProfiles: 0,
    storageStateBackedByFile: 0,
    workspaceSnapshotBackedByFile: 0,
    legacyInlinePayloadCount: 0,
  });
  const [storageDiagnostics, setStorageDiagnostics] = useState<StorageDiagnostics>({});
  const [issueSummary, setIssueSummary] = useState<IssueSummary>({
    currentIssueUserCount: 0,
    currentBlockingProfileCount: 0,
    currentSyncWarningProfileCount: 0,
    recentIssueCount24h: 0,
    recoveredCount24h: 0,
  });

  const loadDashboard = useCallback(async () => {
    if (!authChecked) return;

    setLoading(true);
    setError('');
    try {
      const [usersRes, profilesRes, runtimeRes, issueSummaryRes] = await Promise.all([
        adminFetch('/api/admin/users'),
        adminFetch('/api/admin/profiles'),
        adminFetch('/api/runtime/status'),
        adminFetch('/api/admin/profiles/issues/summary'),
      ]);

      const usersData = await usersRes.json();
      const profilesData = await profilesRes.json();
      const runtimeData = await runtimeRes.json();
      const issueSummaryData = await issueSummaryRes.json();

      if (!usersRes.ok || !usersData.success) {
        throw new Error(usersData.error || '加载用户统计失败');
      }
      if (!profilesRes.ok || !profilesData.success) {
        throw new Error(profilesData.error || '加载环境统计失败');
      }
      if (!issueSummaryRes.ok || !issueSummaryData.success) {
        throw new Error(issueSummaryData.error || '加载异常摘要失败');
      }

      setUsers(Array.isArray(usersData.users) ? usersData.users : []);
      setProfiles(Array.isArray(profilesData.profiles) ? profilesData.profiles : []);
      setProfileStats({
        totalProfiles: Number(profilesData?.stats?.totalProfiles || 0),
        readyProfiles: Number(profilesData?.stats?.readyProfiles || 0),
        partialProfiles: Number(profilesData?.stats?.partialProfiles || 0),
        syncedStorageProfiles: Number(profilesData?.stats?.syncedStorageProfiles || 0),
        storageStateBackedByFile: Number(profilesData?.stats?.storageStateBackedByFile || 0),
        workspaceSnapshotBackedByFile: Number(
          profilesData?.stats?.workspaceSnapshotBackedByFile || 0
        ),
        legacyInlinePayloadCount: Number(profilesData?.stats?.legacyInlinePayloadCount || 0),
      });
      setStorageDiagnostics({
        fileRepositoryRoot: String(profilesData?.diagnostics?.fileRepositoryRoot || ''),
        fileRepositoryReady: Boolean(profilesData?.diagnostics?.fileRepositoryReady),
        fileRepositoryWritable: Boolean(profilesData?.diagnostics?.fileRepositoryWritable),
        unreadableFileRefCount: Number(profilesData?.diagnostics?.unreadableFileRefCount || 0),
      });
      setRuntimeStatus({
        online: Boolean(runtimeData?.online),
        sessions: Array.isArray(runtimeData?.sessions) ? runtimeData.sessions : [],
      });
      setIssueSummary({
        currentIssueUserCount: Number(issueSummaryData?.summary?.currentIssueUserCount || 0),
        currentBlockingProfileCount: Number(
          issueSummaryData?.summary?.currentBlockingProfileCount || 0
        ),
        currentSyncWarningProfileCount: Number(
          issueSummaryData?.summary?.currentSyncWarningProfileCount || 0
        ),
        recentIssueCount24h: Number(issueSummaryData?.summary?.recentIssueCount24h || 0),
        recoveredCount24h: Number(issueSummaryData?.summary?.recoveredCount24h || 0),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载统计失败');
    } finally {
      setLoading(false);
    }
  }, [authChecked]);

  useEffect(() => {
    const auth = readAdminAuth();
    if (!auth.ok) {
      router.replace('/login');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    loadDashboard();
  }, [authChecked, loadDashboard]);

  if (!authChecked) return null;

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === 'active').length;
  const disabledUsers = users.filter((u) => u.status === 'disabled').length;
  const adminUsers = users.filter((u) => u.role === 'admin').length;

  const totalProfiles = profileStats.totalProfiles;
  const readyProfiles = profileStats.readyProfiles;
  const syncedStorageProfiles = profileStats.syncedStorageProfiles;
  const storageStateBackedByFile = profileStats.storageStateBackedByFile;
  const workspaceSnapshotBackedByFile = profileStats.workspaceSnapshotBackedByFile;
  const legacyInlinePayloadCount = profileStats.legacyInlinePayloadCount;
  const sessionCount = runtimeStatus.sessions?.length || 0;
  const runtimeOnline = Boolean(runtimeStatus.online);

  return (
    <main className="space-y-6">
      <PageHeader
        title="Duokai Admin"
        description="独立管理中控后台"
        aside={
          <AppButton onClick={loadDashboard} variant="secondary">
            刷新总览
          </AppButton>
        }
      />

      <ErrorBanner message={error} />

      <div className="text-sm text-neutral-400">{loading ? '统计加载中...' : '综合总览'}</div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        <StatCard label="用户总数" value={totalUsers} />
        <StatCard label="启用中用户" value={activeUsers} accentClassName="text-green-400" />
        <StatCard label="禁用用户数" value={disabledUsers} accentClassName="text-yellow-400" />
        <StatCard label="管理员数" value={adminUsers} accentClassName="text-blue-400" />
        <StatCard label="环境总数" value={totalProfiles} />
        <StatCard
          label="当前异常用户数"
          value={issueSummary.currentIssueUserCount}
          accentClassName="text-orange-400"
        />
        <StatCard
          label="当前阻断环境数"
          value={issueSummary.currentBlockingProfileCount}
          accentClassName="text-red-400"
        />
        <StatCard
          label="当前同步告警环境数"
          value={issueSummary.currentSyncWarningProfileCount}
          accentClassName="text-yellow-400"
        />
        <StatCard
          label="24h 新增异常"
          value={issueSummary.recentIssueCount24h}
          accentClassName="text-orange-300"
        />
        <StatCard
          label="24h 自动恢复"
          value={issueSummary.recoveredCount24h}
          accentClassName="text-emerald-400"
        />
        <StatCard label="Ready 环境数" value={readyProfiles} accentClassName="text-green-400" />
        <StatCard
          label="已同步登录态环境数"
          value={syncedStorageProfiles}
          accentClassName="text-blue-400"
        />
        <StatCard
          label="文件化登录态数"
          value={storageStateBackedByFile}
          accentClassName="text-cyan-400"
        />
        <StatCard
          label="文件化快照数"
          value={workspaceSnapshotBackedByFile}
          accentClassName="text-indigo-400"
        />
        <StatCard
          label="历史内联残留数"
          value={legacyInlinePayloadCount}
          accentClassName="text-yellow-400"
        />
        <StatCard label="运行中 Session 数" value={sessionCount} />
        <StatCard label="Runtime 在线状态" value={runtimeOnline ? '在线' : '离线'} />
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 px-5 py-4 text-sm text-neutral-300">
        <div className="font-medium text-white">文件仓库诊断</div>
        <div className="mt-2">根目录：{storageDiagnostics.fileRepositoryRoot || '-'}</div>
        <div className="mt-1">
          状态：
          {storageDiagnostics.fileRepositoryReady && storageDiagnostics.fileRepositoryWritable
            ? ' 可用'
            : ' 不可用'}
        </div>
        <div className="mt-1">
          不可读文件引用数：{Number(storageDiagnostics.unreadableFileRefCount || 0)}
        </div>
      </div>
    </main>
  );
}
