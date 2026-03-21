'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBase } from '@/lib/api-client';
import AppButton from '@/components/AppButton';
import AppInput from '@/components/AppInput';
import NoticeBanner from '@/components/NoticeBanner';

export default function LoginPage() {
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
      const res = await fetch(`${getApiBase()}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '登录失败');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      router.push('/');
      router.refresh();
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#0f2859_0%,#07142b_40%,#020817_100%)] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-120px] top-[-80px] h-[320px] w-[320px] rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute right-[-80px] top-[12%] h-[260px] w-[260px] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute bottom-[-120px] left-[18%] h-[340px] w-[340px] rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute bottom-[10%] right-[12%] h-[220px] w-[220px] rounded-full bg-sky-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:42px_42px] opacity-20" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="hidden items-center lg:flex">
            <div className="max-w-xl">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-blue-100/90 backdrop-blur-md">
                统一管理浏览器环境、登录态与运行控制
              </div>

              <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight">
                军伙工作台
              </h1>

              <p className="mt-5 max-w-lg text-base leading-7 text-white/70">
                一个更清晰、更统一的浏览器环境管理平台。集中处理环境配置、代理设置、指纹参数、
                登录态同步与运行控制。
              </p>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
                  <div className="text-sm text-white/55">能力</div>
                  <div className="mt-2 text-lg font-semibold">环境管理</div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    统一管理代理、指纹、启动参数与环境配置。
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
                  <div className="text-sm text-white/55">能力</div>
                  <div className="mt-2 text-lg font-semibold">登录态同步</div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    支持环境登录态保存、回填与跨设备延续使用。
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
                  <div className="text-sm text-white/55">能力</div>
                  <div className="mt-2 text-lg font-semibold">运行控制</div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    启动、停止与状态查看都集中在同一工作台内完成。
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex items-center justify-center">
            <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/8 p-8 shadow-2xl shadow-black/30 backdrop-blur-2xl">
              <div className="mb-8">
                <div className="text-sm text-blue-200/80">欢迎回来</div>
                <h2 className="mt-2 text-3xl font-bold tracking-tight">登录</h2>
                <p className="mt-3 text-sm leading-6 text-white/65">
                  登录军伙工作台，继续管理你的浏览器环境与同步数据。
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <AppInput
                  label="邮箱或账号"
                  type="text"
                  placeholder="请输入邮箱或账号"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />

                <AppInput
                  label="密码"
                  type="password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <NoticeBanner message={error} variant="error" />

                <AppButton
                  type="submit"
                  disabled={loading}
                  variant="primary"
                  size="lg"
                  fullWidth
                >
                  {loading ? '登录中...' : '登录'}
                </AppButton>
              </form>

              <div className="mt-6 text-center text-xs leading-6 text-white/45">
                登录即表示你将进入统一环境管理与同步工作台。
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
