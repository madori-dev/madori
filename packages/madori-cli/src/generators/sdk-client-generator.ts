import type { Blueprint } from '@madori/lib/blueprints/types.js'
import type { GeneratedFile, SDKClientGeneratorInterface } from './generation-pipeline.js'
import { toPascalCaseEntry } from './type-generator.js'

/**
 * SDKClientGenerator produces the `.madori/generated/client.ts` module that
 * instantiates a typed Madori client by wiring project-specific collection
 * types into the generic `@madori/sdk` base.
 */
export class SDKClientGenerator implements SDKClientGeneratorInterface {
  /**
   * Generate the typed client module from blueprints.
   *
   * Produces a single `client.ts` file that:
   * - Imports `createClient` from `@madori/sdk`
   * - Imports generated type interfaces for each collection
   * - Defines a `CollectionTypeMap` interface mapping handle → type
   * - Exports a configured typed client instance
   */
  generate(blueprints: Blueprint[]): GeneratedFile {
    const handles = blueprints.map((bp) => bp.handle)
    const typeNames = handles.map((h) => toPascalCaseEntry(h))

    const importStatements = this.buildImportStatements(handles, typeNames)
    const typeMapInterface = this.buildCollectionTypeMap(handles, typeNames)
    const clientExport = this.buildClientExport()
    const typeExport = `export type { CollectionTypeMap }`

    const content = [
      importStatements,
      '',
      typeMapInterface,
      '',
      clientExport,
      '',
      typeExport,
      '',
    ].join('\n')

    return {
      filename: 'client.ts',
      content,
    }
  }

  /**
   * Build import statements for createClient and all generated types.
   */
  private buildImportStatements(handles: string[], typeNames: string[]): string {
    const lines: string[] = [
      `import { createClient } from '@madori/sdk'`,
    ]

    for (let i = 0; i < handles.length; i++) {
      lines.push(`import type { ${typeNames[i]} } from './types/${handles[i]}.js'`)
    }

    return lines.join('\n')
  }

  /**
   * Build the CollectionTypeMap interface mapping collection handles to their types.
   */
  private buildCollectionTypeMap(handles: string[], typeNames: string[]): string {
    const fields = handles.map((handle, i) => `  ${handle}: ${typeNames[i]}`)

    return [
      'export interface CollectionTypeMap {',
      ...fields,
      '}',
    ].join('\n')
  }

  /**
   * Build the client export with default configuration.
   */
  private buildClientExport(): string {
    return [
      `export const madoriClient = createClient<CollectionTypeMap>({`,
      `  contentPath: 'content',`,
      `  resourcesPath: 'resources',`,
      `})`,
    ].join('\n')
  }
}
