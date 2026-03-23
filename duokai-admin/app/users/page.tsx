'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { adminFetch } from '@/lib/api-client';
import { readAdminAuth } from '@/lib/require-admin-client';
import AppButton from '@/components/AppButton';
import AppCheckbox from '@/components/AppCheckbox';
import AppInput from '@/components/AppInput';
import AppSelect from '@/components/AppSelect';
import ErrorBanner from '@/components/ErrorBanner';
import SuccessBanner from '@/components/SuccessBanner';
import PageSkeleton from '@/components/PageSkeleton';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import FilterBar from '@/components/FilterBar';
import DataTable from '@/components/DataTable';
import TablePagination from '@/components/TablePagination';
import StatCard from '@/components/StatCard';

type AdminUser = {
  id: string;
  email?: string;
  username?: string;
  name?: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  devices?: Array<{ deviceId: string; revokedAt?: string | null }>;
  subscription?: {
    plan?: string;
    status?: 'free' | 'trial' | 'active' | 'expired' | 'suspended';
    expiresAt?: string | null;
  };
  createdAt?: string;
  updatedAt?: string;
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getActiveDeviceCount(user: AdminUser) {
  return Array.isArray(user.devices)
    ? user.devices.filter((device) => !device.revokedAt).length
    : 0;
}

function getSubscriptionLabel(user: AdminUser) {
  if (user.role === 'admin') {
    return '内部授权';
  }
  return user.subscription?.plan || 'free';
}

function getSubscriptionStatus(user: AdminUser) {
  if (user.role === 'admin') {
    return 'internal';
  }
  return user.subscription?.status || 'free';
}

function getSubscriptionBadgeClass(status: string) {
  if (status === 'expired') return 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
  if (status === 'suspended') return 'bg-rose-500/15 text-rose-300 border border-rose-500/30';
  if (status === 'active') return 'bg-emerald-400/20 text-emerald-200 border border-emerald-300/40 shadow-[0_0_0_1px_rgba(52,211,153,0.08)]';
  if (status === 'trial') return 'bg-cyan-400/20 text-cyan-200 border border-cyan-300/40 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]';
  if (status === 'internal') return 'bg-violet-500/15 text-violet-300 border border-violet-500/30';
  return 'bg-neutral-700 text-neutral-200 border border-neutral-600';
}

function isExpiringSoon(user: AdminUser) {
  if (user.role === 'admin') return false;
  const expiresAt = user.subscription?.expiresAt;
  if (!expiresAt) return false;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return false;
  const diff = date.getTime() - Date.now();
  return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
}

function isExpiredUser(user: AdminUser) {
  return getSubscriptionStatus(user) === 'expired';
}

export default function UsersPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState<
    'all' | 'free' | 'trial' | 'active' | 'expired' | 'suspended' | 'internal'
  >('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [expiringSoonOnly, setExpiringSoonOnly] = useState(false);
  const [expiredOnly, setExpiredOnly] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [batchSubscriptionPlan, setBatchSubscriptionPlan] = useState('pro');
  const [batchSubscriptionStatus, setBatchSubscriptionStatus] = useState<
    'free' | 'trial' | 'active' | 'expired' | 'suspended'
  >('active');
  const [batchSubscriptionExpiresAt, setBatchSubscriptionExpiresAt] = useState('');
  const [batchClearExpiresAt, setBatchClearExpiresAt] = useState(false);
  const [batchUpdatePlanEnabled, setBatchUpdatePlanEnabled] = useState(false);
  const [batchResetPlanEnabled, setBatchResetPlanEnabled] = useState(false);
  const [batchUpdateExpiresAtEnabled, setBatchUpdateExpiresAtEnabled] = useState(false);

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
      setLoading(true);
      setError('');
      try {
        const res = await adminFetch('/api/admin/users');
        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error || '加载用户失败');
          return;
        }

        setUsers(Array.isArray(data.users) ? data.users : []);
      } catch {
        setError('加载用户失败');
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, [authChecked]);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const res = await adminFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail,
          username: newUsername,
          password: newPassword,
          name: newName,
          role: newRole,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '创建用户失败');
        return;
      }

      setUsers((prev) => [data.user, ...prev]);
      setNewEmail('');
      setNewUsername('');
      setNewPassword('');
      setNewName('');
      setNewRole('user');
      setCreateFormOpen(false);
      setSuccess('创建用户成功');
    } catch {
      setError('创建用户失败');
    }
  }

  async function handleDisableUser(userId: string) {
    if (!window.confirm('确认禁用这个用户吗？')) return;
    setSuccess('');
    setError('');

    try {
      const res = await adminFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '禁用用户失败');
        return;
      }

      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, status: 'disabled' } : user))
      );
      setSuccess('禁用用户成功');
    } catch {
      setError('禁用用户失败');
    }
  }

  async function handleEnableUser(userId: string) {
    setSuccess('');
    setError('');
    try {
      const res = await adminFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '启用用户失败');
        return;
      }

      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, status: 'active' } : user))
      );
      setSuccess('启用用户成功');
    } catch {
      setError('启用用户失败');
    }
  }

  async function handleChangeRole(userId: string, role: 'user' | 'admin') {
    if (!window.confirm('确认修改这个用户的角色吗？')) return;
    setSuccess('');
    setError('');

    try {
      const res = await adminFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '修改角色失败');
        return;
      }

      setUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, role } : user)));
      setSuccess('修改角色成功');
    } catch {
      setError('修改角色失败');
    }
  }

  async function handleResetPassword(userId: string, accountLabel: string) {
    const nextPassword = window.prompt(`请输入 ${accountLabel} 的新密码（至少 6 位）`);
    if (!nextPassword) return;
    if (nextPassword.length < 6) {
      setError('密码至少需要 6 位');
      setSuccess('');
      return;
    }

    setSuccess('');
    setError('');

    try {
      const res = await adminFetch(`/api/admin/users/${userId}`, {
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

  async function handleDeleteUser(userId: string, accountLabel: string) {
    if (!window.confirm(`确认永久删除用户 ${accountLabel} 吗？删除后无法恢复。`)) return;

    setSuccess('');
    setError('');

    try {
      const res = await adminFetch(`/api/admin/users/${userId}?permanent=true`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '删除用户失败');
        return;
      }

      setUsers((prev) => prev.filter((user) => user.id !== userId));
      setSelectedUserIds((prev) => prev.filter((id) => id !== userId));
      setSuccess(`已删除用户 ${accountLabel}`);
    } catch {
      setError('删除用户失败');
    }
  }

  function toggleUserSelection(userId: string) {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function toggleSelectAll(currentIds: string[]) {
    const allSelected =
      currentIds.length > 0 && currentIds.every((id) => selectedUserIds.includes(id));
    setSelectedUserIds(allSelected ? [] : currentIds);
  }

  async function handleBatchEnable() {
    if (!selectedUserIds.length) return;
    setSuccess('');
    setError('');

    try {
      for (const userId of selectedUserIds) {
        await adminFetch(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'active' }),
        });
      }
      setUsers((prev) =>
        prev.map((user) =>
          selectedUserIds.includes(user.id) ? { ...user, status: 'active' } : user
        )
      );
      setSuccess('批量启用成功');
      setSelectedUserIds([]);
    } catch {
      setError('批量启用失败');
    }
  }

  async function handleBatchDisable() {
    if (!selectedUserIds.length) return;
    if (!window.confirm(`确认禁用选中的 ${selectedUserIds.length} 个用户吗？`)) return;
    setSuccess('');
    setError('');

    try {
      for (const userId of selectedUserIds) {
        await adminFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      }
      setUsers((prev) =>
        prev.map((user) =>
          selectedUserIds.includes(user.id) ? { ...user, status: 'disabled' } : user
        )
      );
      setSuccess('批量禁用成功');
      setSelectedUserIds([]);
    } catch {
      setError('批量禁用失败');
    }
  }

  async function handleBatchSetRole(role: 'user' | 'admin') {
    if (!selectedUserIds.length) return;
    if (!window.confirm(`确认将选中的 ${selectedUserIds.length} 个用户设为 ${role} 吗？`)) {
      return;
    }
    setSuccess('');
    setError('');

    try {
      for (const userId of selectedUserIds) {
        await adminFetch(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        });
      }

      setUsers((prev) =>
        prev.map((user) =>
          selectedUserIds.includes(user.id) ? { ...user, role } : user
        )
      );
      setSuccess('批量修改角色成功');
      setSelectedUserIds([]);
    } catch {
      setError('批量修改角色失败');
    }
  }

  async function handleBatchUpdateSubscription() {
    if (!selectedUserIds.length) return;
    if (!window.confirm(`确认批量更新 ${selectedUserIds.length} 个用户的订阅状态吗？`)) {
      return;
    }
    setSuccess('');
    setError('');

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
      for (const userId of selectedUserIds) {
        const currentUser = users.find((user) => user.id === userId);
        if (!currentUser || currentUser.role === 'admin') {
          skippedCount += 1;
          continue;
        }
        try {
          const nextPlan =
            batchSubscriptionStatus === 'free'
              ? 'free'
              : batchResetPlanEnabled
                ? 'free'
              : batchUpdatePlanEnabled
                ? batchSubscriptionPlan.trim() || currentUser.subscription?.plan || 'pro'
                : currentUser.subscription?.plan || 'pro';
          const nextExpiresAtIso = batchUpdateExpiresAtEnabled
            ? batchClearExpiresAt
              ? null
              : batchSubscriptionExpiresAt
                ? new Date(batchSubscriptionExpiresAt).toISOString()
                : null
            : currentUser.subscription?.expiresAt || null;
          const response = await adminFetch(`/api/admin/users/${userId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              subscription: {
                plan: nextPlan,
                status: batchSubscriptionStatus,
                expiresAt: nextExpiresAtIso,
              },
            }),
          });
          const data = await response.json();
          if (!response.ok || !data.success) {
            failedCount += 1;
            continue;
          }
          successCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      setUsers((prev) =>
        prev.map((user) => {
          if (!selectedUserIds.includes(user.id) || user.role === 'admin') {
            return user;
          }
          return {
            ...user,
            subscription: {
              plan:
                batchSubscriptionStatus === 'free'
                  ? 'free'
                  : batchResetPlanEnabled
                    ? 'free'
                  : batchUpdatePlanEnabled
                    ? batchSubscriptionPlan.trim() || user.subscription?.plan || 'pro'
                    : user.subscription?.plan || 'pro',
              status: batchSubscriptionStatus,
              expiresAt: batchUpdateExpiresAtEnabled
                ? batchClearExpiresAt
                  ? null
                  : batchSubscriptionExpiresAt
                    ? new Date(batchSubscriptionExpiresAt).toISOString()
                    : null
                : user.subscription?.expiresAt || null,
            },
          };
        })
      );
      setSuccess(`批量更新订阅完成：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}`);
      setSelectedUserIds([]);
    } catch {
      setError(`批量更新订阅失败：成功 ${successCount}，跳过 ${skippedCount}，失败 ${failedCount}`);
    }
  }

  function handleExportCsv() {
    const filterTags = [
      statusFilter !== 'all' ? `status-${statusFilter}` : null,
      subscriptionStatusFilter !== 'all' ? `subscription-${subscriptionStatusFilter}` : null,
      planFilter !== 'all' ? `plan-${planFilter}` : null,
      expiringSoonOnly ? 'expiring-soon' : null,
      expiredOnly ? 'expired' : null,
    ].filter(Boolean);
    const rows = filteredUsers.map((user) => ({
      账号: user.email || user.username || '',
      用户名: user.username || '',
      名称: user.name || '',
      角色: user.role,
      账户状态: user.status,
      设备数: String(getActiveDeviceCount(user)),
      套餐: getSubscriptionLabel(user),
      订阅状态: getSubscriptionStatus(user),
      到期时间: user.role === 'admin' ? '内部授权' : user.subscription?.expiresAt || '',
      是否即将到期: isExpiringSoon(user) ? '是' : '否',
      是否已过期: isExpiredUser(user) ? '是' : '否',
    }));

    const headers = [
      '账号',
      '用户名',
      '名称',
      '角色',
      '账户状态',
      '设备数',
      '套餐',
      '订阅状态',
      '到期时间',
      '是否即将到期',
      '是否已过期',
    ];

    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = String(row[header as keyof typeof row] || '');
            const escaped = value.replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `duokai-users-${filterTags.length ? filterTags.join('_') : 'all'}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setSuccess(`已导出 ${filteredUsers.length} 条当前筛选结果`);
  }

  const filteredUsers = users.filter((user) => {
    const accountText = `${user.email || ''} ${user.username || ''}`.toLowerCase();
    const matchesKeyword =
      !keyword ||
      accountText.includes(keyword.toLowerCase()) ||
      (user.name || '').toLowerCase().includes(keyword.toLowerCase());
    const matchesStatus = statusFilter === 'all' ? true : user.status === statusFilter;
    const subscriptionStatus = getSubscriptionStatus(user);
    const matchesSubscription =
      subscriptionStatusFilter === 'all' ? true : subscriptionStatus === subscriptionStatusFilter;
    const matchesPlan = planFilter === 'all' ? true : getSubscriptionLabel(user) === planFilter;
    const matchesExpiringSoon = expiringSoonOnly ? isExpiringSoon(user) : true;
    const matchesExpiredOnly = expiredOnly ? isExpiredUser(user) : true;
    return (
      matchesKeyword &&
      matchesStatus &&
      matchesSubscription &&
      matchesPlan &&
      matchesExpiringSoon &&
      matchesExpiredOnly
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const pagedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const expiringSoonCount = users.filter((user) => isExpiringSoon(user)).length;
  const expiredCount = users.filter((user) => isExpiredUser(user)).length;
  const planOptions = Array.from(
    new Set(users.map((user) => getSubscriptionLabel(user)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'zh-CN'));

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword, statusFilter, subscriptionStatusFilter, planFilter, expiringSoonOnly, expiredOnly]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  if (!authChecked) return null;
  if (loading && users.length === 0) {
    return <PageSkeleton title="加载用户数据中..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="用户管理"
        description="创建账号、启用/禁用、权限管理"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <AppButton variant="secondary" onClick={handleExportCsv}>
              导出 CSV
            </AppButton>
            <AppButton
              variant={createFormOpen ? 'secondary' : 'primary'}
              onClick={() => setCreateFormOpen((prev) => !prev)}
            >
              {createFormOpen ? '收起创建' : '创建用户'}
            </AppButton>
          </div>
        }
      >
        <p className="text-xs text-neutral-500">
          密码仅以安全哈希形式保存，后台不能查看明文密码，但可以为用户重置密码。用户可使用邮箱或账号登录。
        </p>
      </PageHeader>

      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setExpiringSoonOnly(true);
            setExpiredOnly(false);
          }}
          className={`rounded-2xl text-left transition focus:outline-none focus:ring-2 focus:ring-yellow-400/60 ${
            expiringSoonOnly && !expiredOnly
              ? 'ring-2 ring-yellow-400/80 bg-yellow-400/5'
              : 'hover:opacity-90'
          }`}
        >
          <StatCard
            label="即将到期用户"
            value={expiringSoonCount}
            accentClassName="text-yellow-300"
          />
        </button>
        <button
          type="button"
          onClick={() => {
            setExpiredOnly(true);
            setExpiringSoonOnly(false);
          }}
          className={`rounded-2xl text-left transition focus:outline-none focus:ring-2 focus:ring-amber-400/60 ${
            expiredOnly && !expiringSoonOnly
              ? 'ring-2 ring-amber-400/80 bg-amber-400/5'
              : 'hover:opacity-90'
          }`}
        >
          <StatCard
            label="已过期用户"
            value={expiredCount}
            accentClassName="text-amber-300"
          />
        </button>
      </div>

      {createFormOpen ? (
        <form
          onSubmit={handleCreateUser}
          className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-3"
        >
          <div className="text-lg font-semibold">创建用户</div>

          <AppInput
            placeholder="邮箱（可选）"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />

          <AppInput
            placeholder="账号（可选，支持登录）"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
          />

          <AppInput
            type="password"
            placeholder="密码"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />

          <AppInput
            placeholder="名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />

          <AppSelect
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as 'user' | 'admin')}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </AppSelect>

          <AppButton type="submit" variant="primary">
            创建用户
          </AppButton>
        </form>
      ) : null}

      <DataTable>
        <div className="border-b border-neutral-800 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-neutral-400">已选 {selectedUserIds.length} 个用户</span>
            <div className="h-4 w-px bg-neutral-800" />
            <div className="flex flex-wrap items-center gap-2">
              <AppButton
                onClick={handleBatchEnable}
                disabled={!selectedUserIds.length}
                variant="secondary"
              >
                批量启用
              </AppButton>
              <AppButton
                onClick={handleBatchDisable}
                disabled={!selectedUserIds.length}
                variant="secondary"
              >
                批量禁用
              </AppButton>
              <AppButton
                onClick={() => handleBatchSetRole('admin')}
                disabled={!selectedUserIds.length}
                variant="secondary"
              >
                批量设为管理员
              </AppButton>
              <AppButton
                onClick={() => handleBatchSetRole('user')}
                disabled={!selectedUserIds.length}
                variant="secondary"
              >
                批量设为用户
              </AppButton>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3">
            <span className="text-xs font-medium tracking-wide text-neutral-500">批量订阅</span>
            <label className="inline-flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={batchUpdatePlanEnabled}
                onChange={(e) => setBatchUpdatePlanEnabled(e.target.checked)}
                className="h-4 w-4 rounded border border-neutral-600 bg-neutral-900"
              />
              改 plan
            </label>
            <AppInput
              className="w-40"
              value={batchSubscriptionPlan}
              onChange={(e) => setBatchSubscriptionPlan(e.target.value)}
              placeholder="套餐 plan"
              disabled={!batchUpdatePlanEnabled || batchResetPlanEnabled}
            />
            <label className="inline-flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={batchResetPlanEnabled}
                onChange={(e) => setBatchResetPlanEnabled(e.target.checked)}
                disabled={!batchUpdatePlanEnabled}
                className="h-4 w-4 rounded border border-neutral-600 bg-neutral-900"
              />
              恢复默认 plan
            </label>
            <AppSelect
              className="w-40"
              value={batchSubscriptionStatus}
              onChange={(e) =>
                setBatchSubscriptionStatus(
                  e.target.value as 'free' | 'trial' | 'active' | 'expired' | 'suspended'
                )
              }
            >
              <option value="free">free</option>
              <option value="trial">trial</option>
              <option value="active">active</option>
              <option value="expired">expired</option>
              <option value="suspended">suspended</option>
            </AppSelect>
            <label className="inline-flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={batchUpdateExpiresAtEnabled}
                onChange={(e) => setBatchUpdateExpiresAtEnabled(e.target.checked)}
                className="h-4 w-4 rounded border border-neutral-600 bg-neutral-900"
              />
              改到期时间
            </label>
            <AppInput
              className="w-40"
              type="date"
              value={batchSubscriptionExpiresAt}
              onChange={(e) => setBatchSubscriptionExpiresAt(e.target.value)}
              disabled={!batchUpdateExpiresAtEnabled || batchClearExpiresAt}
            />
            <label className="inline-flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={batchClearExpiresAt}
                onChange={(e) => setBatchClearExpiresAt(e.target.checked)}
                disabled={!batchUpdateExpiresAtEnabled}
                className="h-4 w-4 rounded border border-neutral-600 bg-neutral-900"
              />
              清空到期时间
            </label>
            <AppButton
              onClick={handleBatchUpdateSubscription}
              disabled={!selectedUserIds.length}
              variant="secondary"
            >
              批量改订阅
            </AppButton>
          </div>
        </div>

        <FilterBar>
          <AppInput
            className="max-w-sm"
            placeholder="搜索邮箱、账号或名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <AppSelect
            className="w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'disabled')}
          >
            <option value="all">全部状态</option>
            <option value="active">启用中</option>
            <option value="disabled">已禁用</option>
          </AppSelect>
          <AppSelect
            className="w-48"
            value={subscriptionStatusFilter}
            onChange={(e) =>
              setSubscriptionStatusFilter(
                e.target.value as
                  | 'all'
                  | 'free'
                  | 'trial'
                  | 'active'
                  | 'expired'
                  | 'suspended'
                  | 'internal'
              )
            }
          >
            <option value="all">全部订阅状态</option>
            <option value="free">free</option>
            <option value="trial">trial</option>
            <option value="active">active</option>
            <option value="expired">expired</option>
            <option value="suspended">suspended</option>
            <option value="internal">内部授权</option>
          </AppSelect>
          <AppSelect
            className="w-40"
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
          >
            <option value="all">全部套餐</option>
            {planOptions.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </AppSelect>
          <label className="inline-flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={expiringSoonOnly}
              onChange={(e) => setExpiringSoonOnly(e.target.checked)}
              className="h-4 w-4 rounded border border-neutral-600 bg-neutral-900"
            />
            仅看即将到期用户
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={expiredOnly}
              onChange={(e) => setExpiredOnly(e.target.checked)}
              className="h-4 w-4 rounded border border-neutral-600 bg-neutral-900"
            />
            仅看已过期用户
          </label>
        </FilterBar>

        <table className="w-full text-sm">
          <thead className="bg-neutral-800/60 text-neutral-300">
            <tr>
              <th className="px-4 py-3 text-left">
                <AppCheckbox
                  checked={
                    pagedUsers.length > 0 &&
                    pagedUsers.every((user) => selectedUserIds.includes(user.id))
                  }
                  onChange={() => toggleSelectAll(pagedUsers.map((u) => u.id))}
                />
              </th>
              <th className="px-4 py-3 text-left">邮箱 / 账号</th>
              <th className="px-4 py-3 text-left">名称</th>
              <th className="px-4 py-3 text-left">角色</th>
              <th className="px-4 py-3 text-left">状态</th>
              <th className="px-4 py-3 text-left">设备数</th>
              <th className="px-4 py-3 text-left">套餐</th>
              <th className="px-4 py-3 text-left">到期时间</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-neutral-400" colSpan={9}>
                  加载中...
                </td>
              </tr>
            ) : pagedUsers.length ? (
              pagedUsers.map((user) => (
                <tr key={user.id} className="border-t border-neutral-800">
                  <td className="px-4 py-3">
                    <AppCheckbox
                      checked={selectedUserIds.includes(user.id)}
                      onChange={() => toggleUserSelection(user.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/users/${user.id}`} className="text-white hover:underline">
                      {user.email || user.username || '-'}
                    </Link>
                    {user.email && user.username ? (
                      <div className="mt-1 text-xs text-neutral-500">账号：{user.username}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{user.name || '-'}</td>
                  <td className="px-4 py-3">{user.role}</td>
                  <td className="px-4 py-3">{user.status}</td>
                  <td className="px-4 py-3">
                    <Link href={`/users/${user.id}`} className="text-cyan-300 hover:underline">
                      {getActiveDeviceCount(user)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {getSubscriptionLabel(user)}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${getSubscriptionBadgeClass(
                          getSubscriptionStatus(user)
                        )}`}
                      >
                        {getSubscriptionStatus(user)}
                      </span>
                      {isExpiringSoon(user) ? (
                        <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium bg-yellow-500/15 text-yellow-200 border border-yellow-400/30">
                          即将到期
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.role === 'admin'
                      ? '内部授权'
                      : formatDate(user.subscription?.expiresAt || null)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {user.status === 'disabled' ? (
                        <AppButton
                          onClick={() => handleEnableUser(user.id)}
                          variant="secondary"
                          size="sm"
                        >
                          启用
                        </AppButton>
                      ) : (
                        <AppButton
                          onClick={() => handleDisableUser(user.id)}
                          variant="secondary"
                          size="sm"
                        >
                          禁用
                        </AppButton>
                      )}
                      <AppButton
                        onClick={() =>
                          handleChangeRole(user.id, user.role === 'admin' ? 'user' : 'admin')
                        }
                        variant="secondary"
                        size="sm"
                      >
                        {user.role === 'admin' ? '设为用户' : '设为管理员'}
                      </AppButton>
                      <AppButton
                        onClick={() =>
                          handleResetPassword(user.id, user.email || user.username || '该用户')
                        }
                        variant="secondary"
                        size="sm"
                      >
                        重置密码
                      </AppButton>
                      <AppButton
                        onClick={() =>
                          handleDeleteUser(user.id, user.email || user.username || '该用户')
                        }
                        variant="danger"
                        size="sm"
                      >
                        删除
                      </AppButton>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-4" colSpan={9}>
                  <EmptyState
                    title={users.length ? '无匹配用户' : '暂无用户'}
                    description={
                      users.length
                        ? '请调整关键词或状态筛选条件'
                        : '先通过上方“创建用户”添加账号'
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
