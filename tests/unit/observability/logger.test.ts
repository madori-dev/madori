import { afterEach, describe, expect, it, vi } from 'vitest'
import { logger } from '@/lib/observability/logger'
import { onRequestError } from '@/instrumentation'

describe('structured logger', () => {
  afterEach(() => vi.restoreAllMocks())

  it('writes machine-readable error events', () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.error('request.failed', new TypeError('render failed'), {
      method: 'GET',
      path: '/articles',
    })

    expect(output).toHaveBeenCalledOnce()
    expect(JSON.parse(String(output.mock.calls[0][0]))).toEqual(expect.objectContaining({
      level: 'error',
      event: 'request.failed',
      errorName: 'TypeError',
      errorMessage: 'render failed',
      method: 'GET',
      path: '/articles',
    }))
  })

  it('does not serialize unknown thrown values', () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.error('request.failed', { token: 'sensitive' })

    expect(String(output.mock.calls[0][0])).not.toContain('sensitive')
    expect(JSON.parse(String(output.mock.calls[0][0]))).toEqual(expect.objectContaining({
      errorName: 'UnknownError',
    }))
  })

  it('redacts URL credentials and secret query parameters from error messages', () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.error(
      'upstream.failed',
      new Error('Request https://admin:password@example.com/api?token=secret-token&api_key=secret-key&view=full failed')
    )

    const line = String(output.mock.calls[0][0])
    expect(line).not.toContain('admin')
    expect(line).not.toContain('password')
    expect(line).not.toContain('secret-token')
    expect(line).not.toContain('secret-key')
    expect(line).toContain('https://[REDACTED]@example.com/api')
    expect(line).toContain('token=[REDACTED]')
    expect(line).toContain('api_key=[REDACTED]')
    expect(line).toContain('view=full')
  })

  it('captures Next server errors without query strings or request headers', () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})

    onRequestError(
      Object.assign(new Error('render failed'), { digest: 'error-123' }),
      {
        path: '/account?token=sensitive',
        method: 'GET',
        headers: { authorization: 'Bearer sensitive' },
      },
      {
        routerKind: 'App Router',
        routePath: '/account',
        routeType: 'render',
        renderSource: 'server-rendering',
        revalidateReason: undefined,
        renderType: 'dynamic',
      }
    )

    const line = String(output.mock.calls[0][0])
    expect(line).not.toContain('sensitive')
    expect(JSON.parse(line)).toEqual(expect.objectContaining({
      event: 'request.failed',
      errorDigest: 'error-123',
      method: 'GET',
      path: '/account',
      route: '/account',
    }))
  })
})
