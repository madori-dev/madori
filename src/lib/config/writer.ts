import fs from 'node:fs/promises'
import path from 'node:path'
import { CollectionConfigSchema, type CollectionConfig } from './schema'

export interface ConfigWriter {
  readCollectionConfig(handle: string): Promise<CollectionConfig | null>
  writeCollectionConfig(handle: string, config: CollectionConfig): Promise<void>
  deleteCollectionConfig(handle: string): Promise<boolean>
}

export class FileConfigWriter implements ConfigWriter {
  constructor(private readonly configPath: string) {}

  async readCollectionConfig(handle: string): Promise<CollectionConfig | null> {
    // Dynamically import the config file to get parsed state
    const absolutePath = path.resolve(this.configPath)
    const cacheBuster = `?t=${Date.now()}`
    const module = await import(/* webpackIgnore: true */ `${absolutePath}${cacheBuster}`)
    const rawConfig = module.default ?? module

    const collections = rawConfig.collections
    if (!collections || !(handle in collections)) {
      return null
    }

    const result = CollectionConfigSchema.safeParse(collections[handle])
    if (!result.success) {
      return null
    }

    return result.data
  }

  async writeCollectionConfig(handle: string, config: CollectionConfig): Promise<void> {
    const absolutePath = path.resolve(this.configPath)

    // Check file is writable
    try {
      await fs.access(absolutePath, fs.constants.W_OK)
    } catch {
      throw new Error(
        `Cannot write to config file at "${absolutePath}". Check file permissions.`
      )
    }

    const content = await fs.readFile(absolutePath, 'utf-8')

    // Find the collections block and the target handle's object within it
    const updated = replaceCollectionEntry(content, handle, config)

    await fs.writeFile(absolutePath, updated, 'utf-8')
  }

  async deleteCollectionConfig(handle: string): Promise<boolean> {
    const absolutePath = path.resolve(this.configPath)

    try {
      await fs.access(absolutePath, fs.constants.W_OK)
    } catch {
      throw new Error(
        `Cannot write to config file at "${absolutePath}". Check file permissions.`
      )
    }

    const content = await fs.readFile(absolutePath, 'utf-8')

    try {
      const updated = removeCollectionEntry(content, handle)
      await fs.writeFile(absolutePath, updated, 'utf-8')
      return true
    } catch {
      return false
    }
  }
}

/**
 * Finds the collection entry for `handle` in the config file text and replaces
 * it with a serialized version of `config`.
 */
export function replaceCollectionEntry(
  content: string,
  handle: string,
  config: CollectionConfig
): string {
  // Find the `collections:` or `collections :` block opening brace
  const collectionsMatch = content.match(/collections\s*:\s*\{/)
  if (!collectionsMatch || collectionsMatch.index === undefined) {
    throw new Error('Could not find "collections" block in config file.')
  }

  const collectionsStart = collectionsMatch.index + collectionsMatch[0].length

  // Find the target handle entry within the collections block
  // Matches patterns like: blog: { or 'blog': { or "blog": {
  const handlePattern = new RegExp(
    `([ \\t]*)(${escapeRegex(handle)}|'${escapeRegex(handle)}'|"${escapeRegex(handle)}")\\s*:\\s*\\{`
  )

  const searchRegion = content.slice(collectionsStart)
  const handleMatch = searchRegion.match(handlePattern)

  if (!handleMatch || handleMatch.index === undefined) {
    throw new Error(
      `Could not find collection "${handle}" in the collections block.`
    )
  }

  const indent = handleMatch[1]
  const handleKey = handleMatch[2]

  // Find the opening brace of the handle's object
  const objectStartInRegion = handleMatch.index + handleMatch[0].length - 1
  const absoluteObjectStart = collectionsStart + objectStartInRegion

  // Use balanced brace counting to find the end of the object
  const objectEnd = findClosingBrace(content, absoluteObjectStart)
  if (objectEnd === -1) {
    throw new Error(
      `Could not find closing brace for collection "${handle}" object.`
    )
  }

  // Serialize the new config as a TS object literal
  const serialized = serializeToTsObject(config, indent + '  ')

  // Build the replacement: handle key + serialized object
  const beforeEntry = content.slice(
    0,
    collectionsStart + handleMatch.index
  )
  const afterEntry = content.slice(objectEnd + 1)

  return `${beforeEntry}${indent}${handleKey}: ${serialized}${afterEntry}`
}

/**
 * Removes a collection entry from the config file text.
 */
export function removeCollectionEntry(content: string, handle: string): string {
  const collectionsMatch = content.match(/collections\s*:\s*\{/)
  if (!collectionsMatch || collectionsMatch.index === undefined) {
    throw new Error('Could not find "collections" block in config file.')
  }

  const collectionsStart = collectionsMatch.index + collectionsMatch[0].length

  const handlePattern = new RegExp(
    `([ \\t]*)(${escapeRegex(handle)}|'${escapeRegex(handle)}'|"${escapeRegex(handle)}")\\s*:\\s*\\{`
  )

  const searchRegion = content.slice(collectionsStart)
  const handleMatch = searchRegion.match(handlePattern)

  if (!handleMatch || handleMatch.index === undefined) {
    throw new Error(`Could not find collection "${handle}" in the collections block.`)
  }

  const objectStartInRegion = handleMatch.index + handleMatch[0].length - 1
  const absoluteObjectStart = collectionsStart + objectStartInRegion

  const objectEnd = findClosingBrace(content, absoluteObjectStart)
  if (objectEnd === -1) {
    throw new Error(`Could not find closing brace for collection "${handle}" object.`)
  }

  // Remove from the start of the handle key to after the closing brace
  // Also consume any trailing comma and whitespace/newline
  const entryStart = collectionsStart + handleMatch.index
  let entryEnd = objectEnd + 1
  // Skip trailing comma
  if (content[entryEnd] === ',') entryEnd++
  // Skip trailing whitespace/newline
  while (entryEnd < content.length && (content[entryEnd] === ' ' || content[entryEnd] === '\t' || content[entryEnd] === '\n' || content[entryEnd] === '\r')) {
    entryEnd++
  }

  return content.slice(0, entryStart) + content.slice(entryEnd)
}

/**
 * Find the index of the closing brace that matches the opening brace at `startIndex`.
 */
export function findClosingBrace(content: string, startIndex: number): number {
  if (content[startIndex] !== '{') {
    return -1
  }

  let depth = 0
  let inString: string | null = null
  let escaped = false

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\' && inString) {
      escaped = true
      continue
    }

    if (inString) {
      if (char === inString) {
        inString = null
      }
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      inString = char
      continue
    }

    if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) {
        return i
      }
    }
  }

  return -1
}

/**
 * Serializes a CollectionConfig object to a TypeScript object literal string.
 */
export function serializeToTsObject(
  obj: CollectionConfig,
  indent: string
): string {
  const entries: string[] = []

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue

    const serializedValue = serializeValue(value, indent + '  ')
    // Quote keys that contain special characters
    const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      ? key
      : `'${key}'`
    entries.push(`${indent}${formattedKey}: ${serializedValue},`)
  }

  if (entries.length === 0) {
    return '{}'
  }

  const outerIndent = indent.slice(2) || ''
  return `{\n${entries.join('\n')}\n${outerIndent}}`
}

function serializeValue(value: unknown, indent: string): string {
  if (value === null || value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'string') {
    return `'${escapeString(value)}'`
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((v) => serializeValue(v, indent + '  '))
    // Short arrays inline
    if (items.every((i) => !i.includes('\n')) && items.join(', ').length < 60) {
      return `[${items.join(', ')}]`
    }
    return `[\n${items.map((i) => `${indent}  ${i},`).join('\n')}\n${indent}]`
  }

  if (typeof value === 'object') {
    const entries: string[] = []
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === undefined) continue
      const serializedVal = serializeValue(val, indent + '  ')
      const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
        ? key
        : `'${key}'`
      entries.push(`${indent}  ${formattedKey}: ${serializedVal},`)
    }
    if (entries.length === 0) return '{}'
    return `{\n${entries.join('\n')}\n${indent}}`
  }

  return String(value)
}

function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
