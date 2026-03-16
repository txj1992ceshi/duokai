/// <reference types="vite/client" />

import type { DesktopApi } from './shared/ipc'

declare global {
  const __APP_VERSION__: string

  interface Window {
    desktop: DesktopApi
  }
}
