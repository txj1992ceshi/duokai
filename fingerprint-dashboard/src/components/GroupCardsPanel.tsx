'use client'

import React from 'react'
import { ChevronRight, Pencil, Plus, Trash2, Users } from 'lucide-react'
import AppButton from '@/components/AppButton'
import PageHeader from '@/components/PageHeader'
import type { GroupItem, Profile } from '@/lib/dashboard-types'

type Props = {
  groups: GroupItem[]
  profiles: Profile[]
  onSelectGroup: (groupId: string) => void
  onCreateGroup: () => void
  onEditGroup: (group: GroupItem) => void
  onDeleteGroup: (id: string, e: React.MouseEvent<HTMLButtonElement>) => void
}

export default function GroupCardsPanel({
  groups,
  profiles,
  onSelectGroup,
  onCreateGroup,
  onEditGroup,
  onDeleteGroup,
}: Props) {
  return (
    <>
      <PageHeader
        title="团队分组管理"
        description="将环境按业务归类，批量管理更高效。"
        actions={
          <AppButton onClick={onCreateGroup} variant="primary" size="sm">
            <Plus size={13} />
            <span>新建分组</span>
          </AppButton>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {groups.map((group) => (
          <div
            key={group.id}
            onClick={() => onSelectGroup(group.id)}
            className="glass group relative cursor-pointer rounded-xl p-5 transition-all hover:border-slate-500 hover:shadow-lg"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className={`rounded-lg border p-2 ${group.color}`}>
                <Users size={16} />
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditGroup(group)
                  }}
                  className="rounded p-1 text-slate-500 opacity-0 transition-all hover:bg-blue-500/10 hover:text-blue-400 group-hover:opacity-100"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={(e) => onDeleteGroup(group.id, e)}
                  className="rounded p-1 text-slate-500 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
                <ChevronRight size={14} className="text-slate-600 transition-colors group-hover:text-slate-400" />
              </div>
            </div>
            <p className="text-sm font-bold">{group.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {profiles.filter((profile) => profile.groupId === group.id).length} 个环境
            </p>
          </div>
        ))}

        <AppButton
          onClick={onCreateGroup}
          variant="ghost"
          className="glass min-h-[110px] flex-col space-y-2 rounded-xl border-2 border-dashed border-slate-700 p-5 text-slate-500 hover:border-slate-500 hover:text-slate-300"
        >
          <Plus size={20} strokeWidth={1.5} />
          <span className="text-xs font-medium">新建自定义分组</span>
        </AppButton>
      </div>
    </>
  )
}
