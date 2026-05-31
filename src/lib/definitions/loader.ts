import * as fs from 'fs/promises'
import * as path from 'path'
import { glob } from 'glob'
import { UniversalFileParser, type FileFormat } from '@/lib/fs/parser'
import { DefinitionSchemas } from '@/lib/definitions/schemas'
import {
  type EntityType,
  DefinitionParseError,
  DefinitionValidationError,
  DefinitionNotFoundError,
} from '@/lib/definitions/errors'
import { deriveHandle } from '@/lib/definitions/utils'

export interface DefinitionFile {
  handle: string
  path: string
  format: FileFormat
}

export class DefinitionLoader {
  private parser: UniversalFileParser
  private resourcesPath: string

  constructor(resourcesPath: string = './resources') {
    this.parser = new UniversalFileParser()
    this.resourcesPath = resourcesPath
  }

  /**
   * Discover all definition files for a given entity type.
   * Returns a Map of handle → DefinitionFile (metadata only, no parsing).
   */
  async discover(entityType: EntityType): Promise<Map<string, DefinitionFile>> {
    const pattern = path.join(this.resourcesPath, entityType, '*.{yaml,yml,json}')
    const files = await glob(pattern)
    const result = new Map<string, DefinitionFile>()

    for (const filePath of files) {
      const handle = this.deriveHandle(filePath)
      const format = this.parser.detectFormat(filePath)
      result.set(handle, {
        handle,
        path: filePath,
        format,
      })
    }

    return result
  }

  /**
   * Load a single definition file, parse it, and validate against the schema.
   * Throws DefinitionNotFoundError if the file doesn't exist.
   * Throws DefinitionParseError on invalid YAML/JSON.
   * Throws DefinitionValidationError on schema validation failure.
   */
  async load<T>(entityType: EntityType, handle: string): Promise<T> {
    const definitions = await this.discover(entityType)
    const def = definitions.get(handle)

    if (!def) {
      throw new DefinitionNotFoundError(entityType, handle)
    }

    return this.loadFile<T>(entityType, def)
  }

  /**
   * Load all definitions for a given entity type.
   * Returns a Map of handle → validated data.
   */
  async loadAll<T>(entityType: EntityType): Promise<Map<string, T>> {
    const definitions = await this.discover(entityType)
    const result = new Map<string, T>()

    for (const [handle, def] of definitions) {
      const data = await this.loadFile<T>(entityType, def)
      result.set(handle, data)
    }

    return result
  }

  /**
   * Create a new definition file at resources/{entityType}/{handle}.yaml.
   * Validates data against schema before writing.
   * Creates the directory if it doesn't exist.
   */
  async create(entityType: EntityType, handle: string, data: unknown): Promise<void> {
    this.validate(entityType, handle, data)

    const dir = path.join(this.resourcesPath, entityType)
    await fs.mkdir(dir, { recursive: true })

    const filePath = path.join(dir, `${handle}.yaml`)
    const content = this.parser.serialize(data, 'yaml')
    await fs.writeFile(filePath, content, 'utf-8')
  }

  /**
   * Update an existing definition file, preserving its format.
   * Throws DefinitionNotFoundError if the file doesn't exist.
   * Validates data against schema before writing.
   */
  async update(entityType: EntityType, handle: string, data: unknown): Promise<void> {
    const definitions = await this.discover(entityType)
    const def = definitions.get(handle)

    if (!def) {
      throw new DefinitionNotFoundError(entityType, handle)
    }

    this.validate(entityType, handle, data)

    const content = this.parser.serialize(data, def.format)
    await fs.writeFile(def.path, content, 'utf-8')
  }

  /**
   * Delete an existing definition file.
   * Throws DefinitionNotFoundError if the file doesn't exist.
   */
  async delete(entityType: EntityType, handle: string): Promise<void> {
    const definitions = await this.discover(entityType)
    const def = definitions.get(handle)

    if (!def) {
      throw new DefinitionNotFoundError(entityType, handle)
    }

    await fs.unlink(def.path)
  }

  /**
   * Validate data against the schema for the given entity type.
   * Throws DefinitionValidationError on failure.
   */
  private validate(entityType: EntityType, handle: string, data: unknown): void {
    const schema = DefinitionSchemas[entityType]
    const result = schema.safeParse(data)

    if (!result.success) {
      const issue = result.error.issues[0]
      const field = issue.path.length > 0 ? issue.path.join('.') : 'root'
      const filePath = path.join(this.resourcesPath, entityType, `${handle}`)
      throw new DefinitionValidationError(filePath, field, issue.message)
    }
  }

  /**
   * Derive handle from a file path by stripping directory and extension.
   */
  private deriveHandle(filePath: string): string {
    return deriveHandle(filePath)
  }

  /**
   * Read, parse, and validate a single definition file.
   */
  private async loadFile<T>(entityType: EntityType, def: DefinitionFile): Promise<T> {
    let content: string
    try {
      content = await fs.readFile(def.path, 'utf-8')
    } catch (err) {
      throw new DefinitionParseError(def.path, err as Error)
    }

    let parsed: unknown
    try {
      parsed = this.parser.parse(def.path, content)
    } catch (err) {
      throw new DefinitionParseError(def.path, err as Error)
    }

    const schema = DefinitionSchemas[entityType]
    const result = schema.safeParse(parsed)

    if (!result.success) {
      const issue = result.error.issues[0]
      const field = issue.path.length > 0 ? issue.path.join('.') : 'root'
      throw new DefinitionValidationError(def.path, field, issue.message)
    }

    return result.data as T
  }
}
