'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import AppButton from '@/components/AppButton';
import AppInput from '@/components/AppInput';
import AppSelect from '@/components/AppSelect';
import NoticeBanner from '@/components/NoticeBanner';

type AdminUser = {
  id: string;
  email: string;
  name?: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  createdAt?: string;
  updatedAt?: string;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState<{ role?: string } | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userText = localStorage.getItem('user');

    if (!token) {
      router.replace('/login');
      return;
    }

    if (userText) {
      try {
        const parsed = JSON.parse(userText);
        setCurrentUser(parsed);

        if (parsed.role !== 'admin') {
          router.replace('/');
          return;
        }
      } catch {
        localStorage.removeItem('user');
        router.replace('/login');
        return;
      }
    } else {
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
        const res = await apiFetch('/api/admin/users');
        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error || 'Failed to load users');
          return;
        }

        setUsers(Array.isArray(data.users) ? data.users : []);
      } catch {
        setError('Failed to load users');
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, [authChecked]);

  async function handleDisableUser(userId: string) {
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to disable user');
        return;
      }

      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, status: 'disabled' } : user
        )
      );
    } catch {
      alert('Failed to disable user');
    }
  }

  async function handleEnableUser(userId: string) {
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'active',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to enable user');
        return;
      }

      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, status: 'active' } : user
        )
      );
    } catch {
      alert('Failed to enable user');
    }
  }

  async function handleChangeRole(userId: string, role: 'user' | 'admin') {
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to update role');
        return;
      }

      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, role } : user
        )
      );
    } catch {
      alert('Failed to update role');
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();

    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          name: newName,
          role: newRole,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to create user');
        return;
      }

      setUsers((prev) => [data.user, ...prev]);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewRole('user');
    } catch {
      alert('Failed to create user');
    }
  }

  if (!authChecked) return null;

  return (
    <div className="space-y-6 p-6 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">用户管理</h1>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400">
            {currentUser?.role ? `角色：${currentUser.role}` : ''}
          </div>
          <AppButton onClick={() => router.push('/')} variant="secondary">
            返回
          </AppButton>
        </div>
      </div>

      <form
        onSubmit={handleCreateUser}
        className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
      >
        <div className="text-lg font-semibold">创建用户</div>

        <AppInput
          className="h-11 rounded-xl border-slate-700 bg-slate-950/80"
          placeholder="邮箱"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />

        <AppInput
          className="h-11 rounded-xl border-slate-700 bg-slate-950/80"
          type="password"
          placeholder="密码"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />

        <AppInput
          className="h-11 rounded-xl border-slate-700 bg-slate-950/80"
          placeholder="名称"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />

        <AppSelect
          className="border-slate-700 bg-slate-950/80"
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

      <NoticeBanner message={error} variant="error" />

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
          加载中...
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
            >
              <div>
                <div className="font-medium">{user.name || user.email}</div>
                <div className="text-sm text-slate-400">
                  {user.email} | {user.role} | {user.status}
                </div>
              </div>
              <div className="flex items-center gap-2">
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
              </div>
            </div>
          ))}

          {!users.length ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 px-4 py-6 text-sm text-slate-400">
              暂无用户
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
