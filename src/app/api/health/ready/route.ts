import { healthResponse } from '@/lib/observability/http'
import { runtimeHealth } from '@/lib/observability/health'

export const dynamic = 'force-dynamic'

export function GET(): Promise<Response> {
  return healthResponse('ready', runtimeHealth)
}
