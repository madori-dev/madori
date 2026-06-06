import * as fs from 'fs/promises'
import { validateHandle } from '../utils/handle-validator.js'
import { yamlWriter } from '../utils/yaml-writer.js'
import { resolveProjectPath } from '../utils/resolve-paths.js'

import type { CollectionDefinition, BlueprintDefinition, BlueprintFieldDefinition } from '../utils/yaml-writer.js'

export interface FieldDefinition {
  handle: string
  type: string
  display?: string
  required?: boolean
}

export interface ScaffoldCollectionOptions {
  handle: string
  fields?: FieldDefinition[]
  route?: string
}

export interface GenerationResult {
  files: string[]
}

/**
 * Parse a comma-separated field definitions string into FieldDefinition[].
 * Format: "handle:type[:required],handle:type[:required]"
 * Example: "title:text:required,body:tiptap,author:text"
 */
export function parseFieldDefinitions(fieldsStr: string): FieldDefinition[] {
  if (!fieldsStr.trim()) {
    return []
  }

  return fieldsStr.split(',').map((segment) => {
    const parts = segment.trim().split(':')
    const handle = parts[0]
    const type = parts[1] || 'text'
    const required = parts[2] === 'required'

    return {
      handle,
      type,
      display: toTitleCase(handle),
      required: required || undefined,
    }
  })
}

/**
 * Convert a handle to title case for display purposes.
 * Replaces hyphens and underscores with spaces, capitalises each word.
 */
function toTitleCase(handle: string): string {
  return handle
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/**
 * Check whether a file exists at the given path.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Generate a complete collection scaffold: collection YAML, blueprint YAML,
 * and an example entry Markdown file.
 */
export async function generateCollection(options: ScaffoldCollectionOptions): Promise<GenerationResult> {
  const { handle, fields = [], route } = options

  // Validate handle
  const validation = validateHandle(handle)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  // Resolve target paths
  const collectionPath = resolveProjectPath('resources', 'collections', `${handle}.yaml`)
  const blueprintPath = resolveProjectPath('resources', 'blueprints', 'collections', `${handle}.yaml`)
  const entryPath = resolveProjectPath('content', 'collections', handle, 'example.md')

  // Check for existing files
  const conflicts: string[] = []
  if (await fileExists(collectionPath)) conflicts.push(collectionPath)
  if (await fileExists(blueprintPath)) conflicts.push(blueprintPath)
  if (await fileExists(entryPath)) conflicts.push(entryPath)

  if (conflicts.length > 0) {
    throw new Error(
      `Collection "${handle}" already exists. Conflicting files:\n${conflicts.map((f) => `  - ${f}`).join('\n')}`
    )
  }

  const title = toTitleCase(handle)
  const collectionRoute = route || `/${handle}/{slug}`

  // Generate collection definition
  const collectionDef: CollectionDefinition = {
    title,
    blueprint: handle,
    route: collectionRoute,
  }

  // Generate blueprint definition
  const blueprintFields: BlueprintFieldDefinition[] = fields.map((f) => ({
    handle: f.handle,
    field: {
      type: f.type,
      display: f.display || toTitleCase(f.handle),
      ...(f.required ? { required: true } : {}),
    },
  }))

  const blueprintDef: BlueprintDefinition = {
    tabs: {
      main: {
        label: 'Main',
        fields: blueprintFields,
      },
    },
  }

  // Generate example entry frontmatter
  const now = new Date().toISOString()
  const frontmatter: Record<string, unknown> = {
    title: `Example ${title}`,
    slug: 'example',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }

  const entryContent = `# Example ${title}\n\nThis is an example entry for the ${handle} collection.`

  // Write all files
  await yamlWriter.writeCollection(collectionPath, collectionDef)
  await yamlWriter.writeBlueprint(blueprintPath, blueprintDef)
  await yamlWriter.writeEntry(entryPath, frontmatter, entryContent)

  return {
    files: [collectionPath, blueprintPath, entryPath],
  }
}
