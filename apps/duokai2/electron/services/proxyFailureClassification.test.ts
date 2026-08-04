import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyProxyFailure,
  createProxyConnectHttpError,
  ProxyConnectError,
} from './proxyFailureClassification.ts'

test('classifies local bridge HTTP 502 as retryable gateway failure', () => {
  const classification = classifyProxyFailure(new Error('Proxy CONNECT failed with status 502'))
  assert.deepEqual(classification, {
    code: 'proxy_connect_gateway_failure',
    httpStatus: 502,
    retryable: true,
  })
})

test('classifies HTTP 407 as non-retryable authentication failure', () => {
  const classification = classifyProxyFailure(new Error('Proxy CONNECT returned HTTP 407'))
  assert.deepEqual(classification, {
    code: 'proxy_connect_auth_required',
    httpStatus: 407,
    retryable: false,
  })
})

test('classifies HTTP 504 and socket timeouts as retryable timeout failures', () => {
  assert.deepEqual(classifyProxyFailure(new Error('Proxy CONNECT failed with status 504')), {
    code: 'proxy_connect_timeout',
    httpStatus: 504,
    retryable: true,
  })
  assert.deepEqual(classifyProxyFailure(new Error('Proxy CONNECT timed out')), {
    code: 'proxy_connect_timeout',
    httpStatus: null,
    retryable: true,
  })
})

test('classifies non-authentication 4xx responses as rejected', () => {
  assert.deepEqual(classifyProxyFailure(new Error('Proxy CONNECT failed with status 403')), {
    code: 'proxy_connect_rejected',
    httpStatus: 403,
    retryable: false,
  })
})

test('structured ProxyConnectError preserves status and retryability', () => {
  const error = createProxyConnectHttpError(502)
  assert.equal(error instanceof ProxyConnectError, true)
  assert.equal(error.code, 'proxy_connect_gateway_failure')
  assert.equal(error.httpStatus, 502)
  assert.equal(error.retryable, true)
  assert.deepEqual(classifyProxyFailure(error), {
    code: 'proxy_connect_gateway_failure',
    httpStatus: 502,
    retryable: true,
  })
})

test('classifies DNS, TLS and transport errors without flattening them to unknown', () => {
  assert.equal(classifyProxyFailure(new Error('getaddrinfo ENOTFOUND proxy.example')).code, 'proxy_dns_failed')
  assert.equal(classifyProxyFailure(new Error('TLS certificate rejected')).code, 'proxy_tls_failed')
  assert.equal(classifyProxyFailure(new Error('socket ECONNRESET')).code, 'proxy_transport_error')
})
