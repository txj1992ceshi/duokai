'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '@/lib/api-client';
import { readAdminAuth } from '@/lib/require-admin-client';
import AppInput from '@/components/AppInput';
import AppSelect from '@/components/AppSelect';
import ErrorBanner from '@/components/ErrorBanner';
import PageSkeleton from '@/components/PageSkeleton';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import FilterBar from '@/components/FilterBar';
import DataTable from '@/components/DataTable';
import TablePagination from '@/components/TablePagination';

type AdminProfile = {
  id: string;
  userId?: string;
  ownerEmail?: string;
  ownerName?: string;
  name: string;
  status: string;
  proxyType?: string;
  proxyHost?: string;
  proxyPort?: string;
  expectedProxyIp?: string;
  ua?: string;
  seed?: string;
  isMobile?: boolean;
  startupPlatform?: string;
  startupUrl?: string;
  storageStateSynced?: boolean;
};

type AdminUser = {
  id: string;
  email: string;
  name?: string;
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

export default function ProfilesPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [keyword, setKeyword] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('all');
  const [syncFilter, setSyncFilter] = useState<'all' | 'ready' | 'partial' | 'empty'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalProfilesCount, setTotalProfilesCount] = useState(0);
  const [stats, setStats] = useState({
    totalProfiles: 0,
    readyProfiles: 0,
    partialProfiles: 0,
    syncedStorageProfiles: 0,
  });

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

    async function loadUsers() {
      try {
        const res = await adminFetch('/api/admin/users');
        const data = await res.json();

        if (!res.ok || !data.success) {
          setUsers([]);
          return;
        }

        setUsers(Array.isArray(data.users) ? data.users : []);
      } catch {
        setUsers([]);
      }
    }

    async function loadProfiles() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          pageSize: String(pageSize),
        });
        if (keyword.trim()) params.set('keyword', keyword.trim());
        if (ownerUserId !== 'all') params.set('userId', ownerUserId);
        if (syncFilter !== 'all') params.set('syncFilter', syncFilter);

        const res = await adminFetch(`/api/admin/profiles?${params.toString()}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error || '加载环境失败');
          return;
        }

        setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
        setTotalProfilesCount(typeof data.total === 'number' ? data.total : 0);
        setStats({
          totalProfiles: Number(data?.stats?.totalProfiles || 0),
          readyProfiles: Number(data?.stats?.readyProfiles || 0),
          partialProfiles: Number(data?.stats?.partialProfiles || 0),
          syncedStorageProfiles: Number(data?.stats?.syncedStorageProfiles || 0),
        });
      } catch {
        setError('加载环境失败');
      } finally {
        setLoading(false);
      }
    }

    void loadUsers();
    loadProfiles();
  }, [authChecked, currentPage, keyword, ownerUserId, syncFilter]);

  const totalPages = Math.max(1, Math.ceil(totalProfilesCount / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword, ownerUserId, syncFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  if (!authChecked) return null;
  if (loading && profiles.length === 0) {
    return <PageSkeleton title="加载环境数据中..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="环境总览" description="Profile 全局看板" />

      <ErrorBanner message={error} />

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="text-sm text-neutral-400">总环境数</div>
          <div className="mt-2 text-2xl font-semibold">{stats.totalProfiles}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="text-sm text-neutral-400">Ready 数</div>
          <div className="mt-2 text-2xl font-semibold text-green-400">{stats.readyProfiles}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="text-sm text-neutral-400">Partial 数</div>
          <div className="mt-2 text-2xl font-semibold text-yellow-400">{stats.partialProfiles}</div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="text-sm text-neutral-400">已同步登录态数</div>
          <div className="mt-2 text-2xl font-semibold text-blue-400">{stats.syncedStorageProfiles}</div>
        </div>
      </div>

      <DataTable>
        <FilterBar>
          <AppInput
            className="max-w-sm"
            placeholder="搜索环境名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <AppSelect
            className="w-52"
            value={ownerUserId}
            onChange={(e) => setOwnerUserId(e.target.value)}
          >
            <option value="all">全部归属用户</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name || user.email}
              </option>
            ))}
          </AppSelect>
          <AppSelect
            className="w-44"
            value={syncFilter}
            onChange={(e) => setSyncFilter(e.target.value as 'all' | 'ready' | 'partial' | 'empty')}
          >
            <option value="all">全部同步状态</option>
            <option value="ready">已就绪</option>
            <option value="partial">部分完成</option>
            <option value="empty">未配置</option>
          </AppSelect>
        </FilterBar>

        <table className="w-full text-sm">
          <thead className="bg-neutral-800/60 text-neutral-300">
            <tr>
              <th className="px-4 py-3 text-left">名称</th>
              <th className="px-4 py-3 text-left">归属用户</th>
              <th className="px-4 py-3 text-left">状态</th>
              <th className="px-4 py-3 text-left">同步状态</th>
              <th className="px-4 py-3 text-left">登录态</th>
              <th className="px-4 py-3 text-left">代理</th>
              <th className="px-4 py-3 text-left">指纹</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-neutral-400" colSpan={7}>
                  加载中...
                </td>
              </tr>
            ) : profiles.length ? (
              profiles.map((profile) => (
                <tr key={profile.id} className="border-t border-neutral-800 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/profiles/${profile.id}`} className="text-white hover:underline">
                      {profile.name || '-'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {profile.ownerName || profile.ownerEmail || profile.userId || '-'}
                  </td>
                  <td className="px-4 py-3">{profile.status || '-'}</td>
                  <td className="px-4 py-3">
                    {getProfileSyncSummary(profile) === 'Ready'
                      ? '已就绪'
                      : getProfileSyncSummary(profile) === 'Partial'
                      ? '部分完成'
                      : '未配置'}
                  </td>
                  <td className="px-4 py-3">{profile.storageStateSynced ? '已同步' : '未同步'}</td>
                  <td className="px-4 py-3">
                    {(profile.proxyType || 'direct') +
                      (profile.proxyHost ? ` | ${profile.proxyHost}` : '') +
                      (profile.proxyPort ? `:${profile.proxyPort}` : '') +
                      (profile.expectedProxyIp ? ` | IP ${profile.expectedProxyIp}` : '')}
                  </td>
                  <td className="px-4 py-3">
                    {'UA ' +
                      (profile.ua ? '已设置' : '默认') +
                      (profile.seed ? ` | Seed ${profile.seed}` : '') +
                      (typeof profile.isMobile === 'boolean'
                        ? ` | ${profile.isMobile ? '移动端' : '桌面端'}`
                        : '')}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-4" colSpan={7}>
                  <EmptyState
                    title={totalProfilesCount ? '无匹配环境' : '暂无环境'}
                    description={
                      totalProfilesCount
                        ? '请调整搜索关键词或同步状态筛选'
                        : '当前还没有可展示的环境配置'
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
          onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
        />
      </DataTable>
    </div>
  );
}
