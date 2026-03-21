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

export default function UsersPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
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

  const filteredUsers = users.filter((user) => {
    const accountText = `${user.email || ''} ${user.username || ''}`.toLowerCase();
    const matchesKeyword =
      !keyword ||
      accountText.includes(keyword.toLowerCase()) ||
      (user.name || '').toLowerCase().includes(keyword.toLowerCase());
    const matchesStatus = statusFilter === 'all' ? true : user.status === statusFilter;
    return matchesKeyword && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const pagedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword, statusFilter]);

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
          <AppButton
            variant={createFormOpen ? 'secondary' : 'primary'}
            onClick={() => setCreateFormOpen((prev) => !prev)}
          >
            {createFormOpen ? '收起创建' : '创建用户'}
          </AppButton>
        }
      >
        <p className="text-xs text-neutral-500">
          密码仅以安全哈希形式保存，后台不能查看明文密码，但可以为用户重置密码。用户可使用邮箱或账号登录。
        </p>
      </PageHeader>

      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

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
        <FilterBar
          actions={
            <>
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
            </>
          }
        >
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
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-neutral-400" colSpan={6}>
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
                <td className="px-4 py-4" colSpan={6}>
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
