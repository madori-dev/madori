import type { Blueprint, FieldConfig, FieldDefinition } from '@madori/lib/blueprints/types.js'
import type { GeneratedFile, SchemaGeneratorInterface } from './generation-pipeline.js'
import { toPascalCaseEntry } from './type-generator.js'

/**
 * SchemaGenerator converts Blueprint[] into Zod v4 schema files.
 *
 * Each blueprint produces a single .ts file containing a Zod schema,
 * inferred type, and parse/safeParse helper functions. All fields from
 * all tabs and sections are flattened into the schema object.
 */
export class SchemaGenerator implements SchemaGeneratorInterface {
  /**
   * Generate all Zod schema files from blueprints, plus a barrel file.
   */
  generate(blueprints: Blueprint[]): GeneratedFile[] {
    const schemaFiles = blueprints.map((bp) => this.generateSchema(bp))
    const barrel = this.generateBarrel(schemaFiles)
    return [...schemaFiles, barrel]
  }

  /**
   * Generate a single schema file from a blueprint.
   */
  generateSchema(blueprint: Blueprint): GeneratedFile {
    const entryName = toPascalCaseEntry(blueprint.handle)
    const schemaName = `${entryName}Schema`
    const fields = this.flattenFields(blueprint)

    const fieldDeclarations = fields
      .map((fd) => {
        const zodExpr = this.mapFieldToZod(fd.field)
        const optional = fd.field.required === true ? '' : '.optional()'
        const validations = this.buildValidations(fd.field)
        return `  ${fd.handle}: ${zodExpr}${validations}${optional},`
      })
      .join('\n')

    const content = [
      "import { z } from 'zod/v4'",
      '',
      `export const ${schemaName} = z.object({`,
      fieldDeclarations,
      '})',
      '',
      `export type ${entryName} = z.infer<typeof ${schemaName}>`,
      `export const parse = (data: unknown) => ${schemaName}.parse(data)`,
      `export const safeParse = (data: unknown) => ${schemaName}.safeParse(data)`,
      '',
    ].join('\n')

    return {
      filename: `schemas/${blueprint.handle}.ts`,
      content,
      blueprintHandle: blueprint.handle,
    }
  }

  /**
   * Map a single field config to its Zod expression string.
   */
  mapFieldToZod(field: FieldConfig): string {
    switch (field.type) {
      case 'text':
      case 'slug':
      case 'markdown':
      case 'tiptap':
      case 'code':
      case 'hidden':
      case 'date':
        return 'z.string()'

      case 'number':
        return 'z.number()'

      case 'toggle':
        return 'z.boolean()'

      case 'select':
        return this.buildSelectZod(field)

      case 'multiselect':
        return this.buildMultiselectZod(field)

      case 'asset':
        return 'z.object({ path: z.string(), filename: z.string(), extension: z.string(), size: z.number(), mimeType: z.string(), modifiedAt: z.string(), alt: z.string().optional() })'

      case 'entries':
        return 'z.array(z.object({ collection: z.string(), slug: z.string() }))'

      case 'taxonomy':
        return 'z.array(z.string())'

      case 'replicator':
        return this.buildReplicatorZod(field)

      case 'grid':
        return this.buildGridZod(field)

      case 'yaml':
        return 'z.record(z.string(), z.unknown())'

      default:
        return 'z.unknown()'
    }
  }

  // --- Private helpers ---

  /**
   * Flatten all fields from all tabs and sections into a single array.
   */
  private flattenFields(blueprint: Blueprint): FieldDefinition[] {
    const fields: FieldDefinition[] = []

    for (const tab of Object.values(blueprint.tabs)) {
      if (tab.fields) {
        fields.push(...tab.fields)
      }

      if (tab.sections) {
        for (const section of Object.values(tab.sections)) {
          if (section.fields) {
            fields.push(...section.fields)
          }
        }
      }
    }

    return fields
  }

  /**
   * Build Zod validation chain from the validate array.
   */
  private buildValidations(field: FieldConfig): string {
    if (!field.validate || field.validate.length === 0) {
      return ''
    }

    const parts: string[] = []

    for (const rule of field.validate) {
      if (rule === 'required') {
        // Handled by optionality — skip
        continue
      }

      if (rule === 'email') {
        if (this.isStringType(field.type)) {
          parts.push('.email()')
        }
        continue
      }

      if (rule === 'url') {
        if (this.isStringType(field.type)) {
          parts.push('.url()')
        }
        continue
      }

      const minMatch = rule.match(/^min:(\d+)$/)
      if (minMatch) {
        parts.push(`.min(${minMatch[1]})`)
        continue
      }

      const maxMatch = rule.match(/^max:(\d+)$/)
      if (maxMatch) {
        parts.push(`.max(${maxMatch[1]})`)
        continue
      }

      // Unknown rules are silently skipped
    }

    return parts.join('')
  }

  /**
   * Check if a field type maps to z.string().
   */
  private isStringType(type: string): boolean {
    return ['text', 'slug', 'markdown', 'tiptap', 'code', 'hidden', 'date'].includes(type)
  }

  /**
   * Build z.enum() for select fields with options, or z.string() without.
   */
  private buildSelectZod(field: FieldConfig): string {
    if (!field.options || Object.keys(field.options).length === 0) {
      return 'z.string()'
    }
    const keys = Object.keys(field.options)
      .map((key) => `'${key}'`)
      .join(', ')
    return `z.enum([${keys}])`
  }

  /**
   * Build z.array(z.enum()) for multiselect fields with options, or z.array(z.string()) without.
   */
  private buildMultiselectZod(field: FieldConfig): string {
    if (!field.options || Object.keys(field.options).length === 0) {
      return 'z.array(z.string())'
    }
    const keys = Object.keys(field.options)
      .map((key) => `'${key}'`)
      .join(', ')
    return `z.array(z.enum([${keys}]))`
  }

  /**
   * Build z.discriminatedUnion for replicator fields.
   */
  private buildReplicatorZod(field: FieldConfig): string {
    if (!field.options) {
      return 'z.record(z.string(), z.unknown())'
    }

    const sets = field.options['sets'] as Record<string, {
      display?: string
      fields?: FieldDefinition[]
    }> | undefined

    if (!sets || Object.keys(sets).length === 0) {
      return 'z.record(z.string(), z.unknown())'
    }

    const variants = Object.entries(sets).map(([setHandle, setDef]) => {
      const fieldParts: string[] = [`type: z.literal('${setHandle}')`]

      if (setDef.fields) {
        for (const fd of setDef.fields) {
          const zodExpr = this.mapFieldToZod(fd.field)
          const optional = fd.field.required === true ? '' : '.optional()'
          const validations = this.buildValidations(fd.field)
          fieldParts.push(`${fd.handle}: ${zodExpr}${validations}${optional}`)
        }
      }

      return `z.object({ ${fieldParts.join(', ')} })`
    })

    return `z.discriminatedUnion('type', [${variants.join(', ')}])`
  }

  /**
   * Build z.array(z.object()) for grid fields.
   */
  private buildGridZod(field: FieldConfig): string {
    if (!field.options) {
      return 'z.array(z.record(z.string(), z.unknown()))'
    }

    const columns = field.options['columns'] as FieldDefinition[] | undefined

    if (!columns || columns.length === 0) {
      return 'z.array(z.record(z.string(), z.unknown()))'
    }

    const fieldParts = columns.map((col) => {
      const zodExpr = this.mapFieldToZod(col.field)
      const optional = col.field.required === true ? '' : '.optional()'
      const validations = this.buildValidations(col.field)
      return `${col.handle}: ${zodExpr}${validations}${optional}`
    })

    return `z.array(z.object({ ${fieldParts.join(', ')} }))`
  }

  /**
   * Generate the schemas/index.ts barrel file.
   */
  private generateBarrel(schemaFiles: GeneratedFile[]): GeneratedFile {
    const exports = schemaFiles
      .map((f) => {
        const name = f.filename.replace('schemas/', '').replace('.ts', '')
        return `export * from './${name}.js'`
      })
      .join('\n')

    return {
      filename: 'schemas/index.ts',
      content: exports + '\n',
    }
  }
}
