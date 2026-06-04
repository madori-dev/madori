export abstract class MadoriError extends Error {
  abstract readonly code: string
  abstract readonly statusCode: number

  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class NotFoundError extends MadoriError {
  readonly code = 'NOT_FOUND'
  readonly statusCode = 404

  constructor(resource: string, identifier: string) {
    super(`${resource} "${identifier}" not found`)
  }
}

export class ValidationError extends MadoriError {
  readonly code = 'VALIDATION_ERROR'
  readonly statusCode = 422

  constructor(
    message: string,
    public readonly fieldErrors: Record<string, string[]>
  ) {
    super(message)
  }
}

export class AuthenticationError extends MadoriError {
  readonly code = 'AUTHENTICATION_ERROR'
  readonly statusCode = 401

  constructor() {
    super('Invalid credentials')
  }
}

export class AuthorizationError extends MadoriError {
  readonly code = 'AUTHORIZATION_ERROR'
  readonly statusCode = 403

  constructor(resource: string, action: string) {
    super(`Insufficient permissions to ${action} ${resource}`)
  }
}

export class ConflictError extends MadoriError {
  readonly code = 'CONFLICT'
  readonly statusCode = 409

  constructor(
    message: string,
    public readonly submittedHash?: string,
    public readonly currentHash?: string
  ) {
    super(message)
  }
}

export class FileSystemError extends MadoriError {
  readonly code = 'FILE_SYSTEM_ERROR'
  readonly statusCode = 500

  constructor(operation: string, path: string, public readonly cause?: Error) {
    super(`File system error during ${operation} on ${path}`)
  }
}
