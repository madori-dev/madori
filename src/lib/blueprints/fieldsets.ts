import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import { DefinitionRepository } from './repository'

/** @deprecated Use DefinitionRepository. */
export class FieldsetResolver extends DefinitionRepository {
  constructor(fs: FileSystemAdapter, parser: ContentParser, resourcesPath: string) {
    super(fs, parser, resourcesPath)
  }
}
