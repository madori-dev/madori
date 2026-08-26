import { NextResponse, type NextRequest } from 'next/server'
import { GitError } from '@/lib/git'
import { getMadori } from '@/lib/madori'
import type { RouteFamily, RunAuthenticatedRoute } from './contracts'

type Madori = Awaited<ReturnType<typeof getMadori>>

function errorResponse(error: unknown): NextResponse {
  if (error instanceof GitError) {
    const status = error.code === 'DISABLED' ? 409 : error.code === 'UNKNOWN_REPOSITORY' ? 404 : 422
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status })
  }
  return NextResponse.json(
    { error: { code: 'GIT_SYNC_FAILED', message: 'Git synchronization failed' } },
    { status: 500 },
  )
}

async function repositoryId(request: NextRequest): Promise<string | undefined> {
  try {
    const body = await request.json() as { repository?: unknown }
    if (body.repository === undefined) return undefined
    if (typeof body.repository !== 'string' || !/^[a-f0-9]{64}$/.test(body.repository)) throw new Error('invalid')
    return body.repository
  } catch {
    throw new GitError('Repository identifier is invalid', 'INVALID_INPUT')
  }
}

export function createGitRouteFamily(
  runAuthenticated: RunAuthenticatedRoute,
  loadMadori: () => Promise<Madori> = getMadori,
): RouteFamily {
  return async (request, pathSegments) => {
    const routePath = pathSegments.join('/')
    if (routePath === 'git/status' && request.method === 'GET') {
      return runAuthenticated(request, pathSegments, { resource: 'git', action: 'view' }, async () =>
        NextResponse.json({ data: { repositories: await (await loadMadori()).gitRuntime.status() } }),
      )
    }

    if ((routePath === 'git/sync' || routePath === 'git/retry') && request.method === 'POST') {
      return runAuthenticated(request, pathSegments, { resource: 'git', action: 'edit' }, async (req) => {
        try {
          const repository = await repositoryId(req)
          const runtime = (await loadMadori()).gitRuntime
          if (routePath === 'git/retry') {
            if (!repository) throw new GitError('Repository identifier is required', 'INVALID_INPUT')
            return NextResponse.json({ data: { result: await runtime.retry(repository) } })
          }
          return NextResponse.json({ data: { results: await runtime.sync(repository) } })
        } catch (error) {
          return errorResponse(error)
        }
      })
    }

    return null
  }
}
