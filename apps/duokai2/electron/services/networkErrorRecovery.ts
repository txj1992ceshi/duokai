export type ErrorFacts = {
  name: string
  message: string
  code: string
  causeCode: string
  stack: string
}

export type RecoverableGlobalNetworkErrorClassification = ErrorFacts & {
  recoverable: boolean
  matchedBy: string[]
  fatalDomainDeniedBy: string[]
  stackHint: string[]
  signature: string
}

type PatternRule = {
  label: string
  pattern: RegExp
}

const RECOVERABLE_NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
])

const RECOVERABLE_NETWORK_MESSAGE_RULES: PatternRule[] = [
  { label: 'message:ECONNABORTED', pattern: /\bECONNABORTED\b/i },
  { label: 'message:ECONNRESET', pattern: /\bECONNRESET\b/i },
  { label: 'message:ETIMEDOUT', pattern: /\bETIMEDOUT\b/i },
  { label: 'message:ECONNREFUSED', pattern: /\bECONNREFUSED\b/i },
  { label: 'message:EHOSTUNREACH', pattern: /\bEHOSTUNREACH\b/i },
  { label: 'message:ENETUNREACH', pattern: /\bENETUNREACH\b/i },
  { label: 'message:UND_ERR_CONNECT_TIMEOUT', pattern: /\bUND_ERR_CONNECT_TIMEOUT\b/i },
  { label: 'message:socket hang up', pattern: /\bsocket hang up\b/i },
  { label: 'message:Request timeout', pattern: /\bRequest timeout\b/i },
]

const RECOVERABLE_STACK_HINT_RULES: PatternRule[] = [
  { label: 'stack:stream_base_commons', pattern: /node:internal\/stream_base_commons/i },
  { label: 'stack:tls_socket', pattern: /\bTLSSocket\b/i },
  { label: 'stack:socket_write_generic', pattern: /\bSocket\._writeGeneric\b/i },
  { label: 'stack:fetch', pattern: /\bfetch\b/i },
  { label: 'stack:undici', pattern: /\bundici\b/i },
  { label: 'stack:request', pattern: /\brequestControlPlane\b|\brequest\b/i },
  { label: 'stack:agent_channel', pattern: /\bAgentService\b/i },
]

const FATAL_DOMAIN_RULES: PatternRule[] = [
  {
    label: 'fatal-domain:filesystem',
    pattern:
      /\b(?:ENOENT|EACCES|EPERM|ENOTDIR|EISDIR|ENOSPC|EBUSY|EMFILE)\b|node:(?:fs|internal\/fs)|\b(?:readFileSync|writeFileSync|mkdirSync|unlinkSync|renameSync)\b/i,
  },
  {
    label: 'fatal-domain:database',
    pattern: /\b(?:SQLITE_[A-Z_]+|better-sqlite3|sqlite|database disk image is malformed|db corruption)\b/i,
  },
  {
    label: 'fatal-domain:json-schema',
    pattern:
      /\b(?:JSON\.parse|Unexpected token .* in JSON|schema validation|serialization failed|deserialize failed|zod validation)\b/i,
  },
  {
    label: 'fatal-domain:electron-core',
    pattern:
      /\b(?:BrowserWindow|webContents|preload|contextBridge|ipcMain|ipcRenderer|render-process-gone|renderer process crashed)\b/i,
  },
  {
    label: 'fatal-domain:config-invariant',
    pattern:
      /\b(?:invariant|assert(?:ion)? failed|failed assertion|migration failed|missing required config|configuration is invalid|preload bundle missing)\b/i,
  },
]

function readErrorCode(error: unknown, key: 'code' | 'causeCode'): string {
  if (!error || typeof error !== 'object') {
    return ''
  }
  if (key === 'code' && 'code' in error && typeof error.code === 'string') {
    return error.code.trim()
  }
  if (
    key === 'causeCode' &&
    'cause' in error &&
    error.cause &&
    typeof error.cause === 'object' &&
    'code' in error.cause &&
    typeof error.cause.code === 'string'
  ) {
    return error.cause.code.trim()
  }
  return ''
}

function findRuleMatches(rules: PatternRule[], input: string): string[] {
  if (!input) {
    return []
  }
  return rules.filter((rule) => rule.pattern.test(input)).map((rule) => rule.label)
}

function buildSignature(input: { code: string; causeCode: string; message: string }): string {
  return [
    input.code || 'no-code',
    input.causeCode || 'no-cause-code',
    input.message.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 160) || 'no-message',
  ].join('|')
}

export function extractGlobalErrorFacts(error: unknown): ErrorFacts {
  const asError = error instanceof Error ? error : new Error(String(error))
  return {
    name: asError.name || '',
    message: asError.message || String(error),
    code: readErrorCode(error, 'code'),
    causeCode: readErrorCode(error, 'causeCode'),
    stack: asError.stack || '',
  }
}

export function matchesRecoverableNetworkSignature(facts: ErrorFacts): string[] {
  const matchedBy: string[] = []
  if (facts.code && RECOVERABLE_NETWORK_CODES.has(facts.code.toUpperCase())) {
    matchedBy.push(`code:${facts.code.toUpperCase()}`)
  }
  if (facts.causeCode && RECOVERABLE_NETWORK_CODES.has(facts.causeCode.toUpperCase())) {
    matchedBy.push(`cause.code:${facts.causeCode.toUpperCase()}`)
  }
  matchedBy.push(...findRuleMatches(RECOVERABLE_NETWORK_MESSAGE_RULES, facts.message))
  return matchedBy
}

export function matchesFatalDomainSignature(facts: ErrorFacts): string[] {
  const combined = [facts.name, facts.message, facts.stack].filter(Boolean).join('\n')
  return findRuleMatches(FATAL_DOMAIN_RULES, combined)
}

export function findRecoverableNetworkStackHints(facts: ErrorFacts): string[] {
  return findRuleMatches(RECOVERABLE_STACK_HINT_RULES, facts.stack)
}

export function isRecoverableNetworkFailure(input: {
  message: string
  code?: string
  status?: number | null
}): boolean {
  if (typeof input.status === 'number' && input.status >= 500) {
    return true
  }
  const facts: ErrorFacts = {
    name: '',
    message: input.message || '',
    code: String(input.code || '').trim(),
    causeCode: '',
    stack: '',
  }
  return matchesRecoverableNetworkSignature(facts).length > 0
}

export function classifyRecoverableGlobalNetworkError(
  error: unknown,
): RecoverableGlobalNetworkErrorClassification {
  const facts = extractGlobalErrorFacts(error)
  const matchedBy = matchesRecoverableNetworkSignature(facts)
  const fatalDomainDeniedBy = matchesFatalDomainSignature(facts)
  const stackHint = matchedBy.length > 0 ? findRecoverableNetworkStackHints(facts) : []
  return {
    ...facts,
    recoverable: matchedBy.length > 0 && fatalDomainDeniedBy.length === 0,
    matchedBy,
    fatalDomainDeniedBy,
    stackHint,
    signature: buildSignature(facts),
  }
}
