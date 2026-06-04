import type { Blueprint, FieldDefinition } from '@/lib/blueprints/types'

/**
 * Extracts all field definitions from a blueprint, including those nested
 * within tabs and sections.
 */
export function getAllFields(blueprint: Blueprint): FieldDefinition[] {
  const fields: FieldDefinition[] = []

  for (const tab of Object.values(blueprint.tabs)) {
    fields.push(...tab.fields)

    if (tab.sections) {
      for (const section of Object.values(tab.sections)) {
        fields.push(...section.fields)
      }
    }
  }

  return fields
}

/**
 * Generates initial form state from a blueprint by extracting default values
 * from field configurations.
 *
 * For each field that defines a `default` value in its config, the returned
 * object will contain that value keyed by the field handle. Fields without
 * a defined default are omitted from the result.
 */
export function getDefaultsFromBlueprint(blueprint: Blueprint): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  const fields = getAllFields(blueprint)

  for (const fieldDef of fields) {
    if (fieldDef.field.default !== undefined) {
      defaults[fieldDef.handle] = fieldDef.field.default
    }
  }

  return defaults
}
