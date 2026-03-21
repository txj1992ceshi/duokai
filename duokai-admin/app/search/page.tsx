'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '@/lib/api-client';
import { readAdminAuth } from '@/lib/require-admin-client';
import ErrorBanner from '@/components/ErrorBanner';
import EmptyState from '@/components/EmptyState';

type AdminUser = {
  id: string;
  email?: string;
  username?: string;
  name?: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
};

type AdminProfile = {
  id: string;
  name: string;
  status: string;
  ownerEmail?: string;
  proxyHost?: string;
  expectedProxyIp?: string;
};

function highlightText(text: string, keyword: string) {
  if (!keyword) return text;

  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const index = lowerText.indexOf(lowerKeyword);

  if (index === -1) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + keyword.length);
  const after = text.slice(index + keyword.length);

  return (
    <>
      {before}
      <span className="rounded bg-yellow-500/20 px-1 text-yellow-300">{match}</span>
      {after}
    </>
  );
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = String(searchParams.get('q') || '').trim();

  const [authChecked, setAuthChecked] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
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

    async function loadData() {
      setLoading(true);
      setError('');
      try {
        const [usersRes, profilesRes] = await Promise.all([
          adminFetch('/api/admin/users'),
          adminFetch('/api/admin/profiles'),
        ]);
        const usersData = await usersRes.json();
        const profilesData = await profilesRes.json();

        if (!usersRes.ok || !usersData.success) {
          throw new Error(usersData.error || '加载用户数据失败');
        }
        if (!profilesRes.ok || !profilesData.success) {
          throw new Error(profilesData.error || '加载环境数据失败');
        }

        setUsers(Array.isArray(usersData.users) ? usersData.users : []);
        setProfiles(Array.isArray(profilesData.profiles) ? profilesData.profiles : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : '搜索加载失败');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [authChecked]);

  if (!authChecked) return null;

  const q = query.toLowerCase();
  const filteredUsers = users.filter((user) => {
    if (!q) return true;
    return (
      (user.email || '').toLowerCase().includes(q) ||
      (user.username || '').toLowerCase().includes(q) ||
      (user.name || '').toLowerCase().includes(q)
    );
  });
  const filteredProfiles = profiles.filter((profile) => {
    if (!q) return true;
    return (
      (profile.name || '').toLowerCase().includes(q) ||
      (profile.proxyHost || '').toLowerCase().includes(q) ||
      (profile.expectedProxyIp || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">全局搜索</h1>
        <p className="mt-2 text-sm text-neutral-400">
          {query ? `关键词：${query}` : '未输入关键词'}
        </p>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <div className="text-sm text-neutral-400">加载中...</div>
      ) : (
        <>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-3">
            <div className="text-lg font-semibold">用户结果 ({filteredUsers.length})</div>
            {filteredUsers.length ? (
              <div className="space-y-2">
                {filteredUsers.map((user) => (
                  <div key={user.id} className="text-sm">
                    <Link href={`/users/${user.id}`} className="hover:underline text-white">
                      {highlightText(user.email || user.username || '-', query)}
                    </Link>
                    <span className="text-neutral-400">
                      {' '}
                      | {user.username ? highlightText(user.username, query) : '-'} |{' '}
                      {user.name ? highlightText(user.name, query) : '-'} | {user.role} |{' '}
                      {user.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="无匹配用户"
                description="尝试更换关键词（邮箱、账号或名称）"
              />
            )}
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-3">
            <div className="text-lg font-semibold">环境结果 ({filteredProfiles.length})</div>
            {filteredProfiles.length ? (
              <div className="space-y-2">
                {filteredProfiles.map((profile) => (
                  <div key={profile.id} className="text-sm">
                    <Link href={`/profiles/${profile.id}`} className="hover:underline text-white">
                      {highlightText(profile.name, query)}
                    </Link>
                    <span className="text-neutral-400">
                      {' '}
                      | {profile.status} | {profile.ownerEmail ? highlightText(profile.ownerEmail, query) : '-'} | {profile.proxyHost ? highlightText(profile.proxyHost, query) : '-'} |{' '}
                      {profile.expectedProxyIp
                        ? highlightText(profile.expectedProxyIp, query)
                        : '-'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="无匹配环境"
                description="尝试更换关键词（环境名、代理主机、期望IP）"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
