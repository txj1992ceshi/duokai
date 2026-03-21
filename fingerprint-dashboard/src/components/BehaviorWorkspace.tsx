'use client';

import { Loader2, Play, Plus, Trash2, Workflow } from 'lucide-react';
import AppButton from '@/components/AppButton';
import DetailCard from '@/components/DetailCard';
import PageHeader from '@/components/PageHeader';
import type { Behavior, BehaviorAction, Profile } from '@/lib/dashboard-types';

type Props = {
  behaviors: Behavior[];
  selectedBehavior: Behavior | null;
  profiles: Profile[];
  targetSessionId: string;
  executingBehaviorId: string | null;
  execLogs: string[];
  onSelectBehavior: (behavior: Behavior) => void;
  onDeleteBehavior: (id: string) => void;
  onTargetSessionChange: (value: string) => void;
  onRunBehavior: () => void;
  onOpenCreate: () => void;
  onUpdateActions: (actions: BehaviorAction[]) => void;
};

export default function BehaviorWorkspace({
  behaviors,
  selectedBehavior,
  profiles,
  targetSessionId,
  executingBehaviorId,
  execLogs,
  onSelectBehavior,
  onDeleteBehavior,
  onTargetSessionChange,
  onRunBehavior,
  onOpenCreate,
  onUpdateActions,
}: Props) {
  return (
    <div className="animate-in slide-in-from-bottom-2 flex h-full flex-col fade-in duration-300">
      <PageHeader
        title="自动化流程 (RPA)"
        description="托管点击、填表、登录等自动化脚本。"
        actions={
          <AppButton onClick={onOpenCreate} variant="primary" size="sm">
            <Plus size={14} />
            <span>新建流程</span>
          </AppButton>
        }
      />

      <div className="flex min-h-0 flex-1 space-x-5 overflow-hidden">
        <div className="flex w-64 shrink-0 flex-col space-y-3">
          <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto pr-1">
            {behaviors.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 py-10 text-center">
                <p className="text-xs text-slate-500">暂无流程</p>
              </div>
            ) : (
              behaviors.map((behavior) => (
                <div
                  key={behavior.id}
                  onClick={() => onSelectBehavior(behavior)}
                  className={`group cursor-pointer rounded-xl border p-3 transition-all ${
                    selectedBehavior?.id === behavior.id
                      ? 'border-blue-500/40 bg-blue-600/10'
                      : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Workflow
                        size={14}
                        className={
                          selectedBehavior?.id === behavior.id
                            ? 'text-blue-400'
                            : 'text-slate-500'
                        }
                      />
                      <span className="max-w-[120px] truncate text-xs font-bold">
                        {behavior.name}
                      </span>
                    </div>
                    <AppButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteBehavior(behavior.id);
                      }}
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 px-0 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </AppButton>
                  </div>
                  <p className="line-clamp-1 text-[10px] text-slate-500">
                    {behavior.description || '无描述'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedBehavior ? (
            <div className="flex h-full flex-col space-y-4 overflow-hidden">
              <DetailCard className="shrink-0 bg-slate-900/20 p-4" title="流程控制">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-slate-400">运行目标:</span>
                      <select
                        value={targetSessionId}
                        onChange={(e) => onTargetSessionChange(e.target.value)}
                        className="w-48 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">选择运行中的环境...</option>
                        {profiles
                          .filter((profile) => profile.status === 'Running')
                          .map((profile) => (
                            <option key={profile.id} value={profile.runtimeSessionId}>
                              {profile.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <AppButton
                      onClick={onRunBehavior}
                      disabled={!targetSessionId || !!executingBehaviorId}
                      variant={!targetSessionId || !!executingBehaviorId ? 'secondary' : 'primary'}
                      size="sm"
                      className={
                        !targetSessionId || !!executingBehaviorId
                          ? ''
                          : 'bg-green-600 text-white shadow-green-500/20 hover:bg-green-500'
                      }
                    >
                      {executingBehaviorId ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Play size={14} fill="currentColor" />
                      )}
                      <span>{executingBehaviorId ? '正在运行...' : '立即启动'}</span>
                    </AppButton>
                  </div>
                </div>
              </DetailCard>

              <div className="flex min-h-0 flex-1 space-x-4 overflow-hidden">
                <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950 font-mono text-[11px] shadow-inner shadow-black">
                  <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 py-2">
                    <span className="font-sans text-[10px] font-bold tracking-wider text-slate-400">
                      脚本配置 (JSON)
                    </span>
                    <div className="flex space-x-1">
                      <div className="h-2.5 w-2.5 rounded-full bg-red-500/20" />
                      <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/20" />
                      <div className="h-2.5 w-2.5 rounded-full bg-green-500/20" />
                    </div>
                  </div>
                  <textarea
                    value={JSON.stringify(selectedBehavior.actions, null, 2)}
                    onChange={(e) => {
                      try {
                        const value = JSON.parse(e.target.value);
                        if (Array.isArray(value)) {
                          onUpdateActions(value as BehaviorAction[]);
                        }
                      } catch {}
                    }}
                    className="custom-scrollbar flex-1 resize-none bg-transparent p-4 leading-relaxed text-blue-400 outline-none"
                    spellCheck={false}
                  />
                </div>

                <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
                  <div className="shrink-0 border-b border-slate-800 bg-slate-800/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    执行日志
                  </div>
                  <div className="custom-scrollbar flex-1 space-y-1.5 overflow-y-auto p-3 font-mono text-[10px]">
                    {execLogs.length === 0 ? (
                      <div className="italic text-slate-600">等待任务运行...</div>
                    ) : (
                      execLogs.map((log, index) => (
                        <div
                          key={index}
                          className={`break-words ${
                            log.includes('❌')
                              ? 'text-red-400'
                              : log.includes('✅')
                                ? 'text-green-400'
                                : 'text-slate-500'
                          }`}
                        >
                          {log}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <DetailCard className="flex h-full items-center justify-center border-dashed">
              <div className="space-y-3 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900">
                  <Workflow size={20} className="text-slate-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-400">
                    选择或创建一个流程以开始
                  </p>
                  <p className="mt-1 max-w-[240px] text-[11px] text-slate-600">
                    通过编写简单的脚本步骤，您可以自动化完成重复性的浏览器操作。
                  </p>
                </div>
                <AppButton onClick={onOpenCreate} variant="secondary" size="sm">
                  创建第一个流程
                </AppButton>
              </div>
            </DetailCard>
          )}
        </div>
      </div>
    </div>
  );
}
