import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { getMadori } from '@/lib/madori'
import { logger } from './logger'

export type HealthKind = 'live' | 'ready'
export type HealthStatus = 'ok' | 'unavailable'

export interface HealthCheckResult {
  name: string
  status: HealthStatus
  durationMs: number
}

export interface HealthReport {
  status: HealthStatus
  timestamp: string
  uptimeSeconds: number
  checks: HealthCheckResult[]
}

interface RuntimePaths {
  content: string
  resources: string
  users: string
  assets: string
  operationalStorage: string
}

interface HealthDependencies {
  now(): Date
  uptime(): number
  loadPaths(): Promise<RuntimePaths>
  inspectDirectory(path: string): Promise<void>
  reportFailure(name: string, cause: unknown): void
}

export interface RuntimeHealth {
  check(kind: HealthKind): Promise<HealthReport>
}

async function inspectDirectory(path: string): Promise<void> {
  const metadata = await stat(path)
  if (!metadata.isDirectory()) throw new Error('Configured storage root is not a directory')
  await access(path, constants.R_OK | constants.W_OK)
}

async function loadPaths(): Promise<RuntimePaths> {
  const { config } = await getMadori()
  return {
    content: config.contentPath,
    resources: config.resourcesPath,
    users: config.usersPath,
    assets: config.assetsPath,
    operationalStorage: config.seo.operationalStoragePath,
  }
}

const productionDependencies: HealthDependencies = {
  now: () => new Date(),
  uptime: () => process.uptime(),
  loadPaths,
  inspectDirectory,
  reportFailure: (name, cause) => logger.error('health.check.failed', cause, { check: name }),
}

export function createRuntimeHealth(
  dependencies: HealthDependencies = productionDependencies
): RuntimeHealth {
  async function timed(name: string, check: () => Promise<void>): Promise<HealthCheckResult> {
    const startedAt = performance.now()
    try {
      await check()
      return { name, status: 'ok', durationMs: Math.round(performance.now() - startedAt) }
    } catch (cause) {
      dependencies.reportFailure(name, cause)
      return { name, status: 'unavailable', durationMs: Math.round(performance.now() - startedAt) }
    }
  }

  return {
    async check(kind) {
      const timestamp = dependencies.now().toISOString()
      const uptimeSeconds = Math.floor(dependencies.uptime())

      if (kind === 'live') {
        return {
          status: 'ok',
          timestamp,
          uptimeSeconds,
          checks: [{ name: 'process', status: 'ok', durationMs: 0 }],
        }
      }

      let paths: RuntimePaths | undefined
      const runtime = await timed('runtime', async () => {
        paths = await dependencies.loadPaths()
      })
      const checks = [runtime]

      if (paths) {
        checks.push(...await Promise.all(
          Object.entries(paths).map(([name, path]) => timed(name, () => dependencies.inspectDirectory(path)))
        ))
      }

      return {
        status: checks.every((check) => check.status === 'ok') ? 'ok' : 'unavailable',
        timestamp,
        uptimeSeconds,
        checks,
      }
    },
  }
}

export const runtimeHealth = createRuntimeHealth()
