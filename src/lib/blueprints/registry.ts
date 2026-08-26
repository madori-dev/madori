import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { ContentMutationReporter } from '@/lib/mutations'
import { DefinitionRepository, type ValidationResult } from './repository'
import type { Blueprint, BlueprintType } from './types'

const unavailableFileSystem: FileSystemAdapter = {
  readFile: async () => { throw new Error('No filesystem configured') },
  writeFile: async () => { throw new Error('No filesystem configured') },
  deleteFile: async () => { throw new Error('No filesystem configured') },
  exists: async () => false,
  listFiles: async () => [],
  listDirectories: async () => [],
  mkdir: async () => { throw new Error('No filesystem configured') },
  copyFile: async () => { throw new Error('No filesystem configured') },
  moveFile: async () => { throw new Error('No filesystem configured') },
}

const unavailableParser: ContentParser = {
  parseMarkdown: () => { throw new Error('No parser configured') },
  serializeMarkdown: () => { throw new Error('No parser configured') },
  parseYaml: () => { throw new Error('No parser configured') },
  serializeYaml: () => { throw new Error('No parser configured') },
}

/**
 * Backwards-compatible name for DefinitionRepository.
 * Existing callers may still pass a BlueprintLoader; dependencies are adopted
 * without retaining old Registry-to-Loader forwarding seam.
 */
export class BlueprintRegistry extends DefinitionRepository {
  constructor(loader: DefinitionRepository)
  constructor(
    fs: FileSystemAdapter,
    parser: ContentParser,
    resourcesPath: string,
    mutations?: ContentMutationReporter
  )
  constructor(
    source: DefinitionRepository | FileSystemAdapter,
    parser?: ContentParser,
    resourcesPath?: string,
    mutations?: ContentMutationReporter
  ) {
    if (source instanceof DefinitionRepository) {
      super(...BlueprintRegistry.dependenciesOf(source))
      return
    }
    // Some legacy callers constructed a Registry with a loader-shaped test
    // double solely to use in-process validation behaviour.
    if (typeof (source as FileSystemAdapter).readFile !== 'function') {
      super(unavailableFileSystem, unavailableParser, '')
      return
    }
    if (!parser || !resourcesPath) throw new Error('BlueprintRegistry requires parser and resourcesPath')
    super(source, parser, resourcesPath, mutations)
  }

  async getBlueprint(type: BlueprintType, handle: string): Promise<Blueprint | null> {
    return this.read({ kind: 'blueprint', type, handle })
  }

  async listBlueprints(type: BlueprintType): Promise<Blueprint[]> {
    return this.list({ kind: 'blueprint', type })
  }

  async saveBlueprint(type: BlueprintType, handle: string, blueprint: Blueprint): Promise<void> {
    await this.write({ kind: 'blueprint', type, handle }, blueprint)
  }

  async deleteBlueprint(type: BlueprintType, handle: string): Promise<boolean> {
    return (await this.remove({ kind: 'blueprint', type, handle })).deleted
  }
}

export type { ValidationResult }
