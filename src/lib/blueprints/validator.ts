import { z } from 'zod'

// --- Result interfaces ---

export interface BlueprintValidationResult {
  success: boolean
  errors: BlueprintValidationError[]
  warnings: BlueprintValidationWarning[]
}

export interface BlueprintValidationError {
  path: string
  message: string
  code: 'INVALID_TYPE' | 'UNKNOWN_RULE' | 'MISSING_PROPERTY' | 'DUPLICATE_HANDLE'
}

export interface BlueprintValidationWarning {
  path: string
  message: string
  code: 'DANGLING_VISIBILITY_REF'
}

// --- Zod schemas ---

const FieldTypeSchema = z.enum([
  'text', 'slug', 'markdown', 'tiptap', 'number', 'toggle',
  'select', 'multiselect', 'date', 'asset', 'entries',
  'taxonomy', 'replicator', 'grid', 'yaml', 'code', 'hidden',
])

const VisibilityConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(['equals', 'not_equals', 'contains', 'empty', 'not_empty']),
  value: z.unknown().optional(),
})

const FieldConfigSchema = z.object({
  type: FieldTypeSchema,
  display: z.string().optional(),
  instructions: z.string().optional(),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  validate: z.array(z.string()).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  visibility: VisibilityConditionSchema.optional(),
})

const FieldDefinitionSchema = z.object({
  handle: z.string().min(1),
  field: FieldConfigSchema,
})

const BlueprintSectionSchema = z.object({
  display: z.string().optional(),
  fields: z.array(FieldDefinitionSchema),
})

const BlueprintTabSchema = z.object({
  display: z.string().optional(),
  sections: z.record(z.string(), BlueprintSectionSchema).optional(),
  fields: z.array(FieldDefinitionSchema),
})

const BlueprintSchema = z.object({
  tabs: z.record(z.string(), BlueprintTabSchema),
})

// Export schemas for external use (e.g. tests)
export {
  FieldTypeSchema,
  VisibilityConditionSchema,
  FieldConfigSchema,
  FieldDefinitionSchema,
  BlueprintSectionSchema,
  BlueprintTabSchema,
  BlueprintSchema,
}

// --- Validator class ---

/**
 * Validates raw YAML-parsed blueprint data against a strict Zod schema
 * before BlueprintLoader normalises it into a Blueprint object.
 */
export class BlueprintValidator {
  /** Known field types (the FieldType union). */
  private readonly validFieldTypes: Set<string>

  /** Known validation rule names. */
  private readonly validRuleNames: Set<string>

  constructor() {
    this.validFieldTypes = new Set([
      'text', 'slug', 'markdown', 'tiptap', 'number', 'toggle',
      'select', 'multiselect', 'date', 'asset', 'entries',
      'taxonomy', 'replicator', 'grid', 'yaml', 'code', 'hidden',
    ])

    this.validRuleNames = new Set([
      'required', 'min', 'max', 'regex', 'url', 'email', 'numeric_range',
    ])
  }

  /** Validate raw parsed YAML data before normalisation. */
  validate(raw: unknown): BlueprintValidationResult {
    const errors: BlueprintValidationError[] = []
    const warnings: BlueprintValidationWarning[] = []

    // Step 1: Structural validation via Zod schema
    const parseResult = BlueprintSchema.safeParse(raw)

    if (!parseResult.success) {
      for (const issue of parseResult.error.issues) {
        const path = issue.path.join('.')
        const error = this.mapZodIssue(issue, path)
        errors.push(error)
      }
      return { success: false, errors, warnings }
    }

    // Step 2: Semantic validation on structurally valid data
    const data = parseResult.data

    // Check for unknown validation rule names
    for (const [tabKey, tab] of Object.entries(data.tabs)) {
      this.checkFieldRules(tab.fields, `tabs.${tabKey}.fields`, errors)

      if (tab.sections) {
        for (const [secKey, section] of Object.entries(tab.sections)) {
          this.checkFieldRules(
            section.fields,
            `tabs.${tabKey}.sections.${secKey}.fields`,
            errors
          )
        }
      }
    }

    // Step 3: Duplicate handle detection
    const handles = this.extractFieldHandles(raw)
    const seen = new Map<string, string>()

    for (const { handle, path } of handles) {
      if (seen.has(handle)) {
        errors.push({
          path,
          message: `Duplicate field handle "${handle}" (first seen at ${seen.get(handle)})`,
          code: 'DUPLICATE_HANDLE',
        })
      } else {
        seen.set(handle, path)
      }
    }

    // Step 4: Dangling visibility references
    const allHandleSet = new Set(handles.map((h) => h.handle))
    const visWarnings = this.checkVisibilityReferences(raw, allHandleSet)
    warnings.push(...visWarnings)

    return {
      success: errors.length === 0,
      errors,
      warnings,
    }
  }

  /** Extract all field handles from a raw blueprint for uniqueness checking. */
  private extractFieldHandles(raw: unknown): Array<{ handle: string; path: string }> {
    const results: Array<{ handle: string; path: string }> = []

    if (!raw || typeof raw !== 'object') return results

    const data = raw as Record<string, unknown>
    const tabs = data.tabs as Record<string, unknown> | undefined
    if (!tabs || typeof tabs !== 'object') return results

    for (const [tabKey, tabValue] of Object.entries(tabs)) {
      const tab = tabValue as Record<string, unknown>

      // Tab-level fields
      const fields = tab.fields as Array<Record<string, unknown>> | undefined
      if (Array.isArray(fields)) {
        for (let i = 0; i < fields.length; i++) {
          const handle = fields[i].handle
          if (typeof handle === 'string') {
            results.push({ handle, path: `tabs.${tabKey}.fields[${i}]` })
          }
        }
      }

      // Section-level fields
      const sections = tab.sections as Record<string, unknown> | undefined
      if (sections && typeof sections === 'object') {
        for (const [secKey, secValue] of Object.entries(sections)) {
          const section = secValue as Record<string, unknown>
          const secFields = section.fields as Array<Record<string, unknown>> | undefined
          if (Array.isArray(secFields)) {
            for (let i = 0; i < secFields.length; i++) {
              const handle = secFields[i].handle
              if (typeof handle === 'string') {
                results.push({
                  handle,
                  path: `tabs.${tabKey}.sections.${secKey}.fields[${i}]`,
                })
              }
            }
          }
        }
      }
    }

    return results
  }

  /** Check visibility conditions reference existing handles. */
  private checkVisibilityReferences(
    raw: unknown,
    allHandles: Set<string>
  ): BlueprintValidationWarning[] {
    const warnings: BlueprintValidationWarning[] = []

    if (!raw || typeof raw !== 'object') return warnings

    const data = raw as Record<string, unknown>
    const tabs = data.tabs as Record<string, unknown> | undefined
    if (!tabs || typeof tabs !== 'object') return warnings

    for (const [tabKey, tabValue] of Object.entries(tabs)) {
      const tab = tabValue as Record<string, unknown>

      // Tab-level fields
      const fields = tab.fields as Array<Record<string, unknown>> | undefined
      if (Array.isArray(fields)) {
        for (let i = 0; i < fields.length; i++) {
          this.checkFieldVisibility(
            fields[i],
            `tabs.${tabKey}.fields[${i}]`,
            allHandles,
            warnings
          )
        }
      }

      // Section-level fields
      const sections = tab.sections as Record<string, unknown> | undefined
      if (sections && typeof sections === 'object') {
        for (const [secKey, secValue] of Object.entries(sections)) {
          const section = secValue as Record<string, unknown>
          const secFields = section.fields as Array<Record<string, unknown>> | undefined
          if (Array.isArray(secFields)) {
            for (let i = 0; i < secFields.length; i++) {
              this.checkFieldVisibility(
                secFields[i],
                `tabs.${tabKey}.sections.${secKey}.fields[${i}]`,
                allHandles,
                warnings
              )
            }
          }
        }
      }
    }

    return warnings
  }

  /** Check a single field's visibility condition for dangling references. */
  private checkFieldVisibility(
    fieldDef: Record<string, unknown>,
    path: string,
    allHandles: Set<string>,
    warnings: BlueprintValidationWarning[]
  ): void {
    const field = fieldDef.field as Record<string, unknown> | undefined
    if (!field || typeof field !== 'object') return

    const visibility = field.visibility as Record<string, unknown> | undefined
    if (!visibility || typeof visibility !== 'object') return

    const refField = visibility.field
    if (typeof refField === 'string' && !allHandles.has(refField)) {
      warnings.push({
        path: `${path}.field.visibility`,
        message: `Visibility condition references non-existent field "${refField}"`,
        code: 'DANGLING_VISIBILITY_REF',
      })
    }
  }

  /** Check field validation rules for unknown rule names. */
  private checkFieldRules(
    fields: Array<{ handle: string; field: { validate?: string[] } }>,
    basePath: string,
    errors: BlueprintValidationError[]
  ): void {
    for (let i = 0; i < fields.length; i++) {
      const fieldDef = fields[i]
      const rules = fieldDef.field.validate
      if (!rules) continue

      for (const rule of rules) {
        const ruleName = this.extractRuleName(rule)
        if (!this.validRuleNames.has(ruleName)) {
          errors.push({
            path: `${basePath}[${i}].field.validate`,
            message: `Unknown validation rule "${ruleName}" on field "${fieldDef.handle}"`,
            code: 'UNKNOWN_RULE',
          })
        }
      }
    }
  }

  /** Extract rule name from a rule string (e.g. "max:60" → "max"). */
  private extractRuleName(rule: string): string {
    const colonIndex = rule.indexOf(':')
    return colonIndex === -1 ? rule : rule.slice(0, colonIndex)
  }

  /** Map a Zod issue to a BlueprintValidationError. */
  private mapZodIssue(issue: z.core.$ZodIssue, path: string): BlueprintValidationError {
    // Determine error code based on the Zod issue
    if (issue.code === 'invalid_value' || (issue as { code: string }).code === 'invalid_enum_value') {
      // Check if it's a field type issue by path
      if (path.includes('.field.type')) {
        return {
          path,
          message: `Invalid field type: ${JSON.stringify((issue as { received?: unknown }).received ?? issue.input)}`,
          code: 'INVALID_TYPE',
        }
      }
    }

    return {
      path,
      message: issue.message ?? 'Validation failed',
      code: 'MISSING_PROPERTY',
    }
  }
}
