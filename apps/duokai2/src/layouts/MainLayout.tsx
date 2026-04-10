import type { CSSProperties, ReactNode } from 'react'
import { Badge, Breadcrumb, Button, Card } from '@duokai/ui'
import { LayoutDashboard, Layers3, Logs, Settings, Shield, UserCircle2 } from 'lucide-react'
import type { DesktopRuntimeInfo } from '../shared/types'

export type MainNavKey = 'environmentCenter' | 'proxyRepository' | 'groupManagement' | 'settings'

export interface MainNavItem {
  key: MainNavKey
  label: string
  active: boolean
  attentionDot?: boolean
  onClick: () => void
}

export interface SecondaryNavItem {
  key: 'logs' | 'account'
  label: string
  active: boolean
  onClick: () => void
}

const navIcons = {
  environmentCenter: LayoutDashboard,
  proxyRepository: Shield,
  groupManagement: Layers3,
  settings: Settings,
  logs: Logs,
  account: UserCircle2,
}

function SidebarButton({
  label,
  active,
  attentionDot,
  onClick,
  icon: Icon,
}: {
  label: string
  active: boolean
  attentionDot?: boolean
  onClick: () => void
  icon: typeof LayoutDashboard
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition-colors ${
        active
          ? 'bg-blue-600 text-white shadow-[0_16px_36px_rgba(37,99,235,0.28)]'
          : 'text-slate-400 hover:bg-slate-900 hover:text-white'
      }`}
    >
      <Icon size={18} />
      <span className="flex items-center gap-2 font-medium">
        <span>{label}</span>
        {attentionDot ? (
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-white' : 'bg-rose-500'}`}
          />
        ) : null}
      </span>
    </button>
  )
}

export function MainLayout({
  title,
  subtitle,
  shellTitle,
  shellSubtitle,
  breadcrumbItems,
  mainNav,
  secondaryNav,
  statusText,
  userTitle,
  userSubtitle,
  logoutLabel,
  onLogout,
  actions,
  rendererOperatingSystem,
  runtimeInfo,
  children,
}: {
  title: string
  subtitle: string
  shellTitle: string
  shellSubtitle: string
  breadcrumbItems: Array<{ label: string; current?: boolean }>
  mainNav: MainNavItem[]
  secondaryNav: SecondaryNavItem[]
  statusText: string
  userTitle: string
  userSubtitle: string
  logoutLabel: string
  onLogout: () => void
  actions?: ReactNode
  rendererOperatingSystem?: string
  runtimeInfo?: DesktopRuntimeInfo | null
  children: ReactNode
}) {
  const isMacOS = rendererOperatingSystem === 'macOS'
  const windowFrame = runtimeInfo?.windowFrame
  const isWindows = windowFrame?.platform === 'win32'
  const dragRegionStyle = { WebkitAppRegion: 'drag' } as CSSProperties
  const noDragRegionStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties
  const titleBarOverlayHeight = windowFrame?.titleBarOverlayHeight ?? 0
  const windowControlsRightInset = isWindows ? Math.max(windowFrame?.windowControlsRightInset ?? 0, 0) : 0
  const shellStyle = {
    '--desktop-titlebar-height': `${titleBarOverlayHeight}px`,
    '--desktop-window-controls-right-inset': `${windowControlsRightInset}px`,
  } as CSSProperties
  const headerStyle = {
    ...dragRegionStyle,
    paddingRight: `calc(2rem + var(--desktop-window-controls-right-inset))`,
    minHeight: `${Math.max(64, titleBarOverlayHeight + 24)}px`,
  } as CSSProperties
  const mainStyle = {
    paddingTop: `max(2rem, calc(var(--desktop-titlebar-height) * 0.5))`,
  } as CSSProperties

  return (
    <div
      className="duokai-app-shell flex h-screen overflow-hidden bg-[var(--duokai-bg)] text-slate-900"
      style={shellStyle}
    >
      <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-slate-800 bg-[var(--duokai-sidebar)] px-4 py-5 text-white">
        {isMacOS ? <div className="h-8 shrink-0" style={dragRegionStyle} /> : null}
        <div className="mb-6 flex items-center gap-3 px-2" style={noDragRegionStyle}>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 font-bold text-white">
            D
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">{shellTitle}</div>
            <div className="text-xs text-slate-400">{shellSubtitle}</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-2" style={noDragRegionStyle}>
          {mainNav.map((item) => (
            <SidebarButton
              key={item.key}
              label={item.label}
              active={item.active}
              attentionDot={item.attentionDot}
              onClick={item.onClick}
              icon={navIcons[item.key]}
            />
          ))}

          <div className="mt-6 border-t border-slate-800 pt-4">
            {secondaryNav.map((item) => (
              <SidebarButton
                key={item.key}
                label={item.label}
                active={item.active}
                onClick={item.onClick}
                icon={navIcons[item.key]}
              />
            ))}
          </div>
        </nav>

        <Card
          className="rounded-[24px] border-slate-800 bg-white/10 p-4 text-white shadow-none"
          style={noDragRegionStyle}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/80 font-semibold">
              {userTitle.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{userTitle}</div>
              <div className="truncate text-xs text-slate-300">{userSubtitle}</div>
            </div>
          </div>
          <Button className="mt-4 w-full" variant="secondary" onClick={onLogout}>
            {logoutLabel}
          </Button>
        </Card>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-slate-200 bg-[var(--duokai-surface-glass-strong)] px-8 backdrop-blur-xl"
          style={headerStyle}
        >
          <div className="min-w-0 space-y-1">
            <Breadcrumb items={breadcrumbItems} />
            <div className="text-xs text-slate-500">{subtitle}</div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3" style={noDragRegionStyle}>
            <Badge tone="primary" className="px-3 py-1.5 text-xs">
              {statusText}
            </Badge>
            {actions}
          </div>
        </header>

        <main
          className="duokai-app-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-8 py-8"
          style={mainStyle}
        >
          <div className="mb-6">
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
            <p className="mt-2 mb-0 max-w-3xl text-sm text-slate-500">{subtitle}</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}
