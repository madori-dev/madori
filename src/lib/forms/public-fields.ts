export const publicFormFieldTypes = ['text', 'number', 'date', 'toggle', 'select', 'multiselect', 'markdown', 'tiptap', 'code', 'yaml', 'hidden'] as const
export type PublicFormFieldType = (typeof publicFormFieldTypes)[number]

export function isPublicFormField(value: unknown): value is { handle: string; field: { type: PublicFormFieldType } } {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { handle?: unknown; field?: { type?: unknown } }
  return typeof candidate.handle === 'string' && typeof candidate.field?.type === 'string' && (publicFormFieldTypes as readonly string[]).includes(candidate.field.type)
}

/** Reject required CP-only fields on form blueprints; optional ones are omitted publicly. */
export function requiredUnsupportedPublicFormFields(blueprint: { tabs: Record<string, { fields: unknown[]; sections?: Record<string, { fields: unknown[] }> }> }): string[] {
  const invalid: string[] = []
  for (const tab of Object.values(blueprint.tabs)) {
    const fields = [...tab.fields, ...Object.values(tab.sections ?? {}).flatMap((section) => section.fields)]
    for (const field of fields) {
      if (!isPublicFormField(field) && Boolean((field as { field?: { required?: boolean } }).field?.required)) invalid.push((field as { handle?: string }).handle ?? 'unknown')
    }
  }
  return invalid
}
