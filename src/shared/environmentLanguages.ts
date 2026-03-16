export const SUPPORTED_ENVIRONMENT_LANGUAGES = [
  'zh-CN',
  'zh-TW',
  'en-US',
  'ja-JP',
  'ko-KR',
] as const

export type SupportedEnvironmentLanguage =
  (typeof SUPPORTED_ENVIRONMENT_LANGUAGES)[number]

export const DEFAULT_ENVIRONMENT_LANGUAGE: SupportedEnvironmentLanguage = 'en-US'

export function isSupportedEnvironmentLanguage(
  value: string | undefined | null,
): value is SupportedEnvironmentLanguage {
  return SUPPORTED_ENVIRONMENT_LANGUAGES.includes(
    value as SupportedEnvironmentLanguage,
  )
}

export function normalizeEnvironmentLanguage(
  value: string | undefined | null,
  fallback: SupportedEnvironmentLanguage = DEFAULT_ENVIRONMENT_LANGUAGE,
): SupportedEnvironmentLanguage {
  return isSupportedEnvironmentLanguage(value) ? value : fallback
}
