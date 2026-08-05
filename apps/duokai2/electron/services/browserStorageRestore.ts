export type BrowserStorageStateLike = {
  cookies?: Array<Record<string, unknown>>
  origins?: Array<{
    origin: string
    localStorage?: Array<{ name: string; value: string }>
  }>
}

interface RestorePageLike {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>
  evaluate<Result, Argument>(
    callback: (argument: Argument) => Result | Promise<Result>,
    argument: Argument,
  ): Promise<Result>
  bringToFront?(): Promise<void>
  close?(): Promise<void>
}

export interface StorageRestoreContext<Cookie, Page extends RestorePageLike = RestorePageLike> {
  clearCookies(): Promise<void>
  addCookies(cookies: Cookie[]): Promise<void>
  pages(): Page[]
  newPage(): Promise<Page>
}

export interface StorageRestoreWarning {
  origin: string
  message: string
}

export interface StorageRestoreResult {
  restoredOrigins: number
  restoredEntries: number
  skippedOrigins: number
  helperPageCreated: boolean
  warnings: StorageRestoreWarning[]
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

export async function applyStorageStateWithoutVisibleNavigation<
  Cookie,
  Page extends RestorePageLike,
>(
  context: StorageRestoreContext<Cookie, Page>,
  state: BrowserStorageStateLike | null,
  options: {
    restoreOrigins?: boolean
    visiblePage?: Page | null
    navigationTimeoutMs?: number
    onWarning?: (warning: StorageRestoreWarning) => void
  } = {},
): Promise<StorageRestoreResult> {
  const warnings: StorageRestoreWarning[] = []
  const warn = (warning: StorageRestoreWarning) => {
    warnings.push(warning)
    options.onWarning?.(warning)
  }

  if (!state) {
    return {
      restoredOrigins: 0,
      restoredEntries: 0,
      skippedOrigins: 0,
      helperPageCreated: false,
      warnings,
    }
  }

  await context.clearCookies()
  if (Array.isArray(state.cookies) && state.cookies.length > 0) {
    await context.addCookies(state.cookies as Cookie[])
  }

  const origins = Array.isArray(state.origins)
    ? state.origins.filter(
        (item) =>
          Boolean(item?.origin) &&
          Array.isArray(item.localStorage) &&
          item.localStorage.length > 0,
      )
    : []
  if (origins.length === 0 || options.restoreOrigins === false) {
    return {
      restoredOrigins: 0,
      restoredEntries: 0,
      skippedOrigins: origins.length,
      helperPageCreated: false,
      warnings,
    }
  }

  const visiblePage = options.visiblePage ?? context.pages()[0] ?? null
  const helperPage = await context.newPage()
  await visiblePage?.bringToFront?.().catch(() => undefined)
  let restoredOrigins = 0
  let restoredEntries = 0

  try {
    for (const originState of origins) {
      const origin = normalizeOrigin(originState.origin)
      if (!origin) {
        warn({ origin: originState.origin, message: 'Storage state origin is not a valid HTTP(S) origin.' })
        continue
      }
      try {
        await helperPage.goto(origin, {
          waitUntil: 'domcontentloaded',
          timeout: options.navigationTimeoutMs ?? 15_000,
        })
        await visiblePage?.bringToFront?.().catch(() => undefined)
        const entries = originState.localStorage ?? []
        await helperPage.evaluate((values: Array<{ name: string; value: string }>) => {
          localStorage.clear()
          for (const entry of values) {
            localStorage.setItem(entry.name, entry.value)
          }
        }, entries)
        restoredOrigins += 1
        restoredEntries += entries.length
      } catch (error) {
        warn({
          origin,
          message: error instanceof Error ? error.message : String(error),
        })
      } finally {
        await visiblePage?.bringToFront?.().catch(() => undefined)
      }
    }
  } finally {
    await helperPage.close?.().catch(() => undefined)
    await visiblePage?.bringToFront?.().catch(() => undefined)
  }

  return {
    restoredOrigins,
    restoredEntries,
    skippedOrigins: 0,
    helperPageCreated: true,
    warnings,
  }
}
