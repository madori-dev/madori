import * as fs from 'fs/promises'
import * as path from 'path'
import { stringify } from 'yaml'

export interface CollectionDefinition {
  title: string
  blueprint: string
  route?: string
  defaultStatus?: string
}

export interface BlueprintFieldDefinition {
  handle: string
  field: {
    type: string
    display?: string
    required?: boolean
    validate?: string[]
  }
}

export interface BlueprintTabDefinition {
  label?: string
  fields: BlueprintFieldDefinition[]
}

export interface BlueprintDefinition {
  tabs: Record<string, BlueprintTabDefinition>
}

export interface FieldsetDefinition {
  handle: string
  fields: BlueprintFieldDefinition[]
}

export interface YamlWriter {
  writeCollection(path: string, definition: CollectionDefinition): Promise<void>
  writeBlueprint(path: string, definition: BlueprintDefinition): Promise<void>
  writeFieldset(path: string, definition: FieldsetDefinition): Promise<void>
  writeEntry(path: string, frontmatter: Record<string, unknown>, content: string): Promise<void>
}

async function ensureDirectory(filePath: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
}

export const yamlWriter: YamlWriter = {
  async writeCollection(filePath: string, definition: CollectionDefinition): Promise<void> {
    await ensureDirectory(filePath)
    const output = stringify(definition)
    await fs.writeFile(filePath, output, 'utf-8')
  },

  async writeBlueprint(filePath: string, definition: BlueprintDefinition): Promise<void> {
    await ensureDirectory(filePath)
    const output = stringify(definition)
    await fs.writeFile(filePath, output, 'utf-8')
  },

  async writeFieldset(filePath: string, definition: FieldsetDefinition): Promise<void> {
    await ensureDirectory(filePath)
    const output = stringify(definition)
    await fs.writeFile(filePath, output, 'utf-8')
  },

  async writeEntry(filePath: string, frontmatter: Record<string, unknown>, content: string): Promise<void> {
    await ensureDirectory(filePath)
    const yamlFrontmatter = stringify(frontmatter)
    const output = `---\n${yamlFrontmatter}---\n\n${content}\n`
    await fs.writeFile(filePath, output, 'utf-8')
  },
}
