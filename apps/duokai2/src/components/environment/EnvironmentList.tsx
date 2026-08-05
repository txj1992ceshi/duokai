import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@duokai/ui'
import type { EnvironmentListItem } from '../../lib/desktop-types'
import { EmptyState } from '../feedback/EmptyState'
import { EnvironmentRow } from './EnvironmentRow'

export function EnvironmentList({
  groups,
  selectedIds,
  onToggleSelect,
  onCreate,
  onUploadConfig,
  onPullConfig,
  onUploadStorageState,
  onPullStorageState,
  onEdit,
  onClone,
  onLaunch,
  onStop,
  onDelete,
  onMoveToNurture,
  onMoveToOperation,
}: {
  groups: Array<{ name: string; items: EnvironmentListItem[] }>
  selectedIds: string[]
  onToggleSelect: (profileId: string) => void
  onCreate: () => void
  onUploadConfig: (profileId: string) => void
  onPullConfig: (profileId: string) => void
  onUploadStorageState: (profileId: string) => void
  onPullStorageState: (profileId: string) => void
  onEdit: (profileId: string) => void
  onClone: (profileId: string) => void
  onLaunch: (profileId: string) => void
  onStop: (profileId: string) => void
  onDelete: (profileId: string) => void
  onMoveToNurture: (profileId: string) => void
  onMoveToOperation: (profileId: string) => void
}) {
  const { t } = useTranslation('desktop')
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const totalCount = groups.reduce((sum, group) => sum + group.items.length, 0)
  if (totalCount === 0) {
    return (
      <EmptyState
        title={t('environment.emptyTitle')}
        description={t('environment.emptyDescription')}
        actionLabel={t('environment.createAction')}
        onAction={onCreate}
      />
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <Card key={group.name} className="overflow-hidden rounded-[24px] border border-slate-200 shadow-none">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="m-0 text-xl font-semibold text-slate-900">{group.name}</h3>
          </div>
          <div>
            {group.items.map((item) => (
              <div key={item.id}>
                <EnvironmentRow
                  item={item}
                  expanded={expandedIds.includes(item.id)}
                  selected={selectedIds.includes(item.id)}
                  onToggleSelect={() => onToggleSelect(item.id)}
                  onToggleExpanded={() =>
                    setExpandedIds((current) =>
                      current.includes(item.id)
                        ? current.filter((entry) => entry !== item.id)
                        : [...current, item.id],
                    )
                  }
                  onEdit={() => onEdit(item.id)}
                  onClone={() => onClone(item.id)}
                  onUploadConfig={() => onUploadConfig(item.id)}
                  onPullConfig={() => onPullConfig(item.id)}
                  onUploadStorageState={() => onUploadStorageState(item.id)}
                  onPullStorageState={() => onPullStorageState(item.id)}
                  onLaunch={() => onLaunch(item.id)}
                  onStop={() => onStop(item.id)}
                  onDelete={() => onDelete(item.id)}
                  onMoveToNurture={() => onMoveToNurture(item.id)}
                  onMoveToOperation={() => onMoveToOperation(item.id)}
                />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
