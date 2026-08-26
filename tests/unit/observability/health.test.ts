import { describe, expect, it, vi } from 'vitest'
import { createRuntimeHealth } from '@/lib/observability/health'
import { healthResponse } from '@/lib/observability/http'

const paths = {
  content: '/private/project/content',
  resources: '/private/project/resources',
  users: '/private/project/users',
  assets: '/private/project/assets',
  operationalStorage: '/private/project/storage',
}

function dependencies(overrides: Partial<Parameters<typeof createRuntimeHealth>[0]> = {}) {
  return {
    now: () => new Date('2026-08-26T12:00:00.000Z'),
    uptime: () => 42.9,
    loadPaths: vi.fn().mockResolvedValue(paths),
    inspectDirectory: vi.fn().mockResolvedValue(undefined),
    reportFailure: vi.fn(),
    ...overrides,
  }
}

describe('runtime health', () => {
  it('reports liveness without touching configuration or storage', async () => {
    const deps = dependencies()
    const report = await createRuntimeHealth(deps).check('live')

    expect(report).toEqual({
      status: 'ok',
      timestamp: '2026-08-26T12:00:00.000Z',
      uptimeSeconds: 42,
      checks: [{ name: 'process', status: 'ok', durationMs: 0 }],
    })
    expect(deps.loadPaths).not.toHaveBeenCalled()
    expect(deps.inspectDirectory).not.toHaveBeenCalled()
    expect(deps.reportFailure).not.toHaveBeenCalled()
  })

  it('reports readiness only after every configured root passes', async () => {
    const deps = dependencies()
    const report = await createRuntimeHealth(deps).check('ready')

    expect(report.status).toBe('ok')
    expect(report.checks.map((check) => [check.name, check.status])).toEqual([
      ['runtime', 'ok'],
      ['content', 'ok'],
      ['resources', 'ok'],
      ['users', 'ok'],
      ['assets', 'ok'],
      ['operationalStorage', 'ok'],
    ])
    expect(deps.inspectDirectory).toHaveBeenCalledTimes(5)
  })

  it('returns unavailable without exposing paths or raw errors', async () => {
    const deps = dependencies({
      inspectDirectory: vi.fn(async (path: string) => {
        if (path === paths.users) throw new Error(`EACCES: ${path}/secrets.yaml`)
      }),
    })
    const response = await healthResponse('ready', createRuntimeHealth(deps))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(body.status).toBe('unavailable')
    expect(body.checks).toContainEqual(expect.objectContaining({ name: 'users', status: 'unavailable' }))
    expect(JSON.stringify(body)).not.toContain('/private/project')
    expect(JSON.stringify(body)).not.toContain('EACCES')
    expect(deps.reportFailure).toHaveBeenCalledWith('users', expect.any(Error))
  })

  it('does not probe storage when configuration loading fails', async () => {
    const deps = dependencies({ loadPaths: vi.fn().mockRejectedValue(new Error('invalid secret config')) })
    const report = await createRuntimeHealth(deps).check('ready')

    expect(report.status).toBe('unavailable')
    expect(report.checks).toEqual([
      expect.objectContaining({ name: 'runtime', status: 'unavailable' }),
    ])
    expect(deps.inspectDirectory).not.toHaveBeenCalled()
    expect(deps.reportFailure).toHaveBeenCalledWith('runtime', expect.any(Error))
  })
})
