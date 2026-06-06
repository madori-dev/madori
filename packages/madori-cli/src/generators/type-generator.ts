import type { Blueprint, FieldConfig, FieldDefinition } from '@madori/lib/blueprints/types.js'
import type { GeneratedFile, TypeGeneratorInterface } from './generation-pipeline.js'

/**
 * Converts a kebab-case or lowercase handle to PascalCase + "Entry" suffix.
 * Examples: "blog" → "BlogEntry", "getting-started" → "GettingStartedEntry"
 */
export function toPascalCaseEntry(handle: string): string {
  const pascal = handle
    .split(/[-_]/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('')
  return `${pascal}Entry`
}

/**
 * TypeGenerator converts Blueprint[] into TypeScript interface declarations.
 *
 * Each blueprint produces a single .ts file containing one interface that
 * extends MadoriEntryMeta. All fields from all tabs and sections are flattened
 * into the interface. Fields are marked optional unless `required: true`.
 */
export class TypeGenerator implements TypeGeneratorInterface {
  /**
   * Generate all TypeScript interface files from blueprints.
   */
  generate(blueprints: Blueprint[]): GeneratedFile[] {
    return blueprints.map((bp) => this.generateInterface(bp))
  }

  /**
   * Generate a single interface file from a blueprint.
   */
  generateInterface(blueprint: Blueprint): GeneratedFile {
    const interfaceName = toPascalCaseEntry(blueprint.handle)
    const fields = this.flattenFields(blueprint)

    const imports = this.buildImports(fields)
    const jsdocHeader = this.buildInterfaceJSDoc(blueprint)
    const fieldDeclarations = fields
      .map((fd) => this.buildFieldDeclaration(fd))
      .join('\n')

    const content = [
      imports,
      '',
      jsdocHeader,
      `export interface ${interfaceName} extends MadoriEntryMeta {`,
      fieldDeclarations,
      '}',
      '',
    ].join('\n')

    return {
      filename: `types/${blueprint.handle}.ts`,
      content,
      blueprintHandle: blueprint.handle,
    }
  }

  /**
   * Map a single field config to its TypeScript type string.
   */
  mapFieldToType(field: FieldConfig): string {
    switch (field.type) {
      case 'text':
      case 'slug':
      case 'markdown':
      case 'tiptap':
      case 'code':
      case 'hidden':
      case 'date':
        return 'string'

      case 'number':
        return 'number'

      case 'toggle':
        return 'boolean'

      case 'select':
        return this.buildSelectType(field)

      case 'multiselect':
        return this.buildMultiselectType(field)

      case 'asset':
        return 'MadoriAsset'

      case 'entries':
        return 'MadoriEntryRef[]'

      case 'taxonomy':
        return 'string[]'

      case 'replicator':
        return this.buildReplicatorType(field)

      case 'grid':
        return this.buildGridType(field)

      case 'yaml':
        return 'Record<string, unknown>'

      default:
        console.warn(`[TypeGenerator] Unknown field type: "${(field as { type: string }).type}" — mapping to unknown`)
        return 'unknown'
    }
  }

  /**
   * Generate the top-level barrel index.ts that re-exports from all subdirectory barrels.
   * This re-exports types, schemas, graphql, and client modules.
   */
  generateBarrel(_files: GeneratedFile[]): string {
    const lines = [
      "export * from './types/index.js'",
      "export * from './schemas/index.js'",
      "export * from './graphql/index.js'",
      "export * from './client.js'",
    ]

    return lines.join('\n') + '\n'
  }

  /**
   * Generate the types/index.ts barrel that re-exports all individual type interface files.
   */
  generateTypesBarrel(files: GeneratedFile[]): string {
    const exports = files
      .map((f) => {
        const name = f.filename.replace('types/', '').replace('.ts', '')
        return `export * from './${name}.js'`
      })
      .join('\n')

    return exports + '\n'
  }

  // --- Private helpers ---

  /**
   * Flatten all fields from all tabs and sections into a single array.
   */
  private flattenFields(blueprint: Blueprint): FieldDefinition[] {
    const fields: FieldDefinition[] = []

    for (const tab of Object.values(blueprint.tabs)) {
      // Fields directly on the tab
      if (tab.fields) {
        fields.push(...tab.fields)
      }

      // Fields inside sections
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
   * Determine which imports are needed based on field types present.
   */
  private buildImports(fields: FieldDefinition[]): string {
    const importedTypes: string[] = ['MadoriEntryMeta']

    const hasAsset = fields.some((fd) => fd.field.type === 'asset')
    const hasEntries = fields.some((fd) => fd.field.type === 'entries')

    // Check replicator sets for asset/entries fields too
    for (const fd of fields) {
      if (fd.field.type === 'replicator' && fd.field.options) {
        const sets = fd.field.options['sets'] as Record<string, { fields?: FieldDefinition[] }> | undefined
        if (sets) {
          for (const set of Object.values(sets)) {
            if (set.fields) {
              for (const setField of set.fields) {
                if (setField.field.type === 'asset' && !hasAsset) {
                  importedTypes.push('MadoriAsset')
                }
                if (setField.field.type === 'entries' && !hasEntries) {
                  importedTypes.push('MadoriEntryRef')
                }
              }
            }
          }
        }
      }
      if (fd.field.type === 'grid' && fd.field.options) {
        const columns = fd.field.options['columns'] as FieldDefinition[] | undefined
        if (columns) {
          for (const col of columns) {
            if (col.field.type === 'asset' && !hasAsset) {
              importedTypes.push('MadoriAsset')
            }
            if (col.field.type === 'entries' && !hasEntries) {
              importedTypes.push('MadoriEntryRef')
            }
          }
        }
      }
    }

    if (hasAsset && !importedTypes.includes('MadoriAsset')) {
      importedTypes.push('MadoriAsset')
    }
    if (hasEntries && !importedTypes.includes('MadoriEntryRef')) {
      importedTypes.push('MadoriEntryRef')
    }

    return `import type { ${importedTypes.join(', ')} } from '@madori/sdk'`
  }

  /**
   * Build the JSDoc block for the interface declaration.
   */
  private buildInterfaceJSDoc(blueprint: Blueprint): string {
    return [
      '/**',
      ` * Generated from blueprint: ${blueprint.handle}`,
      ` * @see resources/blueprints/collections/${blueprint.handle}.yaml`,
      ' */',
    ].join('\n')
  }

  /**
   * Build a single field declaration with JSDoc, type, and optionality.
   */
  private buildFieldDeclaration(fd: FieldDefinition): string {
    const { handle, field } = fd
    const tsType = this.mapFieldToType(field)
    const optional = field.required === true ? '' : '?'
    const jsdoc = this.buildFieldJSDoc(field)

    return `${jsdoc}  ${handle}${optional}: ${tsType}`
  }

  /**
   * Build JSDoc comment for a field, including display, instructions, and enum options.
   */
  private buildFieldJSDoc(field: FieldConfig): string {
    const lines: string[] = ['  /**']

    if (field.display) {
      lines.push(`   * @description ${field.display}`)
    }

    if (field.instructions) {
      lines.push(`   * ${field.instructions}`)
    }

    if ((field.type === 'select' || field.type === 'multiselect') && field.options) {
      const optionKeys = Object.keys(field.options)
      if (optionKeys.length > 0) {
        lines.push(`   * @enum {${optionKeys.join(', ')}}`)
      }
    }

    lines.push('   */')

    return lines.join('\n') + '\n'
  }

  /**
   * Build a union of string literal types from select field options.
   */
  private buildSelectType(field: FieldConfig): string {
    if (!field.options || Object.keys(field.options).length === 0) {
      return 'string'
    }
    const literals = Object.keys(field.options)
      .map((key) => `'${key}'`)
      .join(' | ')
    return literals
  }

  /**
   * Build an Array<union> type from multiselect field options.
   */
  private buildMultiselectType(field: FieldConfig): string {
    if (!field.options || Object.keys(field.options).length === 0) {
      return 'string[]'
    }
    const literals = Object.keys(field.options)
      .map((key) => `'${key}'`)
      .join(' | ')
    return `Array<${literals}>`
  }

  /**
   * Build a discriminated union type from replicator field sets.
   * Each set becomes a variant with `type: 'setHandle'` as discriminant.
   */
  private buildReplicatorType(field: FieldConfig): string {
    if (!field.options) {
      return 'Record<string, unknown>'
    }

    const sets = field.options['sets'] as Record<string, {
      display?: string
      fields?: FieldDefinition[]
    }> | undefined

    if (!sets || Object.keys(sets).length === 0) {
      return 'Record<string, unknown>'
    }

    const variants = Object.entries(sets).map(([setHandle, setDef]) => {
      const fields: string[] = [`type: '${setHandle}'`]

      if (setDef.fields) {
        for (const fd of setDef.fields) {
          const tsType = this.mapFieldToType(fd.field)
          const optional = fd.field.required === true ? '' : '?'
          fields.push(`${fd.handle}${optional}: ${tsType}`)
        }
      }

      return `{ ${fields.join('; ')} }`
    })

    return variants.join(' | ')
  }

  /**
   * Build an Array<row object> type from grid field column definitions.
   */
  private buildGridType(field: FieldConfig): string {
    if (!field.options) {
      return 'Array<Record<string, unknown>>'
    }

    const columns = field.options['columns'] as FieldDefinition[] | undefined

    if (!columns || columns.length === 0) {
      return 'Array<Record<string, unknown>>'
    }

    const fields = columns.map((col) => {
      const tsType = this.mapFieldToType(col.field)
      const optional = col.field.required === true ? '' : '?'
      return `${col.handle}${optional}: ${tsType}`
    })

    return `Array<{ ${fields.join('; ')} }>`
  }
}
