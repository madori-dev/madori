import type { HealthKind, RuntimeHealth } from './health'

export async function healthResponse(kind: HealthKind, health: RuntimeHealth): Promise<Response> {
  const report = await health.check(kind)
  return Response.json(report, {
    status: report.status === 'ok' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
