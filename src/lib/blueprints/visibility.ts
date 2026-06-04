import type { VisibilityCondition } from '@/lib/blueprints/types'

/**
 * Evaluates a visibility condition against the current form values.
 * Returns true if the field should be visible, false if it should be hidden.
 */
export function evaluateCondition(
  condition: VisibilityCondition,
  formValues: Record<string, unknown>
): boolean {
  const fieldValue = formValues[condition.field]

  switch (condition.operator) {
    case 'equals':
      return fieldValue === condition.value
    case 'not_equals':
      return fieldValue !== condition.value
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.includes(String(condition.value))
    case 'empty':
      return fieldValue === undefined || fieldValue === null || fieldValue === ''
    case 'not_empty':
      return fieldValue !== undefined && fieldValue !== null && fieldValue !== ''
  }
}

/**
 * Filters a form submission payload by visibility conditions.
 * Fields whose visibility condition evaluates to false are excluded from the result.
 * Fields without a visibility condition are always included.
 */
export function filterPayloadByVisibility(
  fields: Array<{ handle: string; visibility?: VisibilityCondition }>,
  values: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    if (!field.visibility || evaluateCondition(field.visibility, values)) {
      if (field.handle in values) {
        result[field.handle] = values[field.handle]
      }
    }
  }
  return result
}
