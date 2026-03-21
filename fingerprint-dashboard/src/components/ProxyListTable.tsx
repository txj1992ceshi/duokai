'use client'

import React from 'react'
import { Loader2, MapPin, RefreshCcw, Trash2, Upload, Zap } from 'lucide-react'
import AppButton from '@/components/AppButton'
import PageHeader from '@/components/PageHeader'
import type { ProxyListItem } from '@/lib/dashboard-types'

type Props = {
  proxies: ProxyListItem[]
  testingProxyId: string | null
  onImport: () => void
  onCheckAll: () => void
  onTestProxy: (proxy: ProxyListItem) => void
  onDeleteProxy: (proxyId: string) => void
}

export default function ProxyListTable({
  proxies,
  testingProxyId,
  onImport,
  onCheckAll,
  onTestProxy,
  onDeleteProxy,
}: Props) {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <PageHeader
        title="代理节点管理"
        description="统一导入并管理您的代理 IP 池。"
        actions={
          <>
            <AppButton onClick={onImport} variant="primary" size="sm">
              <Upload size={12} />
              <span>批量导入</span>
            </AppButton>
            <AppButton onClick={onCheckAll} variant="secondary" size="sm">
              <RefreshCcw size={12} />
              <span>全部网关检测</span>
            </AppButton>
          </>
        }
      />

      <div className="glass rounded-xl p-5">
        <h3 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">节点列表</h3>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 text-slate-500">
            <tr>
              <th className="pb-3 text-xs font-semibold">服务器地址</th>
              <th className="pb-3 text-xs font-semibold">协议</th>
              <th className="pb-3 text-xs font-semibold">归属地</th>
              <th className="pb-3 text-xs font-semibold">延迟</th>
              <th className="pb-3 text-xs font-semibold">状态</th>
              <th className="pb-3 text-right text-xs">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {proxies.map((proxy) => (
              <tr key={proxy.id} className="group transition-colors hover:bg-slate-800/20">
                <td className="py-3.5 font-mono text-xs text-blue-400">
                  {proxy.host}:{proxy.port}
                </td>
                <td className="py-3.5">
                  <span className="rounded bg-slate-700/60 px-2 py-0.5 text-xs font-mono">{proxy.type}</span>
                </td>
                <td className="flex items-center space-x-1.5 py-3.5 pt-4 text-sm">
                  <MapPin size={11} className="text-slate-500" />
                  <span>{proxy.city}</span>
                </td>
                <td className="py-3.5">
                  <span className="flex items-center space-x-1 text-xs text-green-400">
                    <Zap size={11} />
                    <span>{proxy.delay}</span>
                  </span>
                </td>
                <td className="py-3.5">
                  <span
                    className={`inline-flex items-center space-x-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      proxy.status === '网关可达'
                        ? 'bg-green-500/10 text-green-400'
                        : proxy.status === '未检测'
                          ? 'bg-slate-700/50 text-slate-400'
                          : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {proxy.status === '网关可达' && <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />}
                    <span>{proxy.status}</span>
                  </span>
                </td>
                <td className="flex justify-end space-x-2 py-3.5 text-right">
                  <AppButton
                    onClick={() => onTestProxy(proxy)}
                    disabled={testingProxyId === proxy.id}
                    variant="ghost"
                    size="sm"
                    className={testingProxyId === proxy.id ? 'text-slate-400' : 'text-blue-400 hover:bg-blue-500/10 hover:text-blue-300'}
                  >
                    {testingProxyId === proxy.id ? <Loader2 size={12} className="animate-spin" /> : null}
                    <span>{testingProxyId === proxy.id ? '检测中' : '网关检测'}</span>
                  </AppButton>
                  <AppButton
                    onClick={() => onDeleteProxy(proxy.id)}
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 px-0 text-slate-500 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 size={13} />
                  </AppButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
