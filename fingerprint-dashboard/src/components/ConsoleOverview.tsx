'use client'

import React from 'react'
import {
  AlertCircle,
  CheckCircle,
  Globe,
  Network,
  ShieldCheck,
} from 'lucide-react'
import PageHeader from '@/components/PageHeader'

type StatItem = {
  title: string
  value: string
  sub: string
  icon: React.ElementType
  color: string
}

type ActivityItem = {
  text: string
  time: string
  ok: boolean
}

type Props = {
  stats: StatItem[]
  activities: ActivityItem[]
}

function StatCard({ title, value, sub, icon: Icon, color }: StatItem) {
  const SafeIcon = Icon || Globe
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
          <p className="text-3xl font-bold">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{sub}</p>
        </div>
        <div className={`rounded-lg p-2.5 ${color}`}>
          <SafeIcon size={18} strokeWidth={1.8} />
        </div>
      </div>
    </div>
  )
}

export default function ConsoleOverview({ stats, activities }: Props) {
  const safeStats =
    stats.length > 0
      ? stats
      : [
          {
            title: '活跃环境',
            value: '0',
            sub: '共 0 个环境',
            icon: Globe,
            color: 'bg-blue-500/10 text-blue-400',
          },
          {
            title: '可用代理',
            value: '0',
            sub: '共 0 个节点',
            icon: Network,
            color: 'bg-purple-500/10 text-purple-400',
          },
          {
            title: '指纹健康度',
            value: '0%',
            sub: '平均安全得分',
            icon: ShieldCheck,
            color: 'bg-green-500/10 text-green-400',
          },
        ]

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="控制台"
        description="查看环境、代理与整体运行健康度。"
      />

      <div className="grid grid-cols-3 gap-4">
        {safeStats.map((item) => (
          <StatCard key={item.title} {...item} />
        ))}
      </div>

      <div className="rounded-2xl border border-white/8 bg-slate-900/55 p-6 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="mb-1 text-base font-semibold text-slate-100">系统活动日志</div>
        <div className="mb-4 text-sm text-slate-400">最近的系统事件与运行反馈。</div>
        <div className="space-y-3">
          {activities.map((item, index) => (
            <div
              key={`${item.text}-${index}`}
              className="flex items-center space-x-3 border-b border-slate-800/50 py-2 last:border-0"
            >
              {item.ok ? (
                <CheckCircle size={14} className="flex-shrink-0 text-green-500" />
              ) : (
                <AlertCircle size={14} className="flex-shrink-0 text-red-400" />
              )}
              <span className="flex-1 text-sm">{item.text}</span>
              <span className="text-xs text-slate-500">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
