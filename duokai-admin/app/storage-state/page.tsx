'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/api-client';
import { readAdminAuth } from '@/lib/require-admin-client';
import AppInput from '@/components/AppInput';
import AppSelect from '@/components/AppSelect';
import ErrorBanner from '@/components/ErrorBanner';
import PageSkeleton from '@/components/PageSkeleton';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import DataTable from '@/components/DataTable';
import TableToolbar from '@/components/TableToolbar';

type StorageOverviewProfile = {
  id: string;
  name: string;
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

function getProfileSyncSummary(profile: StorageOverviewProfile): 'Ready' | 'Partial' | 'Empty' {
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

export default function StorageStatePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [profiles, setProfiles] = useState<StorageOverviewProfile[]>([]);
  const [keyword, setKeyword] = useState('');
  const [syncFilter, setSyncFilter] = useState<'all' | 'synced' | 'not_synced'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

    async function loadProfiles() {
      setLoading(true);
      setError('');
      try {
        const res = await adminFetch('/api/admin/profiles');
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error || '加载登录态总览失败');
          return;
        }
        setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
      } catch {
        setError('加载登录态总览失败');
      } finally {
        setLoading(false);
      }
    }

    loadProfiles();
  }, [authChecked]);

  if (!authChecked) return null;
  if (loading && profiles.length === 0) {
    return <PageSkeleton title="加载登录态同步数据中..." />;
  }

  const filteredProfiles = profiles.filter((profile) => {
    const matchesKeyword =
      !keyword || (profile.name || '').toLowerCase().includes(keyword.toLowerCase());

    const matchesSync =
      syncFilter === 'all'
        ? true
        : syncFilter === 'synced'
          ? Boolean(profile.storageStateSynced)
          : !profile.storageStateSynced;

    return matchesKeyword && matchesSync;
  });

  const syncedCount = profiles.filter((p) => Boolean(p.storageStateSynced)).length;
  const notSyncedCount = profiles.length - syncedCount;

  return (
    <div className="space-y-6">
      <PageHeader title="登录态同步总览" description="StorageState 全局状态" />

      <ErrorBanner message={error} />

      <div className="grid gap-4 md:grid-cols-2">
        <StatCard label="已同步数" value={syncedCount} accentClassName="text-green-400" />
        <StatCard label="未同步数" value={notSyncedCount} accentClassName="text-yellow-400" />
      </div>

      <DataTable>
        <TableToolbar>
          <AppInput
            className="max-w-sm"
            placeholder="搜索环境名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <AppSelect
            className="w-40"
            value={syncFilter}
            onChange={(e) =>
              setSyncFilter(e.target.value as 'all' | 'synced' | 'not_synced')
            }
          >
            <option value="all">全部状态</option>
            <option value="synced">已同步</option>
            <option value="not_synced">未同步</option>
          </AppSelect>
        </TableToolbar>

        <table className="w-full text-sm">
          <thead className="bg-neutral-800/60 text-neutral-300">
            <tr>
              <th className="px-4 py-3 text-left">环境</th>
              <th className="px-4 py-3 text-left">登录态</th>
              <th className="px-4 py-3 text-left">同步状态</th>
              <th className="px-4 py-3 text-left">代理</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-neutral-400" colSpan={4}>
                  加载中...
                </td>
              </tr>
            ) : filteredProfiles.length ? (
              filteredProfiles.map((profile) => (
                <tr key={profile.id} className="border-t border-neutral-800">
                  <td className="px-4 py-3">{profile.name || '-'}</td>
                  <td className="px-4 py-3">
                    {profile.storageStateSynced ? '已同步' : '未同步'}
                  </td>
                  <td className="px-4 py-3">
                    {getProfileSyncSummary(profile) === 'Ready'
                      ? '已就绪'
                      : getProfileSyncSummary(profile) === 'Partial'
                      ? '部分完成'
                      : '未配置'}
                  </td>
                  <td className="px-4 py-3">
                    {(profile.proxyType || 'direct') +
                      (profile.proxyHost ? ` | ${profile.proxyHost}` : '') +
                      (profile.proxyPort ? `:${profile.proxyPort}` : '') +
                      (profile.expectedProxyIp ? ` | IP ${profile.expectedProxyIp}` : '')}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-4" colSpan={4}>
                  <EmptyState
                    title={profiles.length ? '无匹配结果' : '暂无同步数据'}
                    description={
                      profiles.length
                        ? '请调整关键词或同步状态筛选'
                        : '当前还没有可展示的登录态同步记录'
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}
