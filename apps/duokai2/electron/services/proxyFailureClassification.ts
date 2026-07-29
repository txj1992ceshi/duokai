export type ProxyFailureCode =
  | 'proxy_connect_auth_required'
  | 'proxy_connect_timeout'
  | 'proxy_connect_gateway_failure'
  | 'proxy_connect_upstream_failure'
  | 'proxy_connect_rejected'
  | 'proxy_connect_refused'
  | 'proxy_dns_failed'
  | 'proxy_tls_failed'
  | 'proxy_protocol_error'
  | 'proxy_transport_error'
  | 'proxy_unknown'

export interface ProxyFailureClassification {
  code: ProxyFailureCode
  httpStatus: number | null
  retryable: boolean
}

export class ProxyConnectError extends Error {
  readonly code: ProxyFailureCode
  readonly httpStatus: number | null
  readonly retryable: boolean

  constructor(
    message: string,
    classification: ProxyFailureClassification,
    options: ErrorOptions = {},
  ) {
    super(message, options)
    this.name = 'ProxyConnectError'
    this.code = classification.code
    this.httpStatus = classification.httpStatus
    this.retryable = classification.retryable
  }
}

function classifyHttpStatus(status: number): ProxyFailureClassification {
  if (status === 407) {
    return { code: 'proxy_connect_auth_required', httpStatus: status, retryable: false }
  }
  if (status === 408 || status === 504) {
    return { code: 'proxy_connect_timeout', httpStatus: status, retryable: true }
  }
  if (status === 502) {
    return { code: 'proxy_connect_gateway_failure', httpStatus: status, retryable: true }
  }
  if (status >= 500 && status <= 599) {
    return { code: 'proxy_connect_upstream_failure', httpStatus: status, retryable: true }
  }
  if (status >= 400 && status <= 499) {
    return { code: 'proxy_connect_rejected', httpStatus: status, retryable: false }
  }
  return { code: 'proxy_protocol_error', httpStatus: status || null, retryable: false }
}

function extractHttpStatus(message: string): number | null {
  const match = message.match(/(?:status|HTTP)\s+(\d{3})/i)
  return match ? Number(match[1]) : null
}

export function classifyProxyFailure(error: unknown): ProxyFailureClassification {
  if (error instanceof ProxyConnectError) {
    return {
      code: error.code,
      httpStatus: error.httpStatus,
      retryable: error.retryable,
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  const status = extractHttpStatus(message)
  if (status !== null) return classifyHttpStatus(status)
  if (/timeout|timed out|ETIMEDOUT/i.test(message)) {
    return { code: 'proxy_connect_timeout', httpStatus: null, retryable: true }
  }
  if (/ECONNREFUSED|connection refused/i.test(message)) {
    return { code: 'proxy_connect_refused', httpStatus: null, retryable: true }
  }
  if (/ENOTFOUND|EAI_AGAIN|dns/i.test(message)) {
    return { code: 'proxy_dns_failed', httpStatus: null, retryable: true }
  }
  if (/certificate|tls|ssl/i.test(message)) {
    return { code: 'proxy_tls_failed', httpStatus: null, retryable: false }
  }
  if (/invalid|malformed|protocol|incomplete|truncated/i.test(message)) {
    return { code: 'proxy_protocol_error', httpStatus: null, retryable: false }
  }
  if (/ECONNRESET|EPIPE|socket|connection|transport/i.test(message)) {
    return { code: 'proxy_transport_error', httpStatus: null, retryable: true }
  }
  return { code: 'proxy_unknown', httpStatus: null, retryable: false }
}

export function createProxyConnectHttpError(status: number, context = 'Proxy CONNECT'): ProxyConnectError {
  const classification = classifyHttpStatus(status)
  return new ProxyConnectError(
    `${context} failed with status ${status || 'unknown'}`,
    classification,
  )
}
