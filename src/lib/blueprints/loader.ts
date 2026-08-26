import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { ContentMutationReporter } from '@/lib/mutations'
import { DefinitionRepository, isValidBlueprintHandle, isValidBlueprintType } from './repository'
import type { Blueprint, BlueprintType } from './types'

/** @deprecated Use DefinitionRepository. */
export class BlueprintLoader extends DefinitionRepository {
  constructor(
    fs: FileSystemAdapter,
    parser: ContentParser,
    resourcesPath: string,
    mutations?: ContentMutationReporter
  ) {
    super(fs, parser, resourcesPath, mutations)
  }

  async loadBlueprint(type: BlueprintType, handle: string): Promise<Blueprint | null> {
    return this.read({ kind: 'blueprint', type, handle })
  }

  async listBlueprints(type: BlueprintType): Promise<Blueprint[]> {
    return this.list({ kind: 'blueprint', type })
  }

  getBlueprintPath(type: BlueprintType, handle: string): string {
    this.assertBlueprintReference(type, handle)
    return this.blueprintDefinitionPath(type, handle)
  }

  async saveBlueprint(type: BlueprintType, handle: string, blueprint: Blueprint): Promise<void> {
    await this.write({ kind: 'blueprint', type, handle }, blueprint)
  }

  async deleteBlueprint(type: BlueprintType, handle: string): Promise<boolean> {
    return (await this.remove({ kind: 'blueprint', type, handle })).deleted
  }
}

export { isValidBlueprintHandle, isValidBlueprintType }
