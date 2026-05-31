import { MadoriError } from '../errors'

export type EntityType = 'taxonomies' | 'globals' | 'navigations' | 'forms' | 'collections'

export class UnsupportedFormatError extends MadoriError {
  readonly code = 'UNSUPPORTED_FORMAT'
  readonly statusCode = 422

  constructor(extension: string, supported: string[]) {
    super(`Unsupported file extension "${extension}". Supported: ${supported.join(', ')}`)
  }
}

export class DefinitionParseError extends MadoriError {
  readonly code = 'DEFINITION_PARSE_ERROR'
  readonly statusCode = 422

  constructor(filePath: string, cause: Error) {
    super(`Failed to parse definition file "${filePath}": ${cause.message}`)
  }
}

export class DefinitionValidationError extends MadoriError {
  readonly code = 'DEFINITION_VALIDATION_ERROR'
  readonly statusCode = 422

  constructor(filePath: string, field: string, reason: string) {
    super(`Validation failed for "${filePath}": field "${field}" - ${reason}`)
  }
}

export class DefinitionNotFoundError extends MadoriError {
  readonly code = 'DEFINITION_NOT_FOUND'
  readonly statusCode = 404

  constructor(entityType: EntityType, handle: string) {
    super(`Definition not found: ${entityType}/${handle}`)
  }
}
