'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppButton from '@/components/AppButton';
import AppInput from '@/components/AppInput';
import ErrorBanner from '@/components/ErrorBanner';

const API_BASE =
  (process.env.NEXT_PUBLIC_DUOKAI_API_BASE || 'http://localhost:3100').replace(/\/$/, '');

export default function AdminLoginPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '登录失败');
        return;
      }

      localStorage.setItem('duokai_admin_token', data.token);
      localStorage.setItem('duokai_admin_user', JSON.stringify(data.user));

      router.push('/');
      router.refresh();
    } catch {
      setError(`无法连接登录接口，请确认主站 API 可达：${API_BASE}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#101728_0%,#050914_45%,#02040a_100%)] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-90px] top-[-60px] h-[280px] w-[280px] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute right-[-120px] top-[10%] h-[320px] w-[320px] rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute bottom-[-100px] left-[10%] h-[300px] w-[300px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-[8%] right-[12%] h-[220px] w-[220px] rounded-full bg-violet-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:44px_44px] opacity-20" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="hidden items-center lg:flex">
            <div className="max-w-xl">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-cyan-100/80 backdrop-blur-md">
                独立管理中控后台
              </div>

              <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight">
                Duokai 管理中控
              </h1>

              <p className="mt-5 max-w-lg text-base leading-7 text-white/65">
                统一管理用户、环境、运行状态、登录态同步与系统设置。面向管理员提供全局视角与集中控制能力。
              </p>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
                  <div className="text-sm text-white/55">模块</div>
                  <div className="mt-2 text-lg font-semibold">用户管理</div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    创建账号、启用禁用、角色切换、密码重置与删除。
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
                  <div className="text-sm text-white/55">模块</div>
                  <div className="mt-2 text-lg font-semibold">环境总览</div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    查看全局环境、归属关系、同步状态与详情信息。
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
                  <div className="text-sm text-white/55">模块</div>
                  <div className="mt-2 text-lg font-semibold">运行监控</div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    查看 Runtime 在线状态、会话详情与关键运行信息。
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex items-center justify-center">
            <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/8 p-8 shadow-2xl shadow-black/30 backdrop-blur-2xl">
              <div className="mb-8">
                <div className="text-sm text-cyan-200/80">仅管理员可访问</div>
                <h2 className="mt-2 text-3xl font-bold tracking-tight">
                  登录管理中控
                </h2>
                <p className="mt-3 text-sm leading-6 text-white/65">
                  登录 Duokai 管理后台，进入全局用户、环境与运行控制视图。
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <AppInput
                  label="邮箱或账号"
                  className="h-14 rounded-2xl border-white/12 bg-slate-950/55 focus:bg-slate-950/70"
                  type="text"
                  placeholder="请输入管理员邮箱或账号"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />

                <AppInput
                  label="密码"
                  className="h-14 rounded-2xl border-white/12 bg-slate-950/55 focus:bg-slate-950/70"
                  type="password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <ErrorBanner message={error} />

                <AppButton
                  type="submit"
                  disabled={loading}
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                >
                  {loading ? '登录中...' : '登录'}
                </AppButton>
              </form>

              <div className="mt-6 text-center text-xs leading-6 text-white/45">
                请使用管理员账号登录。普通用户无权进入中控后台。
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
