import type { Instrumentation } from 'next'
import { logger } from '@/lib/observability/logger'

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context
) => {
  logger.error('request.failed', error, {
    method: request.method,
    path: request.path.split('?')[0],
    router: context.routerKind,
    route: context.routePath,
    routeType: context.routeType,
  })
}
