import * as path from 'path'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import type { Blueprint, BlueprintTab, BlueprintType, FieldDefinition } from './types'
import { BlueprintValidator } from './validator'

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
    private readonly resourcesPath: string
  ) {
    this.validator = new BlueprintValidator()
  }

  /**
   * Load a single blueprint by type and handle.
   * Returns null if the blueprint file does not exist.
   */
  async loadBlueprint(type: BlueprintType, handle: string): Promise<Blueprint | null> {
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
    return path.join(this.resourcesPath, 'blueprints', type, `${handle}.yaml`)
  }

  /**
   * Save a blueprint to disk as YAML.
   */
  async saveBlueprint(type: BlueprintType, handle: string, blueprint: Blueprint): Promise<void> {
    const filePath = this.getBlueprintPath(type, handle)
    const yaml = this.serializeBlueprint(blueprint)
    await this.fs.writeFile(filePath, yaml)
  }

  /**
   * Delete a blueprint file from disk.
   */
  async deleteBlueprint(type: BlueprintType, handle: string): Promise<boolean> {
    const filePath = this.getBlueprintPath(type, handle)
    const exists = await this.fs.exists(filePath)
    if (!exists) return false
    await this.fs.deleteFile(filePath)
    return true
  }

  /**
   * Serialize a Blueprint back to YAML format for persistence.
   */
  private serializeBlueprint(blueprint: Blueprint): string {
    const { stringify } = require('yaml')
    const output: Record<string, unknown> = { tabs: {} }

    for (const [tabKey, tab] of Object.entries(blueprint.tabs)) {
      const tabOutput: Record<string, unknown> = {}
      if (tab.display) tabOutput.display = tab.display
      if (tab.fields.length > 0) {
        tabOutput.fields = tab.fields.map((f) => this.serializeField(f))
      }
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

  /**
   * Serialize a single field definition for YAML output.
   */
  private serializeField(def: FieldDefinition): Record<string, unknown> {
    const field: Record<string, unknown> = { type: def.field.type }
    if (def.field.display) field.display = def.field.display
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
        required: rawField.field.required as boolean | undefined,
        default: rawField.field.default,
        validate: rawField.field.validate as string[] | undefined,
        options: rawField.field.options as Record<string, unknown> | undefined,
        visibility: rawField.field.visibility as FieldDefinition['field']['visibility'],
      },
    }))
  }
}
