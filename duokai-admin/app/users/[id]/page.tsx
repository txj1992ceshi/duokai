'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/api-client';
import { readAdminAuth } from '@/lib/require-admin-client';
import AppButton from '@/components/AppButton';
import AppInput from '@/components/AppInput';
import ErrorBanner from '@/components/ErrorBanner';
import SuccessBanner from '@/components/SuccessBanner';
import PageSkeleton from '@/components/PageSkeleton';
import DetailCard from '@/components/DetailCard';
import PageHeader from '@/components/PageHeader';
import CardGrid from '@/components/CardGrid';
import SectionBlock from '@/components/SectionBlock';

type AdminUser = {
  id: string;
  email?: string;
  username?: string;
  name?: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  createdAt?: string;
  updatedAt?: string;
};

type AdminProfile = {
  id: string;
  userId?: string;
  name?: string;
  status?: string;
  startupPlatform?: string;
  startupUrl?: string;
  storageStateSynced?: boolean;
};

type AdminActionLog = {
  id: string;
  adminEmail?: string;
  action?: string;
  targetLabel?: string;
  createdAt?: string;
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

export default function UserDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = String(params?.id || '');

  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [relatedProfilesText, setRelatedProfilesText] = useState('待后端管理员视角接口接入');
  const [relatedProfiles, setRelatedProfiles] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingName, setEditingName] = useState('');
  const [editingUsername, setEditingUsername] = useState('');
  const [actionLogs, setActionLogs] = useState<AdminActionLog[]>([]);

  useEffect(() => {
    const auth = readAdminAuth();
    if (!auth.ok) {
      router.replace('/login');
      return;
    }
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!authChecked || !userId) return;

    async function loadUser() {
      setLoading(true);
      setError('');
      try {
        const [userRes, profilesRes, logsRes] = await Promise.all([
          adminFetch('/api/admin/users'),
          adminFetch(`/api/admin/profiles?userId=${encodeURIComponent(userId)}&page=1&pageSize=100`),
          adminFetch(`/api/admin/action-logs?relatedUserId=${encodeURIComponent(userId)}`),
        ]);
        const data = await userRes.json();

        if (!userRes.ok || !data.success) {
          throw new Error(data.error || '加载用户详情失败');
        }

        const list: AdminUser[] = Array.isArray(data.users) ? data.users : [];
        const matched = list.find((u) => u.id === userId) || null;
        if (!matched) {
          setError('用户不存在');
          setUser(null);
          return;
        }

        setUser(matched);
        setEditingName(matched.name || '');
        setEditingUsername(matched.username || '');

        try {
          const profilesData = await profilesRes.json();
          if (profilesRes.ok && profilesData?.success && Array.isArray(profilesData.profiles)) {
            setRelatedProfiles(profilesData.profiles);
            setRelatedProfilesText(String(Number(profilesData.total || profilesData.profiles.length || 0)));
          } else {
            setRelatedProfiles([]);
            setRelatedProfilesText('待后端管理员视角接口接入');
          }
        } catch {
          setRelatedProfiles([]);
          setRelatedProfilesText('待后端管理员视角接口接入');
        }

        try {
          const logsData = await logsRes.json();
          if (logsRes.ok && logsData?.success && Array.isArray(logsData.logs)) {
            setActionLogs(logsData.logs);
          } else {
            setActionLogs([]);
          }
        } catch {
          setActionLogs([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载用户详情失败');
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, [authChecked, userId]);

  async function reloadUser() {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const [userRes, profilesRes, logsRes] = await Promise.all([
        adminFetch('/api/admin/users'),
        adminFetch(`/api/admin/profiles?userId=${encodeURIComponent(userId)}&page=1&pageSize=100`),
        adminFetch(`/api/admin/action-logs?relatedUserId=${encodeURIComponent(userId)}`),
      ]);
      const data = await userRes.json();

      if (!userRes.ok || !data.success) {
        throw new Error(data.error || '加载用户详情失败');
      }

      const list: AdminUser[] = Array.isArray(data.users) ? data.users : [];
      const matched = list.find((u) => u.id === userId) || null;
      if (!matched) {
        setError('用户不存在');
        setUser(null);
        return;
      }

      setUser(matched);
      setEditingName(matched.name || '');
      setEditingUsername(matched.username || '');

      try {
        const logsData = await logsRes.json();
        if (logsRes.ok && logsData?.success && Array.isArray(logsData.logs)) {
          setActionLogs(logsData.logs);
        } else {
          setActionLogs([]);
        }
      } catch {
        setActionLogs([]);
      }

      try {
        const profilesData = await profilesRes.json();
        if (profilesRes.ok && profilesData?.success && Array.isArray(profilesData.profiles)) {
          setRelatedProfiles(profilesData.profiles);
          setRelatedProfilesText(String(Number(profilesData.total || profilesData.profiles.length || 0)));
        } else {
          setRelatedProfiles([]);
          setRelatedProfilesText('0');
        }
      } catch {
        setRelatedProfiles([]);
        setRelatedProfilesText('0');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载用户详情失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus() {
    if (!user) return;
    setError('');
    setSuccess('');

    try {
      const res =
        user.status === 'disabled'
          ? await adminFetch(`/api/admin/users/${user.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'active' }),
            })
          : await adminFetch(`/api/admin/users/${user.id}`, {
              method: 'DELETE',
            });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || '更新用户状态失败');
        return;
      }

      setUser((prev) =>
        prev ? { ...prev, status: user.status === 'disabled' ? 'active' : 'disabled' } : prev
      );
      setSuccess(user.status === 'disabled' ? '已启用该用户' : '已禁用该用户');
    } catch {
      setError('更新用户状态失败');
    }
  }

  async function handleToggleRole() {
    if (!user) return;
    if (!window.confirm('确认修改这个用户的角色吗？')) return;
    setError('');
    setSuccess('');

    const nextRole = user.role === 'admin' ? 'user' : 'admin';

    try {
      const res = await adminFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || '修改角色失败');
        return;
      }

      setUser((prev) => (prev ? { ...prev, role: nextRole } : prev));
      setSuccess(nextRole === 'admin' ? '已设为管理员' : '已设为普通用户');
    } catch {
      setError('修改角色失败');
    }
  }

  async function handleResetPassword() {
    if (!user) return;
    const accountLabel = user.email || user.username || '该用户';
    const nextPassword = window.prompt(`请输入 ${accountLabel} 的新密码（至少 6 位）`);
    if (!nextPassword) return;
    if (nextPassword.length < 6) {
      setError('密码至少需要 6 位');
      setSuccess('');
      return;
    }

    setError('');
    setSuccess('');

    try {
      const res = await adminFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: nextPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || '重置密码失败');
        return;
      }

      setSuccess(`已重置 ${accountLabel} 的密码`);
    } catch {
      setError('重置密码失败');
    }
  }

  async function handleDeleteUser() {
    if (!user) return;
    const accountLabel = user.email || user.username || '该用户';
    if (!window.confirm(`确认永久删除用户 ${accountLabel} 吗？删除后无法恢复。`)) return;
    setError('');
    setSuccess('');

    try {
      const res = await adminFetch(`/api/admin/users/${user.id}?permanent=true`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || '删除用户失败');
        return;
      }

      setSuccess(`已删除用户 ${accountLabel}`);
      router.push('/users');
    } catch {
      setError('删除用户失败');
    }
  }

  async function handleSaveName() {
    if (!user) return;
    const nextName = editingName.trim();
    if (nextName === (user.name || '').trim()) return;

    setError('');
    setSuccess('');

    try {
      const res = await adminFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: nextName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || '更新名称失败');
        return;
      }

      setUser((prev) => (prev ? { ...prev, name: nextName } : prev));
      setSuccess('已更新用户名称');
    } catch {
      setError('更新名称失败');
    }
  }

  async function handleSaveUsername() {
    if (!user) return;
    const nextUsername = editingUsername.trim().toLowerCase();
    if (nextUsername === String(user.username || '').trim().toLowerCase()) return;

    setError('');
    setSuccess('');

    try {
      const res = await adminFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ username: nextUsername }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || '更新账号失败');
        return;
      }

      setUser((prev) => (prev ? { ...prev, username: nextUsername } : prev));
      setSuccess(nextUsername ? '已更新登录账号' : '已清除登录账号');
    } catch {
      setError('更新账号失败');
    }
  }

  if (!authChecked) return null;
  if (loading) return <PageSkeleton title="加载用户详情中..." rows={4} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="用户详情"
        description={user?.email || user?.username || '-'}
        aside={
          <>
            <AppButton
              onClick={() => {
                setSuccess('');
                void reloadUser();
              }}
              variant="secondary"
            >
              刷新
            </AppButton>
            <AppButton
              onClick={() => router.push('/users')}
              variant="secondary"
            >
              返回列表
            </AppButton>
          </>
        }
      >
        <p className="text-xs text-neutral-500">
            密码仅以安全哈希形式保存，后台不能查看明文密码，只能重置密码。
        </p>
      </PageHeader>

      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      {user ? (
        <SectionBlock title="账号概览" description="查看用户信息、管理账号状态，并追踪关联环境。">
          <CardGrid columns="two">
            <DetailCard title="基本信息">
              <div>邮箱：{user.email || '-'}</div>
              <div>账号：{user.username || '-'}</div>
              <div>名称：{user.name || '-'}</div>
              <div>角色：{user.role}</div>
              <div>状态：{user.status}</div>
            </DetailCard>
            <DetailCard title="时间信息">
              <div>createdAt：{formatDateTime(user.createdAt)}</div>
              <div>updatedAt：{formatDateTime(user.updatedAt)}</div>
            </DetailCard>
            <DetailCard title="编辑信息">
              <AppInput
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                placeholder="输入新的用户名称"
              />
              <AppButton
                onClick={() => void handleSaveName()}
                variant="secondary"
              >
                保存名称
              </AppButton>
              <AppInput
                value={editingUsername}
                onChange={(e) => setEditingUsername(e.target.value)}
                placeholder="输入新的登录账号，可留空清除"
              />
              <AppButton
                onClick={() => void handleSaveUsername()}
                variant="secondary"
              >
                保存账号
              </AppButton>
            </DetailCard>
            <DetailCard title="账号操作">
              <div className="flex flex-wrap gap-2">
                <AppButton
                  onClick={() => void handleToggleStatus()}
                  variant="secondary"
                >
                  {user.status === 'disabled' ? '启用用户' : '禁用用户'}
                </AppButton>
                <AppButton
                  onClick={() => void handleToggleRole()}
                  variant="secondary"
                >
                  {user.role === 'admin' ? '设为普通用户' : '设为管理员'}
                </AppButton>
                <AppButton
                  onClick={() => void handleResetPassword()}
                  variant="secondary"
                >
                  重置密码
                </AppButton>
                <AppButton
                  onClick={() => void handleDeleteUser()}
                  variant="danger"
                >
                  永久删除
                </AppButton>
              </div>
            </DetailCard>
            <DetailCard title="关联数据" className="md:col-span-2">
              <div className="text-sm text-neutral-300">关联环境数：{relatedProfilesText}</div>
              {relatedProfiles.length ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-neutral-800">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-800/60 text-neutral-300">
                      <tr>
                        <th className="px-3 py-2 text-left">环境名称</th>
                        <th className="px-3 py-2 text-left">状态</th>
                        <th className="px-3 py-2 text-left">平台</th>
                        <th className="px-3 py-2 text-left">StorageState</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatedProfiles.map((profile) => (
                        <tr key={profile.id} className="border-t border-neutral-800">
                          <td className="px-3 py-2">
                            <Link
                              href={`/profiles/${profile.id}`}
                              className="text-white hover:underline"
                            >
                              {profile.name || '-'}
                            </Link>
                          </td>
                          <td className="px-3 py-2">{profile.status || '-'}</td>
                          <td className="px-3 py-2">
                            {profile.startupPlatform || profile.startupUrl || '-'}
                          </td>
                          <td className="px-3 py-2">
                            {profile.storageStateSynced ? '已同步' : '未同步'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </DetailCard>
            <DetailCard title="操作记录" className="md:col-span-2">
              {actionLogs.length ? (
                <div className="overflow-hidden rounded-xl border border-neutral-800">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-800/60 text-neutral-300">
                      <tr>
                        <th className="px-3 py-2 text-left">时间</th>
                        <th className="px-3 py-2 text-left">管理员</th>
                        <th className="px-3 py-2 text-left">动作</th>
                        <th className="px-3 py-2 text-left">对象</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actionLogs.map((log) => (
                        <tr key={log.id} className="border-t border-neutral-800">
                          <td className="px-3 py-2">{formatDateTime(log.createdAt)}</td>
                          <td className="px-3 py-2">{log.adminEmail || '-'}</td>
                          <td className="px-3 py-2">{log.action || '-'}</td>
                          <td className="px-3 py-2">
                            {log.targetLabel || user.email || user.username || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-neutral-500">暂无管理员操作记录</div>
              )}
            </DetailCard>
          </CardGrid>
        </SectionBlock>
      ) : null}
    </div>
  );
}
