'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/api-client';
import { readAdminAuth } from '@/lib/require-admin-client';
import AppInput from '@/components/AppInput';
import AppSelect from '@/components/AppSelect';
import DataTable from '@/components/DataTable';
import EmptyState from '@/components/EmptyState';
import ErrorBanner from '@/components/ErrorBanner';
import FilterBar from '@/components/FilterBar';
import PageHeader from '@/components/PageHeader';
import PageSkeleton from '@/components/PageSkeleton';
import StatCard from '@/components/StatCard';

type IssueUserRow = {
  userId: string;
  ownerEmail: string;
  ownerName: string;
  currentIssueProfileCount: number;
  blockingCount: number;
  syncWarningCount: number;
  lastIssueAt: string;
  lastIssueSummary: string;
};

type IssueSummary = {
  currentIssueUserCount: number;
  currentBlockingProfileCount: number;
  currentSyncWarningProfileCount: number;
  recentIssueCount24h: number;
  recoveredCount24h: number;
};

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function IssuesPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [severity, setSeverity] = useState('all');
  const [category, setCategory] = useState('all');
  const [recovered, setRecovered] = useState('active');
  const [summary, setSummary] = useState<IssueSummary>({
    currentIssueUserCount: 0,
    currentBlockingProfileCount: 0,
    currentSyncWarningProfileCount: 0,
    recentIssueCount24h: 0,
    recoveredCount24h: 0,
  });
  const [users, setUsers] = useState<IssueUserRow[]>([]);

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

    async function loadIssues() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (keyword.trim()) params.set('keyword', keyword.trim());
        if (severity !== 'all') params.set('severity', severity);
        if (category !== 'all') params.set('category', category);
        if (recovered !== 'all') params.set('recovered', recovered);

        const [summaryRes, usersRes] = await Promise.all([
          adminFetch('/api/admin/profiles/issues/summary'),
          adminFetch(`/api/admin/profiles/issues/users?${params.toString()}`),
        ]);

        const summaryData = await summaryRes.json();
        const usersData = await usersRes.json();

        if (!summaryRes.ok || !summaryData.success) {
          throw new Error(summaryData.error || '加载异常摘要失败');
        }
        if (!usersRes.ok || !usersData.success) {
          throw new Error(usersData.error || '加载用户异常列表失败');
        }

        setSummary({
          currentIssueUserCount: Number(summaryData?.summary?.currentIssueUserCount || 0),
          currentBlockingProfileCount: Number(summaryData?.summary?.currentBlockingProfileCount || 0),
          currentSyncWarningProfileCount: Number(
            summaryData?.summary?.currentSyncWarningProfileCount || 0
          ),
          recentIssueCount24h: Number(summaryData?.summary?.recentIssueCount24h || 0),
          recoveredCount24h: Number(summaryData?.summary?.recoveredCount24h || 0),
        });
        setUsers(Array.isArray(usersData.users) ? usersData.users : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载异常判断数据失败');
      } finally {
        setLoading(false);
      }
    }

    void loadIssues();
  }, [authChecked, keyword, severity, category, recovered]);

  const totalUsers = useMemo(() => users.length, [users]);

  if (!authChecked) return null;
  if (loading && users.length === 0) {
    return <PageSkeleton title="加载异常判断数据中..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="异常判断"
        description="按用户聚合当前阻断、启动失败与同步告警"
      />

      <ErrorBanner message={error} />

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard label="当前异常用户数" value={summary.currentIssueUserCount} />
        <StatCard
          label="当前阻断环境数"
          value={summary.currentBlockingProfileCount}
          accentClassName="text-red-400"
        />
        <StatCard
          label="当前同步告警环境数"
          value={summary.currentSyncWarningProfileCount}
          accentClassName="text-yellow-400"
        />
        <StatCard
          label="24h 新增异常"
          value={summary.recentIssueCount24h}
          accentClassName="text-orange-300"
        />
        <StatCard
          label="24h 自动恢复"
          value={summary.recoveredCount24h}
          accentClassName="text-emerald-400"
        />
      </div>

      <DataTable>
        <FilterBar>
          <AppInput
            className="max-w-sm"
            placeholder="搜索用户、邮箱、异常摘要"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <AppSelect className="w-40" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="all">全部级别</option>
            <option value="blocking">阻断</option>
            <option value="warning">告警</option>
            <option value="info">信息</option>
          </AppSelect>
          <AppSelect className="w-52" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">全部类别</option>
            <option value="launch-block">启动阻断</option>
            <option value="launch-failure">启动失败</option>
            <option value="environment-sync-warning">环境同步告警</option>
            <option value="storage-state-warning">登录态同步告警</option>
            <option value="workspace-snapshot-warning">快照同步告警</option>
            <option value="recovery-event">恢复事件</option>
          </AppSelect>
          <AppSelect className="w-40" value={recovered} onChange={(e) => setRecovered(e.target.value)}>
            <option value="all">全部状态</option>
            <option value="active">当前待处理</option>
            <option value="recovered">已恢复</option>
          </AppSelect>
        </FilterBar>

        {users.length ? (
          <table className="w-full text-sm">
            <thead className="bg-neutral-800/60 text-neutral-300">
              <tr>
                <th className="px-4 py-3 text-left">用户</th>
                <th className="px-4 py-3 text-left">当前异常环境数</th>
                <th className="px-4 py-3 text-left">阻断数</th>
                <th className="px-4 py-3 text-left">同步告警数</th>
                <th className="px-4 py-3 text-left">最近异常时间</th>
                <th className="px-4 py-3 text-left">最近异常摘要</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId} className="border-t border-neutral-800 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/users/${user.userId}`} className="text-white hover:underline">
                      {user.ownerName || user.ownerEmail || user.userId}
                    </Link>
                    <div className="mt-1 text-xs text-neutral-500">{user.ownerEmail || user.userId}</div>
                  </td>
                  <td className="px-4 py-3">{user.currentIssueProfileCount}</td>
                  <td className="px-4 py-3 text-red-400">{user.blockingCount}</td>
                  <td className="px-4 py-3 text-yellow-300">{user.syncWarningCount}</td>
                  <td className="px-4 py-3">{formatDateTime(user.lastIssueAt)}</td>
                  <td className="px-4 py-3 text-neutral-300">{user.lastIssueSummary || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4">
            <EmptyState
              title={totalUsers ? '没有匹配的异常用户' : '当前没有需要管理员处理的异常'}
              description="当前筛选条件下没有找到异常用户记录。"
            />
          </div>
        )}
      </DataTable>
    </div>
  );
}
