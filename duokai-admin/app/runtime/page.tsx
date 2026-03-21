'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '@/lib/api-client';
import { readAdminAuth } from '@/lib/require-admin-client';
import AppButton from '@/components/AppButton';
import ErrorBanner from '@/components/ErrorBanner';
import PageSkeleton from '@/components/PageSkeleton';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import DataTable from '@/components/DataTable';

type RuntimeSession = {
  profileId?: string;
  profileName?: string;
  sessionId?: string;
  startedAt?: string;
  status?: string;
  [key: string]: unknown;
};

type RuntimeStatusPayload = {
  online?: boolean;
  degraded?: boolean;
  sessions?: RuntimeSession[];
};

export default function RuntimePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatusPayload>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRuntime = useCallback(async () => {
    if (!authChecked) return;

    setError('');
    try {
      const res = await adminFetch('/api/runtime/status');
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || '加载运行状态失败');
        return;
      }

      setRuntimeStatus({
        online: Boolean(data?.online),
        degraded: Boolean(data?.degraded),
        sessions: Array.isArray(data?.sessions) ? data.sessions : [],
      });
    } catch {
      setError('加载运行状态失败');
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

    let timer: ReturnType<typeof setInterval> | null = null;

    loadRuntime();
    timer = setInterval(loadRuntime, 5000);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [authChecked, loadRuntime]);

  const sessions = runtimeStatus.sessions || [];
  if (!authChecked) return null;
  if (loading && sessions.length === 0) {
    return <PageSkeleton title="加载 Runtime 状态中..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="运行状态"
        description="Runtime 总控视图"
        aside={
          <AppButton onClick={loadRuntime} variant="secondary">
            立即刷新
          </AppButton>
        }
      >
        <div className="text-xs text-neutral-500">每 5 秒自动刷新一次</div>
      </PageHeader>

      <ErrorBanner message={error} />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Runtime 在线状态" value={loading ? '-' : runtimeStatus.online ? '在线' : '离线'} />
        <StatCard label="当前会话数" value={loading ? '-' : sessions.length} />
        <StatCard label="降级状态" value={loading ? '-' : runtimeStatus.degraded ? '已降级' : '正常'} />
      </div>

      <DataTable>
        <table className="w-full text-sm">
          <thead className="bg-neutral-800/60 text-neutral-300">
            <tr>
              <th className="px-4 py-3 text-left">环境名称</th>
              <th className="px-4 py-3 text-left">会话 ID</th>
              <th className="px-4 py-3 text-left">启动时间</th>
              <th className="px-4 py-3 text-left">状态</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-neutral-400" colSpan={4}>
                  加载中...
                </td>
              </tr>
            ) : sessions.length ? (
              sessions.map((session, index) => (
                <tr
                  key={(session.sessionId as string) || (session.profileId as string) || index}
                  className="border-t border-neutral-800"
                >
                  <td className="px-4 py-3">
                    {(session.sessionId as string) ? (
                      <Link
                        href={`/runtime/${encodeURIComponent(String(session.sessionId || ''))}`}
                        className="text-white hover:underline"
                      >
                        {(session.profileName as string) || (session.sessionId as string) || '-'}
                      </Link>
                    ) : (
                      ((session.profileName as string) || '-')
                    )}
                  </td>
                  <td className="px-4 py-3">{(session.sessionId as string) || '-'}</td>
                  <td className="px-4 py-3">{(session.startedAt as string) || '-'}</td>
                  <td className="px-4 py-3">{(session.status as string) || '-'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-4" colSpan={4}>
                  <EmptyState
                    title="暂无 session"
                    description="当前 Runtime 没有活跃会话"
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
