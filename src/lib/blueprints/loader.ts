import * as path from 'path'
import { stringify } from 'yaml'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { Blueprint, BlueprintTab, BlueprintType, FieldDefinition } from './types'
import { BlueprintValidator } from './validator'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import { ValidationError } from '@/lib/errors'
import type { ContentMutationReporter } from '@/lib/mutations'
import { noOpContentMutationReporter } from '@/lib/mutations'

const BLUEPRINT_TYPES: readonly BlueprintType[] = [
  'collections', 'taxonomies', 'globals', 'forms', 'navigations',
]

/** Blueprint paths must use a single safe filename component. */
export function isValidBlueprintHandle(handle: unknown): handle is string {
  return typeof handle === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(handle)
}

export function isValidBlueprintType(type: unknown): type is BlueprintType {
  return typeof type === 'string' && (BLUEPRINT_TYPES as readonly string[]).includes(type)
}

/**
 * Raw YAML structure for a blueprint tab before normalization.
 */
interface RawBlueprintTab {
  display?: string
  label?: string
  sections?: Record<string, { display?: string; fields?: RawFieldDefinition[] }>
  fields?: RawFieldDefinition[]
}

/**
 * Raw YAML structure for a field definition.
 */
interface RawFieldDefinition {
  handle: string
  field: Record<string, unknown>
}

/**
 * Raw YAML structure for a blueprint file.
 */
interface RawBlueprint {
  tabs?: Record<string, RawBlueprintTab>
}

/**
 * Loads and parses blueprint YAML files from the resources directory.
 */
export class BlueprintLoader {
  private readonly validator: BlueprintValidator

  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    private readonly resourcesPath: string,
    private readonly mutations: ContentMutationReporter = noOpContentMutationReporter
  ) {
    this.validator = new BlueprintValidator()
  }

  /**
   * Load a single blueprint by type and handle.
   * Returns null if the blueprint file does not exist.
   */
  async loadBlueprint(type: BlueprintType, handle: string): Promise<Blueprint | null> {
    if (!isValidBlueprintType(type) || !isValidBlueprintHandle(handle)) return null
    const filePath = this.getBlueprintPath(type, handle)
    const exists = await this.fs.exists(filePath)

    if (!exists) {
      return null
    }

    const raw = await this.fs.readFile(filePath)
    const parsed = this.parser.parseYaml<RawBlueprint>(raw)

    // Validate blueprint before normalisation; reject invalid blueprints
    const validationResult = this.validator.validate(parsed)
    if (!validationResult.success) {
      return null
    }

    return this.normalizeBlueprint(handle, parsed)
  }

  /**
   * List all blueprints of a given type.
   */
  async listBlueprints(type: BlueprintType): Promise<Blueprint[]> {
    if (!isValidBlueprintType(type)) return []
    const dir = path.join(this.resourcesPath, 'blueprints', type)
    const exists = await this.fs.exists(dir)

    if (!exists) {
      return []
    }

    const files = await this.fs.listFiles(dir, '*.yaml')
    const blueprints: Blueprint[] = []

    for (const file of files) {
      const handle = path.basename(file, '.yaml')
      const blueprint = await this.loadBlueprint(type, handle)
      if (blueprint) {
        blueprints.push(blueprint)
      }
    }

    return blueprints
  }

  /**
   * Get the file path for a blueprint.
   */
  getBlueprintPath(type: BlueprintType, handle: string): string {
    this.assertValidPathInput(type, handle)
    return path.join(this.resourcesPath, 'blueprints', type, `${handle}.yaml`)
  }

  /** Validate untrusted blueprint data before a caller persists it. */
  validateBlueprint(blueprint: unknown) {
    return this.validator.validate(blueprint)
  }

  /**
   * Save a blueprint to disk as YAML.
   */
  async saveBlueprint(type: BlueprintType, handle: string, blueprint: Blueprint): Promise<void> {
    this.assertValidPathInput(type, handle)
    const validation = this.validator.validate(blueprint)
    if (!validation.success) {
      throw new ValidationError('Invalid blueprint', {
        blueprint: validation.errors.map((error) => `${error.path}: ${error.message}`),
      })
    }
    const filePath = this.getBlueprintPath(type, handle)
    const yaml = this.serializeBlueprint(blueprint)
    const result = await new AtomicFileWriter(this.fs).writeFileAtomic(filePath, yaml)
    if (!result.success) {
      throw result.error ?? new Error(`Failed to save blueprint "${type}/${handle}"`)
    }
    this.mutations.report({ action: 'update', paths: [filePath], resource: { type: 'blueprint', handle: type, id: handle }, message: `Saved blueprint ${type}/${handle}`, source: 'system', timestamp: Date.now() })
  }

  /**
   * Delete a blueprint file from disk.
   */
  async deleteBlueprint(type: BlueprintType, handle: string): Promise<boolean> {
    if (!isValidBlueprintType(type) || !isValidBlueprintHandle(handle)) return false
    const filePath = this.getBlueprintPath(type, handle)
    const exists = await this.fs.exists(filePath)
    if (!exists) return false
    await this.fs.deleteFile(filePath)
    this.mutations.report({ action: 'delete', paths: [filePath], resource: { type: 'blueprint', handle: type, id: handle }, message: `Deleted blueprint ${type}/${handle}`, source: 'system', timestamp: Date.now() })
    return true
  }

  /**
   * Serialize a Blueprint back to YAML format for persistence.
   */
  private serializeBlueprint(blueprint: Blueprint): string {
    const output: Record<string, unknown> = { tabs: {} }

    for (const [tabKey, tab] of Object.entries(blueprint.tabs)) {
      const tabOutput: Record<string, unknown> = {}
      if (tab.display) tabOutput.display = tab.display
      tabOutput.fields = tab.fields.map((f) => this.serializeField(f))
      if (tab.sections) {
        tabOutput.sections = {}
        for (const [secKey, sec] of Object.entries(tab.sections)) {
          const secOutput: Record<string, unknown> = {}
          if (sec.display) secOutput.display = sec.display
          if (sec.fields.length > 0) {
            secOutput.fields = sec.fields.map((f) => this.serializeField(f))
          }
          ;(tabOutput.sections as Record<string, unknown>)[secKey] = secOutput
        }
      }
      ;(output.tabs as Record<string, unknown>)[tabKey] = tabOutput
    }

    return stringify(output, { lineWidth: 120 })
  }

  private assertValidPathInput(type: unknown, handle: unknown): asserts type is BlueprintType {
    if (!isValidBlueprintType(type)) {
      throw new ValidationError('Invalid blueprint type', { type: ['Unsupported blueprint type'] })
    }
    if (!isValidBlueprintHandle(handle)) {
      throw new ValidationError('Invalid blueprint handle', { handle: ['Handle must be a safe filename component'] })
    }
  }

  /**
   * Serialize a single field definition for YAML output.
   */
  private serializeField(def: FieldDefinition): Record<string, unknown> {
    const field: Record<string, unknown> = { type: def.field.type }
    if (def.field.display) field.display = def.field.display
    if (def.field.instructions) field.instructions = def.field.instructions
    if (def.field.required) field.required = true
    if (def.field.default !== undefined) field.default = def.field.default
    if (def.field.validate?.length) field.validate = def.field.validate
    if (def.field.options && Object.keys(def.field.options).length > 0) field.options = def.field.options
    if (def.field.visibility) field.visibility = def.field.visibility
    return { handle: def.handle, field }
  }

  /**
   * Normalize raw parsed YAML into a typed Blueprint structure.
   */
  private normalizeBlueprint(handle: string, raw: RawBlueprint): Blueprint {
    const tabs: Record<string, BlueprintTab> = {}

    if (raw.tabs) {
      for (const [tabKey, rawTab] of Object.entries(raw.tabs)) {
        tabs[tabKey] = this.normalizeTab(rawTab)
      }
    }

    return { handle, tabs }
  }

  /**
   * Normalize a raw tab into a typed BlueprintTab.
   */
  private normalizeTab(rawTab: RawBlueprintTab): BlueprintTab {
    const tab: BlueprintTab = {
      display: rawTab.display ?? rawTab.label,
      fields: this.normalizeFields(rawTab.fields),
    }

    if (rawTab.sections) {
      tab.sections = {}
      for (const [sectionKey, rawSection] of Object.entries(rawTab.sections)) {
        tab.sections[sectionKey] = {
          display: rawSection.display,
          fields: this.normalizeFields(rawSection.fields),
        }
      }
    }

    return tab
  }

  /**
   * Normalize raw field definitions into typed FieldDefinition[].
   */
  private normalizeFields(rawFields?: RawFieldDefinition[]): FieldDefinition[] {
    if (!rawFields || !Array.isArray(rawFields)) {
      return []
    }

    return rawFields.map((rawField) => ({
      handle: rawField.handle,
      field: {
        type: rawField.field.type as FieldDefinition['field']['type'],
        display: rawField.field.display as string | undefined,
        instructions: rawField.field.instructions as string | undefined,
        required: rawField.field.required as boolean | undefined,
        default: rawField.field.default,
        validate: rawField.field.validate as string[] | undefined,
        options: rawField.field.options as Record<string, unknown> | undefined,
        visibility: rawField.field.visibility as FieldDefinition['field']['visibility'],
      },
    }))
  }
}
