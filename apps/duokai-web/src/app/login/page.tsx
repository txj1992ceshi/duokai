'use client'

import Link from 'next/link'
import { Button, Card, Input } from '@duokai/ui'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--web-bg)] px-6 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.16),transparent_24%)]" />
      <Card className="relative z-10 w-full max-w-md rounded-[32px] border-white/10 bg-[rgba(10,18,36,0.86)] p-8 shadow-[0_30px_80px_rgba(2,6,23,0.45)] backdrop-blur-2xl">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">Duokai Console</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">登录 Web 前台</h1>
          <p className="mt-3 text-sm text-slate-400">
            第一阶段以前台联调为主，登录后将进入新的矩阵控制台工作区。
          </p>
        </div>
        <div className="space-y-4">
          <Input placeholder="邮箱 / 用户名" />
          <Input type="password" placeholder="密码" />
          <Button className="h-11 w-full" variant="primary">
            模拟登录
          </Button>
        </div>
        <div className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-slate-300">
          真实鉴权接口将在后续联调阶段接入。本页先用于确认新的视觉与登录入口路径。
        </div>
        <Link
          href="/"
          className="mt-6 inline-flex text-sm font-medium text-sky-300 transition-colors hover:text-sky-200"
        >
          返回控制台预览
        </Link>
      </Card>
    </main>
  )
}
