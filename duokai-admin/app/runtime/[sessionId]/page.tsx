'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/api-client';
import { readAdminAuth } from '@/lib/require-admin-client';
import ErrorBanner from '@/components/ErrorBanner';

type RuntimeSession = {
  profileId?: string;
  profileName?: string;
  sessionId?: string;
  startedAt?: string;
  status?: string;
  runtimeUrl?: string;
  [key: string]: unknown;
};

export default function RuntimeSessionDetailPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = String(params?.sessionId || '');

  const [authChecked, setAuthChecked] = useState(false);
  const [session, setSession] = useState<RuntimeSession | null>(null);
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
    if (!authChecked || !sessionId) return;

    async function loadSession() {
      setLoading(true);
      setError('');
      try {
        const res = await adminFetch('/api/runtime/status');
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || '加载会话详情失败');
        }

        const sessions: RuntimeSession[] = Array.isArray(data?.sessions) ? data.sessions : [];
        const matched =
          sessions.find((item) => String(item.sessionId || '') === sessionId) || null;

        if (!matched) {
          setError('会话不存在');
          setSession(null);
          return;
        }

        setSession(matched);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载会话详情失败');
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, [authChecked, sessionId]);

  if (!authChecked) return null;
  if (loading) return <div className="text-sm text-neutral-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">会话详情</h1>
        <p className="mt-2 text-sm text-neutral-400">sessionId: {sessionId}</p>
      </div>

      <ErrorBanner message={error} />

      {session ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-2">
          <div>sessionId：{(session.sessionId as string) || '-'}</div>
          <div>profileName：{(session.profileName as string) || '-'}</div>
          <div>profileId：{(session.profileId as string) || '-'}</div>
          <div>status：{(session.status as string) || '-'}</div>
          <div>startedAt：{(session.startedAt as string) || '-'}</div>
          <div>runtimeUrl：{(session.runtimeUrl as string) || '-'}</div>
        </div>
      ) : null}
    </div>
  );
}
