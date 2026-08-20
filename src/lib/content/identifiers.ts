import { ValidationError } from '@/lib/errors'

export function assertContentIdentifier(value: string, label: string): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) {
    throw new ValidationError(`Invalid ${label}`, { [label]: [`Invalid ${label}: ${value}`] })
  }
}
