export type LogLevel = 'info' | 'warn' | 'error'

type LogAttributes = Record<string, string | number | boolean | null | undefined>

const URL_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi
const SECRET_QUERY_PARAMETER = /([?&](?:access_?token|refresh_?token|token|api_?key|password|secret)=)[^&#\s]*/gi

export interface StructuredLogger {
  log(level: LogLevel, event: string, attributes?: LogAttributes): void
  error(event: string, cause: unknown, attributes?: LogAttributes): void
}

function redact(message: string): string {
  return message
    .replace(URL_USERINFO, '$1[REDACTED]@')
    .replace(SECRET_QUERY_PARAMETER, '$1[REDACTED]')
}

function errorAttributes(cause: unknown): LogAttributes {
  if (cause instanceof Error) {
    return {
      errorName: cause.name,
      errorMessage: redact(cause.message),
      ...(typeof (cause as Error & { digest?: unknown }).digest === 'string'
        ? { errorDigest: (cause as Error & { digest: string }).digest }
        : {}),
    }
  }

  return { errorName: 'UnknownError' }
}

function write(level: LogLevel, payload: Record<string, unknown>): void {
  const line = JSON.stringify(payload)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

export const logger: StructuredLogger = {
  log(level, event, attributes = {}) {
    write(level, {
      ...attributes,
      timestamp: new Date().toISOString(),
      level,
      event,
    })
  },

  error(event, cause, attributes = {}) {
    this.log('error', event, { ...attributes, ...errorAttributes(cause) })
  },
}
