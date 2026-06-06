export type MadoriFieldType =
  | 'date'
  | 'toggle'
  | 'integer'
  | 'float'
  | 'tags'
  | 'text'
  | 'textarea'
  | 'select'
  | 'tiptap'
  | 'assets'

export interface FieldTypeInference {
  type: MadoriFieldType
  confidence: 'high' | 'low'
}

export interface JsonSchemaProperty {
  type?: string | string[]
  format?: string
  enum?: unknown[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  [key: string]: unknown
}

/**
 * ISO 8601 date pattern. Matches:
 * - YYYY-MM-DD
 * - YYYY-MM-DDTHH:mm:ss
 * - YYYY-MM-DDTHH:mm:ssZ
 * - YYYY-MM-DDTHH:mm:ss.sssZ
 * - YYYY-MM-DDTHH:mm:ss±HH:MM
 */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/

const URL_PATTERN = /^https?:\/\/.+/

const SHORT_STRING_MAX_LENGTH = 100

/**
 * Infer a Madori field type from a frontmatter value.
 *
 * Uses pattern matching to determine the best field type for a given value.
 * Returns a confidence level: 'high' when the type is unambiguous, 'low' when
 * falling back to a default or making a best guess.
 */
export function inferFieldTypeFromValue(value: unknown): FieldTypeInference {
  if (value === null || value === undefined) {
    return { type: 'text', confidence: 'low' }
  }

  if (typeof value === 'boolean') {
    return { type: 'toggle', confidence: 'high' }
  }

  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { type: 'integer', confidence: 'high' }
      : { type: 'float', confidence: 'high' }
  }

  if (typeof value === 'string') {
    return inferFromString(value)
  }

  if (Array.isArray(value)) {
    return inferFromArray(value)
  }

  // Complex objects (nested objects, etc.) default to text
  return { type: 'text', confidence: 'low' }
}

function inferFromString(value: string): FieldTypeInference {
  if (ISO_DATE_PATTERN.test(value) && !isNaN(Date.parse(value))) {
    return { type: 'date', confidence: 'high' }
  }

  if (URL_PATTERN.test(value)) {
    return { type: 'text', confidence: 'high' }
  }

  if (value.length > SHORT_STRING_MAX_LENGTH) {
    return { type: 'textarea', confidence: 'high' }
  }

  return { type: 'text', confidence: 'high' }
}

function inferFromArray(value: unknown[]): FieldTypeInference {
  if (value.length === 0) {
    // Empty array — assume tags but with low confidence
    return { type: 'tags', confidence: 'low' }
  }

  const allStrings = value.every((item) => typeof item === 'string')
  if (allStrings) {
    return { type: 'tags', confidence: 'high' }
  }

  // Mixed or non-string arrays default to text
  return { type: 'text', confidence: 'low' }
}

/**
 * Infer a Madori field type from a JSON Schema property definition.
 *
 * Maps JSON Schema types and formats to Madori field types according to
 * the defined mapping table. Returns 'high' confidence when the mapping
 * is direct, 'low' when falling back to a default.
 */
export function inferFieldTypeFromSchema(schemaProperty: JsonSchemaProperty): FieldTypeInference {
  const type = resolveSchemaType(schemaProperty)

  // Enum takes priority regardless of base type
  if (schemaProperty.enum && schemaProperty.enum.length > 0) {
    return { type: 'select', confidence: 'high' }
  }

  switch (type) {
    case 'string':
      return inferFromSchemaString(schemaProperty)

    case 'number':
    case 'integer':
      return { type: 'integer', confidence: 'high' }

    case 'boolean':
      return { type: 'toggle', confidence: 'high' }

    case 'array':
      return inferFromSchemaArray(schemaProperty)

    case 'object':
      return { type: 'text', confidence: 'low' }

    default:
      return { type: 'text', confidence: 'low' }
  }
}

function resolveSchemaType(schema: JsonSchemaProperty): string | undefined {
  if (typeof schema.type === 'string') {
    return schema.type
  }
  if (Array.isArray(schema.type) && schema.type.length > 0) {
    // Use the first non-null type
    return schema.type.find((t) => t !== 'null') ?? schema.type[0]
  }
  return undefined
}

function inferFromSchemaString(schema: JsonSchemaProperty): FieldTypeInference {
  if (schema.format === 'date' || schema.format === 'date-time') {
    return { type: 'date', confidence: 'high' }
  }

  if (schema.format === 'uri' || schema.format === 'url') {
    return { type: 'text', confidence: 'high' }
  }

  return { type: 'text', confidence: 'high' }
}

function inferFromSchemaArray(schema: JsonSchemaProperty): FieldTypeInference {
  if (schema.items) {
    const itemType = resolveSchemaType(schema.items)
    if (itemType === 'string') {
      return { type: 'tags', confidence: 'high' }
    }
  }

  // Array without items definition or non-string items
  return { type: 'tags', confidence: 'low' }
}
