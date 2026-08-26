import * as path from 'path'
import { z } from 'zod'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import type { ContentParser } from '@/lib/fs/parser'
import { ValidationError } from '@/lib/errors'
import type { ContentMutationReporter } from '@/lib/mutations'
import { noOpContentMutationReporter } from '@/lib/mutations'
import { assertContentIdentifier } from '@/lib/content/identifiers'
import { evaluateCondition } from './visibility'
import {
  isFieldDefinition,
  isFieldsetImport,
  type Blueprint,
  type BlueprintTab,
  type BlueprintType,
  type FieldConfig,
  type FieldDefinition,
  type FieldLayoutEntry,
  type Fieldset,
} from './types'
import { BlueprintValidator, FieldLayoutEntrySchema, type BlueprintValidationResult } from './validator'

const BLUEPRINT_TYPES: readonly BlueprintType[] = [
  'collections', 'taxonomies', 'globals', 'forms', 'navigations',
]

export function isValidBlueprintHandle(handle: unknown): handle is string {
  return typeof handle === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(handle)
}

export function isValidBlueprintType(type: unknown): type is BlueprintType {
  return typeof type === 'string' && (BLUEPRINT_TYPES as readonly string[]).includes(type)
}

export interface BlueprintReference {
  kind: 'blueprint'
  type: BlueprintType
  handle: string
}

export interface FieldsetReference {
  kind: 'fieldset'
  handle: string
}

export type DefinitionReference = BlueprintReference | FieldsetReference

export type DefinitionScope =
  | { kind: 'blueprint'; type: BlueprintType }
  | { kind: 'fieldset' }

export interface DefinitionReadOptions {
  resolve?: boolean
}

export type DefinitionDeleteResult =
  | { deleted: true; references: [] }
  | { deleted: false; reason: 'not_found'; references: [] }
  | { deleted: false; reason: 'referenced'; references: string[] }

export interface ValidationResult {
  success: boolean
  errors?: Record<string, string[]>
}

interface RawBlueprintTab {
  display?: string
  label?: string
  sections?: Record<string, { display?: string; fields?: FieldLayoutEntry[] }>
  fields?: FieldLayoutEntry[]
}

interface RawBlueprint {
  tabs?: Record<string, RawBlueprintTab>
}

const FieldsetSchema = z.object({
  fields: z.array(FieldLayoutEntrySchema),
  is_block: z.boolean().optional(),
  display: z.string().optional(),
})

/**
 * Owns Blueprint and Fieldset lifecycle at one filesystem-backed seam.
 * Callers do not need to know paths, YAML shape, atomic-write ordering,
 * import resolution, validation, or reference-safety rules.
 */
export class DefinitionRepository {
  private readonly validator = new BlueprintValidator()
  private readonly atomicWriter: AtomicFileWriter

  constructor(
    protected readonly fs: FileSystemAdapter,
    protected readonly parser: ContentParser,
    protected readonly resourcesPath: string,
    protected readonly mutations: ContentMutationReporter = noOpContentMutationReporter
  ) {
    this.atomicWriter = new AtomicFileWriter(fs)
  }

  async read(reference: BlueprintReference, options?: DefinitionReadOptions): Promise<Blueprint | null>
  async read(reference: FieldsetReference, options?: DefinitionReadOptions): Promise<Fieldset | null>
  async read(
    reference: DefinitionReference,
    options: DefinitionReadOptions = {}
  ): Promise<Blueprint | Fieldset | null> {
    return reference.kind === 'blueprint'
      ? this.readBlueprint(reference.type, reference.handle, options.resolve ?? false)
      : this.readFieldset(reference.handle, options.resolve ?? false)
  }

  async list(scope: { kind: 'blueprint'; type: BlueprintType }): Promise<Blueprint[]>
  async list(scope: { kind: 'fieldset' }): Promise<Fieldset[]>
  async list(scope: DefinitionScope): Promise<Blueprint[] | Fieldset[]> {
    return scope.kind === 'blueprint'
      ? this.listBlueprintDefinitions(scope.type)
      : this.listFieldsetDefinitions()
  }

  async write(reference: BlueprintReference, definition: Blueprint): Promise<Blueprint>
  async write(reference: FieldsetReference, definition: Omit<Fieldset, 'handle'> | Fieldset): Promise<Fieldset>
  async write(
    reference: DefinitionReference,
    definition: Blueprint | Omit<Fieldset, 'handle'> | Fieldset
  ): Promise<Blueprint | Fieldset> {
    this.assertValidReference(reference)
    return reference.kind === 'blueprint'
      ? this.writeBlueprint(reference, definition as Blueprint)
      : this.writeFieldset(reference, definition as Omit<Fieldset, 'handle'> | Fieldset)
  }

  async remove(reference: DefinitionReference): Promise<DefinitionDeleteResult> {
    this.assertValidReference(reference)
    const filePath = this.definitionPath(reference)
    if (!await this.fs.exists(filePath)) {
      return { deleted: false, reason: 'not_found', references: [] }
    }

    const references = await this.findDefinitionReferences(reference, filePath)
    if (references.length > 0) {
      return { deleted: false, reason: 'referenced', references }
    }

    await this.fs.deleteFile(filePath)
    this.reportMutation('delete', reference, filePath)
    return { deleted: true, references: [] }
  }

  validateBlueprint(blueprint: unknown): BlueprintValidationResult {
    return this.validator.validate(blueprint)
  }

  validateFieldset(fieldset: unknown): BlueprintValidationResult {
    const parsed = FieldsetSchema.safeParse(fieldset)
    if (!parsed.success) {
      return {
        success: false,
        warnings: [],
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: 'MISSING_PROPERTY' as const,
        })),
      }
    }

    const blueprint = { tabs: { main: { fields: parsed.data.fields } } }
    return this.validator.validate(blueprint)
  }

  async resolveBlueprint(blueprint: Blueprint): Promise<Blueprint> {
    const tabs: Record<string, BlueprintTab> = {}
    for (const [tabKey, tab] of Object.entries(blueprint.tabs)) {
      tabs[tabKey] = {
        display: tab.display,
        fields: await this.resolveEntries(tab.fields as unknown as FieldLayoutEntry[], []),
      }
      if (tab.sections) {
        tabs[tabKey].sections = {}
        for (const [sectionKey, section] of Object.entries(tab.sections)) {
          tabs[tabKey].sections![sectionKey] = {
            display: section.display,
            fields: await this.resolveEntries(section.fields as unknown as FieldLayoutEntry[], []),
          }
        }
      }
    }
    return { handle: blueprint.handle, tabs }
  }

  async loadFieldset(handle: string): Promise<FieldDefinition[]> {
    const fieldset = await this.readFieldset(handle, true)
    if (!fieldset) throw new Error(`Fieldset "${handle}" not found at ${this.fieldsetPath(handle)}`)
    return fieldset.fields as FieldDefinition[]
  }

  generateZodSchema(blueprint: Blueprint): z.ZodType {
    return z.object(this.dataShape(blueprint))
  }

  validateData(blueprint: Blueprint, data: Record<string, unknown>): ValidationResult {
    const shape: Record<string, z.ZodType> = {}
    for (const tab of Object.values(blueprint.tabs)) {
      const fields = [...tab.fields, ...Object.values(tab.sections ?? {}).flatMap((section) => section.fields)]
      for (const field of fields) {
        if (!field.field.visibility || evaluateCondition(field.field.visibility, data)) {
          shape[field.handle] = this.fieldToZod(field)
        }
      }
    }

    const result = z.object(shape).safeParse(data)
    if (result.success) return { success: true }

    const errors: Record<string, string[]> = {}
    for (const issue of result.error.issues) {
      const fieldPath = issue.path.length > 0 ? issue.path.join('.') : '_root'
      ;(errors[fieldPath] ??= []).push(issue.message)
    }
    return { success: false, errors }
  }

  protected static dependenciesOf(
    repository: DefinitionRepository
  ): [FileSystemAdapter, ContentParser, string, ContentMutationReporter] {
    return [repository.fs, repository.parser, repository.resourcesPath, repository.mutations]
  }

  protected assertBlueprintReference(type: BlueprintType, handle: string): void {
    this.assertValidReference({ kind: 'blueprint', type, handle })
  }

  protected blueprintDefinitionPath(type: BlueprintType, handle: string): string {
    return this.blueprintPath(type, handle)
  }

  private async readBlueprint(type: BlueprintType, handle: string, resolve: boolean): Promise<Blueprint | null> {
    if (!isValidBlueprintType(type) || !isValidBlueprintHandle(handle)) return null
    const filePath = this.blueprintPath(type, handle)
    if (!await this.fs.exists(filePath)) return null

    const parsed = this.parser.parseYaml<RawBlueprint>(await this.fs.readFile(filePath))
    if (!this.validator.validate(parsed).success) return null
    const blueprint = this.normalizeBlueprint(handle, parsed)
    return resolve ? this.resolveBlueprint(blueprint) : blueprint
  }

  private async readFieldset(handle: string, resolve: boolean, stack: string[] = []): Promise<Fieldset | null> {
    assertContentIdentifier(handle, 'fieldset handle')
    if (stack.includes(handle)) {
      throw new Error(`Circular fieldset reference detected: ${[...stack, handle].join(' -> ')}`)
    }
    const filePath = this.fieldsetPath(handle)
    if (!await this.fs.exists(filePath)) return null
    const raw = this.parser.parseYaml<unknown>(await this.fs.readFile(filePath))
    const validation = this.validateFieldset(raw)
    if (!validation.success) return null
    const parsed = FieldsetSchema.parse(raw)
    const fields = resolve
      ? await this.resolveEntries(parsed.fields as FieldLayoutEntry[], [...stack, handle])
      : parsed.fields as FieldLayoutEntry[]
    return {
      handle,
      fields,
      is_block: parsed.is_block ?? false,
      display: parsed.display,
    }
  }

  private async listBlueprintDefinitions(type: BlueprintType): Promise<Blueprint[]> {
    if (!isValidBlueprintType(type)) return []
    const directory = path.join(this.resourcesPath, 'blueprints', type)
    if (!await this.fs.exists(directory)) return []
    const definitions = await Promise.all(
      (await this.fs.listFiles(directory, '*.yaml')).map((file) =>
        this.readBlueprint(type, path.basename(file, '.yaml'), false)
      )
    )
    return definitions.filter((definition): definition is Blueprint => definition !== null)
  }

  private async listFieldsetDefinitions(): Promise<Fieldset[]> {
    const directory = path.join(this.resourcesPath, 'fieldsets')
    if (!await this.fs.exists(directory)) return []
    const definitions = await Promise.all(
      (await this.fs.listFiles(directory, '*.yaml')).map((file) =>
        this.readFieldset(path.basename(file, '.yaml'), false)
      )
    )
    return definitions.filter((definition): definition is Fieldset => definition !== null)
  }

  private async writeBlueprint(reference: BlueprintReference, blueprint: Blueprint): Promise<Blueprint> {
    const definition = { ...blueprint, handle: reference.handle }
    const validation = this.validator.validate(definition)
    if (!validation.success) this.throwValidation('Invalid blueprint', validation)
    await this.persist(reference, this.serializeBlueprint(definition))
    return definition
  }

  private async writeFieldset(
    reference: FieldsetReference,
    fieldset: Omit<Fieldset, 'handle'> | Fieldset
  ): Promise<Fieldset> {
    const definition: Fieldset = {
      handle: reference.handle,
      fields: fieldset.fields,
      is_block: fieldset.is_block ?? false,
      display: fieldset.display,
    }
    const validation = this.validateFieldset(definition)
    if (!validation.success) this.throwValidation('Invalid fieldset', validation)
    await this.persist(reference, this.serializeFieldset(definition))
    return definition
  }

  private async persist(reference: DefinitionReference, content: string): Promise<void> {
    const filePath = this.definitionPath(reference)
    await this.fs.mkdir(path.dirname(filePath))
    const result = await this.atomicWriter.writeFileAtomic(filePath, content)
    if (!result.success) {
      throw result.error ?? new Error(`Failed to save ${reference.kind} "${reference.handle}"`)
    }
    this.reportMutation('update', reference, filePath)
  }

  private async resolveEntries(entries: FieldLayoutEntry[], stack: string[]): Promise<FieldDefinition[]> {
    const resolved: FieldDefinition[] = []
    for (const entry of entries) {
      if (isFieldsetImport(entry)) {
        const fieldset = await this.readFieldset(entry.import, true, stack)
        if (!fieldset) throw new Error(`Fieldset "${entry.import}" not found at ${this.fieldsetPath(entry.import)}`)
        resolved.push(...fieldset.fields as FieldDefinition[])
      } else if (isFieldDefinition(entry)) {
        resolved.push(entry)
      }
    }
    return resolved
  }

  private async findDefinitionReferences(reference: DefinitionReference, targetPath: string): Promise<string[]> {
    const roots = reference.kind === 'blueprint'
      ? [path.join(this.resourcesPath, reference.type)]
      : [path.join(this.resourcesPath, 'blueprints'), path.join(this.resourcesPath, 'fieldsets')]
    const matches: string[] = []

    for (const root of roots) {
      if (!await this.fs.exists(root)) continue
      for (const relativePath of await this.fs.listFiles(root, '**/*.yaml')) {
        const filePath = path.join(root, relativePath)
        if (filePath === targetPath) continue
        const parsed = this.parser.parseYaml<unknown>(await this.fs.readFile(filePath))
        if (this.containsReference(parsed, reference.kind === 'blueprint' ? 'blueprint' : 'import', reference.handle)) {
          matches.push(filePath)
        }
      }
    }
    return matches.sort()
  }

  private containsReference(value: unknown, key: 'blueprint' | 'import', handle: string): boolean {
    if (Array.isArray(value)) return value.some((entry) => this.containsReference(entry, key, handle))
    if (!value || typeof value !== 'object') return false
    return Object.entries(value).some(([entryKey, entryValue]) =>
      (entryKey === key && entryValue === handle) || this.containsReference(entryValue, key, handle)
    )
  }

  private serializeBlueprint(blueprint: Blueprint): string {
    const tabs: Record<string, unknown> = {}
    for (const [tabKey, tab] of Object.entries(blueprint.tabs)) {
      const serialized: Record<string, unknown> = {}
      if (tab.display) serialized.display = tab.display
      serialized.fields = (tab.fields as unknown as FieldLayoutEntry[]).map((entry) => this.serializeEntry(entry))
      if (tab.sections) {
        serialized.sections = Object.fromEntries(Object.entries(tab.sections).map(([sectionKey, section]) => [
          sectionKey,
          {
            ...(section.display ? { display: section.display } : {}),
            fields: (section.fields as unknown as FieldLayoutEntry[]).map((entry) => this.serializeEntry(entry)),
          },
        ]))
      }
      tabs[tabKey] = serialized
    }
    return this.parser.serializeYaml({ tabs })
  }

  private serializeFieldset(fieldset: Fieldset): string {
    return this.parser.serializeYaml({
      fields: fieldset.fields.map((entry) => this.serializeEntry(entry)),
      ...(fieldset.is_block ? { is_block: true } : {}),
      ...(fieldset.display ? { display: fieldset.display } : {}),
    })
  }

  private serializeEntry(entry: FieldLayoutEntry): Record<string, unknown> {
    if (isFieldsetImport(entry)) return { import: entry.import }
    const field: Record<string, unknown> = { type: entry.field.type }
    if (entry.field.display) field.display = entry.field.display
    if (entry.field.instructions) field.instructions = entry.field.instructions
    if (entry.field.required) field.required = true
    if (entry.field.default !== undefined) field.default = entry.field.default
    if (entry.field.validate?.length) field.validate = entry.field.validate
    if (entry.field.options && Object.keys(entry.field.options).length > 0) field.options = entry.field.options
    if (entry.field.visibility) field.visibility = entry.field.visibility
    return { handle: entry.handle, field }
  }

  private normalizeBlueprint(handle: string, raw: RawBlueprint): Blueprint {
    const tabs: Record<string, BlueprintTab> = {}
    for (const [tabKey, rawTab] of Object.entries(raw.tabs ?? {})) {
      tabs[tabKey] = {
        display: rawTab.display ?? rawTab.label,
        fields: (rawTab.fields ?? []) as FieldDefinition[],
      }
      if (rawTab.sections) {
        tabs[tabKey].sections = Object.fromEntries(Object.entries(rawTab.sections).map(([sectionKey, section]) => [
          sectionKey,
          { display: section.display, fields: (section.fields ?? []) as FieldDefinition[] },
        ]))
      }
    }
    return { handle, tabs }
  }

  private dataShape(blueprint: Blueprint): Record<string, z.ZodType> {
    const shape: Record<string, z.ZodType> = {}
    for (const tab of Object.values(blueprint.tabs)) {
      for (const field of [...tab.fields, ...Object.values(tab.sections ?? {}).flatMap((section) => section.fields)]) {
        shape[field.handle] = this.fieldToZod(field)
      }
    }
    return shape
  }

  private fieldToZod(fieldDef: FieldDefinition): z.ZodType {
    const { field } = fieldDef
    let schema = this.fieldTypeToZod(field)
    if (field.default !== undefined) {
      schema = (schema as z.ZodType & { default: (value: unknown) => z.ZodType }).default(field.default)
    }
    if (!field.required && field.default === undefined) schema = schema.optional()
    return schema
  }

  private fieldTypeToZod(field: FieldConfig): z.ZodType {
    switch (field.type) {
      case 'text': return field.required ? z.string().min(1) : z.string()
      case 'slug': return z.string().regex(/^[a-z0-9-]+$/)
      case 'markdown': case 'date': case 'asset': case 'yaml': case 'code': return z.string()
      case 'tiptap': return z.union([z.string(), z.record(z.string(), z.unknown())])
      case 'number': return z.number()
      case 'toggle': return z.boolean()
      case 'select': {
        const options = this.extractSelectOptions(field.options)
        return options?.length ? z.enum(options as [string, ...string[]]) : z.string()
      }
      case 'multiselect': case 'entries': case 'taxonomy': return z.array(z.string())
      case 'replicator': case 'blocks': case 'grid': return z.array(z.record(z.string(), z.unknown()))
      case 'hidden': default: return z.unknown()
    }
  }

  private extractSelectOptions(options?: Record<string, unknown>): string[] | null {
    if (!options) return null
    if (Array.isArray(options)) return options.filter((option): option is string => typeof option === 'string')
    const values = Object.values(options)
    return values.length > 0 && values.every((value) => typeof value === 'string') ? values as string[] : null
  }

  private definitionPath(reference: DefinitionReference): string {
    return reference.kind === 'blueprint'
      ? this.blueprintPath(reference.type, reference.handle)
      : this.fieldsetPath(reference.handle)
  }

  private blueprintPath(type: BlueprintType, handle: string): string {
    return path.join(this.resourcesPath, 'blueprints', type, `${handle}.yaml`)
  }

  private fieldsetPath(handle: string): string {
    return path.join(this.resourcesPath, 'fieldsets', `${handle}.yaml`)
  }

  private assertValidReference(reference: DefinitionReference): void {
    if (reference.kind === 'blueprint' && !isValidBlueprintType(reference.type)) {
      throw new ValidationError('Invalid blueprint type', { type: ['Unsupported blueprint type'] })
    }
    if (!isValidBlueprintHandle(reference.handle)) {
      throw new ValidationError(`Invalid ${reference.kind} handle`, { handle: ['Handle must be a safe filename component'] })
    }
  }

  private throwValidation(message: string, validation: BlueprintValidationResult): never {
    throw new ValidationError(message, {
      definition: validation.errors.map((error) => `${error.path}: ${error.message}`),
    })
  }

  private reportMutation(action: 'update' | 'delete', reference: DefinitionReference, filePath: string): void {
    const name = reference.kind === 'blueprint'
      ? `blueprint ${reference.type}/${reference.handle}`
      : `fieldset ${reference.handle}`
    this.mutations.report({
      action,
      paths: [filePath],
      resource: reference.kind === 'blueprint'
        ? { type: 'blueprint', handle: reference.type, id: reference.handle }
        : { type: 'fieldset', id: reference.handle },
      message: `${action === 'delete' ? 'Deleted' : 'Saved'} ${name}`,
      source: 'system',
      timestamp: Date.now(),
    })
  }
}
