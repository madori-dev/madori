import { z } from 'zod'
import type { FieldConfig, FieldType } from '@/lib/blueprints/types'
import { getAssetCardinality } from '@/lib/blueprints/asset-cardinality'

export interface ValidationResult {
  valid: boolean
  errors: Record<string, string[]>
}

/**
 * Parse a validation rule string into its name and optional parameter.
 * Examples: 'required' → ['required', undefined]
 *           'max:60' → ['max', '60']
 *           'regex:^[a-z]+$' → ['regex', '^[a-z]+$']
 *           'numeric_range:1,100' → ['numeric_range', '1,100']
 */
export function parseRule(rule: string): [string, string | undefined] {
  const colonIndex = rule.indexOf(':')
  if (colonIndex === -1) return [rule, undefined]
  return [rule.slice(0, colonIndex), rule.slice(colonIndex + 1)]
}

/**
 * Determines whether a given validation rule name is applicable to a field type.
 * Rules that don't apply to a field type should be ignored (with a console warning).
 */
export function isRuleApplicable(rule: string, fieldType: FieldType): boolean {
  const textRules = ['min', 'max', 'regex', 'url', 'email']
  const numericRules = ['min', 'max', 'numeric_range']
  const universalRules = ['required']

  if (universalRules.includes(rule)) return true
  if (fieldType === 'tiptap') return ['min', 'max'].includes(rule)
  if (['text', 'slug', 'markdown', 'code'].includes(fieldType)) {
    return textRules.includes(rule)
  }
  if (fieldType === 'number') return numericRules.includes(rule)
  return false
}

/**
 * Builds a Zod schema for a single field based on its type and validation rules.
 * This is a pure function with no React dependencies — shared between client and server.
 */
export function buildFieldSchema(field: FieldConfig): z.ZodType {
  let schema: z.ZodType = getBaseSchema(field)

  const rules = field.validate ?? []

  for (const rule of rules) {
    const [ruleName, ruleParam] = parseRule(rule)

    if (!isRuleApplicable(ruleName, field.type)) {
      if (typeof console !== 'undefined') {
        console.warn(
          `Validation rule "${ruleName}" is not applicable to field type "${field.type}" — ignoring.`
        )
      }
      continue
    }

    schema = applyRule(schema, field.type, ruleName, ruleParam)
  }

  // Apply required/optional
  if (field.required) {
    // For string types, required means non-empty
    if (isStringFieldType(field.type) && !rules.some((r) => parseRule(r)[0] === 'min')) {
      schema = (schema as z.ZodString).min(1, 'This field is required')
    }
    if (field.type === 'tiptap') {
      schema = schema.refine(
        (value) => typeof value === 'string' ? value.trim().length > 0 : Boolean(value && typeof value === 'object'),
        'This field is required'
      )
    }
  } else {
    schema = schema.optional() as z.ZodType
  }

  return schema
}

/**
 * Validates all field values against their configured rules.
 * Returns field-keyed error messages.
 */
export function validateFields(
  fields: Record<string, FieldConfig>,
  values: Record<string, unknown>
): ValidationResult {
  const errors: Record<string, string[]> = {}

  for (const [handle, fieldConfig] of Object.entries(fields)) {
    const value = values[handle]
    const schema = buildFieldSchema(fieldConfig)
    const result = schema.safeParse(value)

    if (!result.success) {
      errors[handle] = result.error.issues.map((issue) => issue.message)
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}

/**
 * Returns the base Zod schema for a field type (before validation rules are applied).
 */
function getBaseSchema(field: FieldConfig): z.ZodType {
  const fieldType = field.type
  switch (fieldType) {
    case 'text':
    case 'slug':
    case 'markdown':
    case 'code':
    case 'yaml':
      return z.string()

    case 'tiptap':
      return z.union([z.string(), z.record(z.string(), z.unknown())])

    case 'number':
      return z.number()

    case 'toggle':
      return z.boolean()

    case 'select':
      return z.string()

    case 'multiselect':
    case 'entries':
    case 'taxonomy':
      return z.array(z.string())

    case 'date':
      return z.string()

    case 'asset': {
      const cardinality = getAssetCardinality(field.options)
      if (!cardinality.valid) return z.never().describe('Invalid asset cardinality')
      let schema: z.ZodType = cardinality.multiple ? z.array(z.string()) : z.string()
      if (cardinality.multiple && cardinality.min !== undefined) schema = (schema as z.ZodArray<z.ZodString>).min(cardinality.min)
      if (cardinality.multiple && cardinality.max > 0) schema = (schema as z.ZodArray<z.ZodString>).max(cardinality.max)
      return schema
    }

    case 'replicator':
    case 'grid':
      return z.array(z.record(z.string(), z.unknown()))

    case 'hidden':
      return z.unknown()

    default:
      return z.unknown()
  }
}

/**
 * Applies a single validation rule to an existing schema.
 */
function applyRule(
  schema: z.ZodType,
  fieldType: FieldType,
  ruleName: string,
  ruleParam: string | undefined
): z.ZodType {
  switch (ruleName) {
    case 'required':
      // Handled separately in buildFieldSchema
      return schema

    case 'min': {
      const minVal = Number(ruleParam)
      if (isNaN(minVal)) return schema

      if (fieldType === 'tiptap') {
        return schema.refine((value) => tiptapTextLength(value) >= minVal, `Must be at least ${minVal} characters`)
      }
      if (isStringFieldType(fieldType)) {
        return (schema as z.ZodString).min(minVal, `Must be at least ${minVal} characters`)
      }
      if (fieldType === 'number') {
        return (schema as z.ZodNumber).min(minVal, `Must be at least ${minVal}`)
      }
      return schema
    }

    case 'max': {
      const maxVal = Number(ruleParam)
      if (isNaN(maxVal)) return schema

      if (fieldType === 'tiptap') {
        return schema.refine((value) => tiptapTextLength(value) <= maxVal, `Must be at most ${maxVal} characters`)
      }
      if (isStringFieldType(fieldType)) {
        return (schema as z.ZodString).max(maxVal, `Must be at most ${maxVal} characters`)
      }
      if (fieldType === 'number') {
        return (schema as z.ZodNumber).max(maxVal, `Must be at most ${maxVal}`)
      }
      return schema
    }

    case 'regex': {
      if (!ruleParam) return schema
      try {
        const regex = new RegExp(ruleParam)
        return (schema as z.ZodString).regex(regex, `Must match pattern ${ruleParam}`)
      } catch {
        // Invalid regex — skip
        return schema
      }
    }

    case 'url':
      return (schema as z.ZodString).url('Must be a valid URL')

    case 'email':
      return (schema as z.ZodString).email('Must be a valid email address')

    case 'numeric_range': {
      if (!ruleParam) return schema
      const [minStr, maxStr] = ruleParam.split(',')
      const min = Number(minStr)
      const max = Number(maxStr)
      if (isNaN(min) || isNaN(max)) return schema
      return (schema as z.ZodNumber)
        .min(min, `Must be at least ${min}`)
        .max(max, `Must be at most ${max}`)
    }

    default:
      return schema
  }
}

/**
 * Checks if a field type uses a string-based schema.
 */
function isStringFieldType(fieldType: FieldType): boolean {
  return ['text', 'slug', 'markdown', 'code', 'yaml'].includes(fieldType)
}


/** Text-length rules for rich text apply to visible text nodes, not JSON markup. */
function tiptapTextLength(value: unknown): number {
  if (typeof value === 'string') return value.length
  if (!value || typeof value !== 'object') return 0
  const walk = (node: unknown): string => {
    if (!node || typeof node !== 'object') return ''
    const record = node as { text?: unknown; content?: unknown }
    const text = typeof record.text === 'string' ? record.text : ''
    const children = Array.isArray(record.content) ? record.content.map(walk).join('') : ''
    return text + children
  }
  return walk(value).length
}
