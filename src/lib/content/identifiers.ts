import { ValidationError } from '@/lib/errors'

export function isContentIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)
}

export function assertContentIdentifier(value: string, label: string): void {
  if (!isContentIdentifier(value)) {
    throw new ValidationError(`Invalid ${label}`, { [label]: [`Invalid ${label}: ${value}`] })
  }
}
