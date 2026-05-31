import { z } from 'zod'
import type { BlueprintLoader } from './loader'
import type { Blueprint, BlueprintType, FieldDefinition, FieldConfig } from './types'

/**
 * Result of validating data against a blueprint schema.
 */
export interface ValidationResult {
  success: boolean
  errors?: Record<string, string[]>
}

/**
 * Registry for loading blueprints and generating Zod schemas for runtime validation.
 */
export class BlueprintRegistry {
  constructor(private readonly loader: BlueprintLoader) {}

  /**
   * Load a single blueprint by type and handle.
   */
  async getBlueprint(
    type: BlueprintType,
    handle: string
  ): Promise<Blueprint | null> {
    return this.loader.loadBlueprint(type, handle)
  }

  /**
   * List all blueprints of a given type.
   */
  async listBlueprints(type: BlueprintType): Promise<Blueprint[]> {
    return this.loader.listBlueprints(type)
  }

  /**
   * Save a blueprint (create or update).
   */
  async saveBlueprint(type: BlueprintType, handle: string, blueprint: Blueprint): Promise<void> {
    return this.loader.saveBlueprint(type, handle, blueprint)
  }

  /**
   * Delete a blueprint.
   */
  async deleteBlueprint(type: BlueprintType, handle: string): Promise<boolean> {
    return this.loader.deleteBlueprint(type, handle)
  }

  /**
   * Generate a Zod schema from a blueprint's field definitions.
   * Iterates all fields across all tabs and sections to build a z.object() schema.
   */
  generateZodSchema(blueprint: Blueprint): z.ZodType {
    const shape: Record<string, z.ZodType> = {}

    for (const tab of Object.values(blueprint.tabs)) {
      // Process top-level tab fields
      for (const field of tab.fields) {
        shape[field.handle] = this.fieldToZod(field)
      }

      // Process section fields
      if (tab.sections) {
        for (const section of Object.values(tab.sections)) {
          for (const field of section.fields) {
            shape[field.handle] = this.fieldToZod(field)
          }
        }
      }
    }

    return z.object(shape)
  }

  /**
   * Validate arbitrary data against a blueprint using the generated Zod schema.
   * Returns structured errors grouped by field handle.
   */
  validateData(blueprint: Blueprint, data: Record<string, unknown>): ValidationResult {
    const schema = this.generateZodSchema(blueprint)
    const result = schema.safeParse(data)

    if (result.success) {
      return { success: true }
    }

    const errors: Record<string, string[]> = {}
    for (const issue of result.error!.issues) {
      const fieldPath = issue.path.length > 0 ? issue.path.join('.') : '_root'
      if (!errors[fieldPath]) {
        errors[fieldPath] = []
      }
      errors[fieldPath].push(issue.message)
    }

    return { success: false, errors }
  }

  /**
   * Convert a single field definition to a Zod schema type.
   */
  private fieldToZod(fieldDef: FieldDefinition): z.ZodType {
    const { field } = fieldDef
    let schema = this.fieldTypeToZod(field)

    // Apply default value
    if (field.default !== undefined) {
      schema = (schema as z.ZodType & { default: (v: unknown) => z.ZodType }).default(field.default)
    }

    // Apply optional if not required (and no default already set)
    if (!field.required && field.default === undefined) {
      schema = schema.optional()
    }

    return schema
  }

  /**
   * Map a field type to its base Zod schema.
   */
  private fieldTypeToZod(field: FieldConfig): z.ZodType {
    switch (field.type) {
      case 'text':
        return field.required ? z.string().min(1) : z.string()

      case 'slug':
        return z.string().regex(/^[a-z0-9-]+$/)

      case 'markdown':
        return z.string()

      case 'tiptap':
        return z.string()

      case 'number':
        return z.number()

      case 'toggle':
        return z.boolean()

      case 'select': {
        const options = this.extractSelectOptions(field.options)
        if (options && options.length > 0) {
          return z.enum(options as [string, ...string[]])
        }
        return z.string()
      }

      case 'multiselect':
        return z.array(z.string())

      case 'date':
        return z.string()

      case 'asset':
        return z.string()

      case 'entries':
        return z.array(z.string())

      case 'taxonomy':
        return z.array(z.string())

      case 'replicator':
        return z.array(z.record(z.string(), z.unknown()))

      case 'grid':
        return z.array(z.record(z.string(), z.unknown()))

      case 'yaml':
        return z.string()

      case 'code':
        return z.string()

      case 'hidden':
        return z.unknown()

      default:
        return z.unknown()
    }
  }

  /**
   * Extract string options from a field's options config.
   * Options can be an array of strings or a record of key-value pairs.
   */
  private extractSelectOptions(options?: Record<string, unknown>): string[] | null {
    if (!options) return null

    // Options might be stored directly as an array value
    if (Array.isArray(options)) {
      return (options as unknown[]).filter((o): o is string => typeof o === 'string')
    }

    // Options might be a record with string values
    const values = Object.values(options)
    if (values.length > 0 && values.every((v) => typeof v === 'string')) {
      return values as string[]
    }

    return null
  }
}
