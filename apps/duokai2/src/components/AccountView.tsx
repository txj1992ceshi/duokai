import type { Dispatch, SetStateAction } from 'react'
import { Badge, Button, Card, Input, Textarea } from '@duokai/ui'
import i18nClient from '../lib/i18n-client'
import type {
  AccountPasswordFormState,
  AccountProfileFormState,
} from '../hooks/useAccountWorkspace'
import type { AuthUser } from '../shared/types'

export function AccountView({
  locale,
  currentAuthUser,
  accountProfileForm,
  setAccountProfileForm,
  accountPasswordForm,
  setAccountPasswordForm,
  formatDate,
  onSaveProfile,
  onUploadAvatar,
  onSavePassword,
  onSyncEnvironmentConfig,
  onRevokeDevice,
  onDeleteDevice,
}: {
  locale: string
  currentAuthUser: AuthUser | null
  accountProfileForm: AccountProfileFormState
  setAccountProfileForm: Dispatch<SetStateAction<AccountProfileFormState>>
  accountPasswordForm: AccountPasswordFormState
  setAccountPasswordForm: Dispatch<SetStateAction<AccountPasswordFormState>>
  formatDate: (value: string | null) => string
  onSaveProfile: () => void
  onUploadAvatar: () => void
  onSavePassword: () => void
  onSyncEnvironmentConfig: () => void
  onRevokeDevice: (deviceId: string) => void
  onDeleteDevice: (deviceId: string) => void
}) {
  const desktopT = i18nClient.getFixedT(locale, 'desktop')

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <Card className="rounded-[28px] border border-slate-200 shadow-none">
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center gap-4">
              {currentAuthUser?.avatarUrl ? (
                <img
                  className="h-20 w-20 rounded-[24px] object-cover"
                  src={currentAuthUser.avatarUrl}
                  alt="avatar"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-slate-100 text-2xl font-semibold text-slate-500">
                  {(currentAuthUser?.name || currentAuthUser?.username || currentAuthUser?.email || 'U')
                    .slice(0, 1)
                    .toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-2xl font-semibold tracking-tight text-slate-950">
                  {currentAuthUser?.name || currentAuthUser?.username || currentAuthUser?.email}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {currentAuthUser?.email || currentAuthUser?.username}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone="primary">{currentAuthUser?.role || '-'}</Badge>
                  <Badge tone="neutral">{currentAuthUser?.status || '-'}</Badge>
                  <Badge tone="neutral">
                    {desktopT('account.devices')} {currentAuthUser?.devices?.length ?? 0}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                [desktopT('account.fields.accountId'), currentAuthUser?.id || '-'],
                [desktopT('account.fields.username'), currentAuthUser?.username || '-'],
                [desktopT('account.fields.email'), currentAuthUser?.email || '-'],
                [desktopT('account.fields.role'), currentAuthUser?.role || '-'],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-400">{label}</div>
                  <div className="mt-1 text-sm text-slate-700">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="rounded-[28px] border border-slate-200 shadow-none">
          <div className="space-y-4 p-5">
            <div>
              <div className="text-sm font-medium text-slate-500">{desktopT('account.subscription.title')}</div>
              <div className="mt-1 text-sm text-slate-500">
                {desktopT('account.subscription.description')}
              </div>
            </div>
            <Button type="button" variant="secondary" onClick={onSyncEnvironmentConfig}>
              {desktopT('account.syncConfig.action')}
            </Button>
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.12em] text-slate-400">
                  {desktopT('account.subscription.plan')}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {currentAuthUser?.subscription?.plan || 'free'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.12em] text-slate-400">
                  {desktopT('account.syncConfig.title')}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {desktopT('account.syncConfig.description')}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.12em] text-slate-400">
                  {desktopT('account.subscription.status')}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {currentAuthUser?.subscription?.status || 'free'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.12em] text-slate-400">
                  {desktopT('account.subscription.expiresAt')}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  {formatDate(currentAuthUser?.subscription?.expiresAt || null)}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <Card className="rounded-[28px] border border-slate-200 shadow-none">
          <div className="space-y-5 p-5">
            <div>
              <div className="text-sm font-medium text-slate-500">{desktopT('account.profile.title')}</div>
              <div className="mt-1 text-sm text-slate-500">
                {desktopT('account.profile.description')}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                value={accountProfileForm.name}
                onChange={(event) =>
                  setAccountProfileForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder={desktopT('account.profile.name')}
              />
              <Input
                value={accountProfileForm.username}
                onChange={(event) =>
                  setAccountProfileForm((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                placeholder={desktopT('account.profile.username')}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[260px] flex-1">
                <Input
                  value={accountProfileForm.avatarUrl}
                  onChange={(event) =>
                    setAccountProfileForm((current) => ({
                      ...current,
                      avatarUrl: event.target.value,
                    }))
                  }
                  placeholder="https://example.com/avatar.png"
                />
              </div>
              <Button type="button" variant="secondary" onClick={onUploadAvatar}>
                {desktopT('account.profile.uploadImage')}
              </Button>
            </div>
            <Input
              value={accountProfileForm.email}
              onChange={(event) =>
                setAccountProfileForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder={desktopT('account.profile.email')}
            />
            <Textarea
              rows={4}
              value={accountProfileForm.bio}
              onChange={(event) =>
                setAccountProfileForm((current) => ({ ...current, bio: event.target.value }))
              }
              placeholder={desktopT('account.profile.bio')}
            />
            <Button variant="primary" onClick={onSaveProfile}>
              {desktopT('account.profile.save')}
            </Button>
          </div>
        </Card>

        <Card className="rounded-[28px] border border-slate-200 shadow-none">
          <div className="space-y-5 p-5">
            <div>
              <div className="text-sm font-medium text-slate-500">{desktopT('account.password.title')}</div>
              <div className="mt-1 text-sm text-slate-500">
                {desktopT('account.password.description')}
              </div>
            </div>
            <Input
              type="password"
              value={accountPasswordForm.currentPassword}
              onChange={(event) =>
                setAccountPasswordForm((current) => ({
                  ...current,
                  currentPassword: event.target.value,
                }))
              }
              placeholder={desktopT('account.password.currentPassword')}
            />
            <Input
              type="password"
              value={accountPasswordForm.nextPassword}
              onChange={(event) =>
                setAccountPasswordForm((current) => ({
                  ...current,
                  nextPassword: event.target.value,
                }))
              }
              placeholder={desktopT('account.password.newPassword')}
            />
            <Input
              type="password"
              value={accountPasswordForm.confirmPassword}
              onChange={(event) =>
                setAccountPasswordForm((current) => ({
                  ...current,
                  confirmPassword: event.target.value,
                }))
              }
              placeholder={desktopT('account.password.confirmPassword')}
            />
            <Button variant="secondary" onClick={onSavePassword}>
              {desktopT('account.password.save')}
            </Button>
          </div>
        </Card>
      </div>

      <Card className="rounded-[28px] border border-slate-200 shadow-none">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="m-0 text-lg font-semibold text-slate-950">
            {desktopT('account.devicesPanel.title')}
          </h2>
        </div>
        {currentAuthUser?.devices && currentAuthUser.devices.length > 0 ? (
          <div className="grid gap-4 p-5 xl:grid-cols-2">
            {currentAuthUser.devices.map((device) => (
              <div key={device.deviceId} className="rounded-[24px] border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-base font-semibold text-slate-950">
                    {device.deviceName || device.deviceId}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {device.isCurrent ? (
                      <Badge tone="primary">{desktopT('account.devicesPanel.currentDevice')}</Badge>
                    ) : null}
                    {device.revokedAt ? (
                      <Badge tone="warning">{desktopT('account.devicesPanel.revoked')}</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  {(device.platform || '-') + ' · ' + (device.source || '-')}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.12em] text-slate-400">
                      {desktopT('account.devicesPanel.lastLogin')}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">{formatDate(device.lastLoginAt)}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.12em] text-slate-400">
                      {desktopT('account.devicesPanel.lastSeen')}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">{formatDate(device.lastSeenAt)}</div>
                  </div>
                </div>
                {device.revokedAt ? (
                  <div className="mt-3 text-sm text-slate-500">
                    {desktopT('account.devicesPanel.revokedAt')}: {formatDate(device.revokedAt)}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button variant="secondary" type="button" onClick={() => onRevokeDevice(device.deviceId)}>
                    {device.isCurrent
                      ? desktopT('account.devicesPanel.revokeCurrent')
                      : desktopT('account.devicesPanel.revoke')}
                  </Button>
                  <Button variant="danger" type="button" onClick={() => onDeleteDevice(device.deviceId)}>
                    {desktopT('account.devicesPanel.delete')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-16 text-center text-sm text-slate-500">
            {desktopT('account.devicesPanel.empty')}
          </div>
        )}
      </Card>
    </section>
  )
}
