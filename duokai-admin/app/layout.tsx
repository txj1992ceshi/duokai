'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchText, setSearchText] = useState('');
  let currentUser: { email?: string; username?: string; name?: string; role?: string } | null =
    null;

  if (typeof window !== 'undefined') {
    const userText = localStorage.getItem('duokai_admin_user');
    if (userText) {
      try {
        currentUser = JSON.parse(userText);
      } catch {
        localStorage.removeItem('duokai_admin_user');
      }
    }
  }

  function handleLogout() {
    localStorage.removeItem('duokai_admin_token');
    localStorage.removeItem('duokai_admin_user');
    router.replace('/login');
  }

  function navClass(path: string) {
    const active =
      path === '/'
        ? pathname === '/'
        : pathname === path || pathname.startsWith(`${path}/`);

    return active
      ? 'block rounded-xl bg-neutral-800 px-3 py-2 text-white'
      : 'block rounded-xl px-3 py-2 text-neutral-400 hover:text-white';
  }

  function handleGlobalSearch(e: FormEvent) {
    e.preventDefault();
    const q = searchText.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <html lang="zh-CN">
      <body className="bg-neutral-950 text-white">
        <div className="min-h-screen grid grid-cols-[240px_1fr]">
          <aside className="border-r border-neutral-800 bg-neutral-900 p-5">
            <div className="mb-8">
              <div className="text-xl font-bold">Duokai Admin</div>
              <div className="mt-1 text-xs text-neutral-400">
                独立管理中控后台
              </div>
            </div>

            <nav className="space-y-2 text-sm">
              <Link href="/" className={navClass('/')}>
                仪表盘
              </Link>
              <Link href="/users" className={navClass('/users')}>
                用户管理
              </Link>
              <Link href="/profiles" className={navClass('/profiles')}>
                环境总览
              </Link>
              <Link href="/runtime" className={navClass('/runtime')}>
                运行状态
              </Link>
              <Link href="/agents" className={navClass('/agents')}>
                Agent 管控
              </Link>
              <Link href="/storage-state" className={navClass('/storage-state')}>
                登录态同步
              </Link>
              <Link href="/settings" className={navClass('/settings')}>
                系统设置
              </Link>
            </nav>
          </aside>

          <div className="flex min-h-screen flex-col">
            <header className="border-b border-neutral-800 bg-neutral-950 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-neutral-300">管理控制台</div>
                <form onSubmit={handleGlobalSearch} className="mx-6 flex-1 max-w-xl">
                  <input
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none"
                    placeholder="搜索用户、环境、代理、邮箱、账号..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                </form>
                <div className="flex items-center">
                  <div className="mr-3 text-sm text-neutral-400">
                    {currentUser?.name || currentUser?.email || currentUser?.username || 'Admin'}
                    {currentUser?.role ? ` (${currentUser.role})` : ''}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300"
                  >
                    退出登录
                  </button>
                </div>
              </div>
            </header>

            <main className="flex-1 px-6 py-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
