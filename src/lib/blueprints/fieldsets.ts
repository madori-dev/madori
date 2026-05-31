import * as path from 'path'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { Blueprint, BlueprintTab, FieldDefinition } from './types'

/**
 * Raw YAML structure for a fieldset file.
 */
interface RawFieldset {
  fields?: RawFieldsetEntry[]
}

/**
 * A single entry in a fieldset's fields array.
 * Can be either a field definition or an import reference.
 */
interface RawFieldsetEntry {
  handle?: string
  field?: Record<string, unknown>
  import?: string
}

/**
 * Resolves fieldset references within blueprints.
 *
 * Fieldsets are reusable field groups stored as YAML files in `resources/fieldsets/`.
 * A blueprint can reference a fieldset using an `import` key in a field definition.
 * The resolver replaces import references with the resolved field definitions.
 */
export class FieldsetResolver {
  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    private readonly resourcesPath: string
  ) {}

  /**
   * Resolve all fieldset imports in a blueprint.
   * Returns a new blueprint with all import references replaced by their field definitions.
   */
  async resolveBlueprint(blueprint: Blueprint): Promise<Blueprint> {
    const resolvedTabs: Record<string, BlueprintTab> = {}

    for (const [tabKey, tab] of Object.entries(blueprint.tabs)) {
      resolvedTabs[tabKey] = await this.resolveTab(tab)
    }

    return { handle: blueprint.handle, tabs: resolvedTabs }
  }

  /**
   * Load a single fieldset by handle.
   * Returns the resolved field definitions from the fieldset file.
   */
  async loadFieldset(handle: string): Promise<FieldDefinition[]> {
    return this.loadFieldsetWithStack(handle, [])
  }

  /**
   * Load a fieldset while tracking the resolution stack to detect circular references.
   */
  private async loadFieldsetWithStack(
    handle: string,
    stack: string[]
  ): Promise<FieldDefinition[]> {
    if (stack.includes(handle)) {
      const cycle = [...stack, handle].join(' -> ')
      throw new Error(`Circular fieldset reference detected: ${cycle}`)
    }

    const filePath = path.join(this.resourcesPath, 'fieldsets', `${handle}.yaml`)
    const exists = await this.fs.exists(filePath)

    if (!exists) {
      throw new Error(`Fieldset "${handle}" not found at ${filePath}`)
    }

    const raw = await this.fs.readFile(filePath)
    const parsed = this.parser.parseYaml<RawFieldset>(raw)

    if (!parsed.fields || !Array.isArray(parsed.fields)) {
      return []
    }

    const newStack = [...stack, handle]
    return this.resolveFieldEntries(parsed.fields, newStack)
  }

  /**
   * Resolve a tab's fields and sections, replacing import references.
   */
  private async resolveTab(tab: BlueprintTab): Promise<BlueprintTab> {
    const resolvedFields = await this.resolveFieldsFromRaw(tab.fields)

    const resolvedTab: BlueprintTab = {
      display: tab.display,
      fields: resolvedFields,
    }

    if (tab.sections) {
      resolvedTab.sections = {}
      for (const [sectionKey, section] of Object.entries(tab.sections)) {
        resolvedTab.sections[sectionKey] = {
          display: section.display,
          fields: await this.resolveFieldsFromRaw(section.fields),
        }
      }
    }

    return resolvedTab
  }

  /**
   * Resolve an array of already-typed FieldDefinition[], handling any that
   * might have been loaded with an import key still present.
   * This handles the case where the blueprint has already been normalized
   * but may contain import entries mixed in.
   */
  private async resolveFieldsFromRaw(
    fields: FieldDefinition[]
  ): Promise<FieldDefinition[]> {
    const resolved: FieldDefinition[] = []

    for (const field of fields) {
      // Check if this is actually an import reference (cast to check raw shape)
      const raw = field as unknown as RawFieldsetEntry
      if (raw.import) {
        const imported = await this.loadFieldsetWithStack(raw.import, [])
        resolved.push(...imported)
      } else {
        resolved.push(field)
      }
    }

    return resolved
  }

  /**
   * Resolve an array of raw fieldset entries, expanding import references.
   */
  private async resolveFieldEntries(
    entries: RawFieldsetEntry[],
    stack: string[]
  ): Promise<FieldDefinition[]> {
    const resolved: FieldDefinition[] = []

    for (const entry of entries) {
      if (entry.import) {
        const imported = await this.loadFieldsetWithStack(entry.import, stack)
        resolved.push(...imported)
      } else if (entry.handle && entry.field) {
        resolved.push({
          handle: entry.handle,
          field: {
            type: entry.field.type as FieldDefinition['field']['type'],
            display: entry.field.display as string | undefined,
            required: entry.field.required as boolean | undefined,
            default: entry.field.default,
            validate: entry.field.validate as string[] | undefined,
            options: entry.field.options as Record<string, unknown> | undefined,
            visibility: entry.field.visibility as FieldDefinition['field']['visibility'],
          },
        })
      }
    }

    return resolved
  }
}
