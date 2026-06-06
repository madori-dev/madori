import * as fs from 'fs/promises'
import matter from 'gray-matter'
import { z } from 'zod/v4'
import { input, confirm } from '@inquirer/prompts'
import { inferFieldTypeFromValue, inferFieldTypeFromSchema } from '../utils/field-type-inference.js'
import type { MadoriFieldType, JsonSchemaProperty } from '../utils/field-type-inference.js'
import { yamlWriter } from '../utils/yaml-writer.js'
import type { BlueprintDefinition, BlueprintFieldDefinition } from '../utils/yaml-writer.js'
import { validateHandle } from '../utils/handle-validator.js'
import { resolveProjectPath } from '../utils/resolve-paths.js'

// --- Interfaces ---

export interface InferredField {
  handle: string
  type: MadoriFieldType
  display: string
  required: boolean
  inferred: boolean
  confidence: 'high' | 'low'
}

export interface BlueprintGenerationResult {
  definition: BlueprintDefinition
  fields: InferredField[]
  outputPath: string
  written: boolean
  validationErrors?: string[]
}

// --- System fields to skip during content inference ---

const SYSTEM_FIELDS = new Set([
  'title',
  'slug',
  'status',
  'createdAt',
  'updatedAt',
  'created_at',
  'updated_at',
])

// --- Zod validation schema ---

const VALID_FIELD_TYPES: MadoriFieldType[] = [
  'date',
  'toggle',
  'integer',
  'float',
  'tags',
  'text',
  'textarea',
  'select',
  'tiptap',
  'assets',
]

const blueprintFieldSchema = z.object({
  handle: z.string().min(1),
  field: z.object({
    type: z.enum(VALID_FIELD_TYPES as [MadoriFieldType, ...MadoriFieldType[]]),
    display: z.string().optional(),
    required: z.boolean().optional(),
    validate: z.array(z.string()).optional(),
  }),
})

const blueprintTabSchema = z.object({
  label: z.string().optional(),
  fields: z.array(blueprintFieldSchema).min(1),
})

const blueprintSchema = z.object({
  tabs: z.record(z.string(), blueprintTabSchema).refine(
    (tabs) => Object.keys(tabs).length >= 1,
    { message: 'Blueprint must have at least one tab' }
  ),
})

// --- Validation ---

export function validateBlueprintSchema(definition: BlueprintDefinition): { valid: boolean; errors?: string[] } {
  const result = blueprintSchema.safeParse(definition)
  if (result.success) {
    return { valid: true }
  }
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })
  return { valid: false, errors }
}

// --- From Content mode ---

export async function generateBlueprintFromContent(
  handle: string,
  contentPath: string
): Promise<BlueprintGenerationResult> {
  const handleResult = validateHandle(handle)
  if (!handleResult.valid) {
    throw new Error(`Invalid handle: ${handleResult.error}`)
  }

  const fileContent = await fs.readFile(contentPath, 'utf-8')
  const parsed = matter(fileContent)
  const frontmatter = parsed.data as Record<string, unknown>

  const fields: InferredField[] = []

  for (const [key, value] of Object.entries(frontmatter)) {
    if (SYSTEM_FIELDS.has(key)) {
      continue
    }

    const inference = inferFieldTypeFromValue(value)

    if (inference.confidence === 'low') {
      console.warn(`Field "${key}": unknown type, defaulting to "text"`)
    }

    fields.push({
      handle: key,
      type: inference.type,
      display: toDisplayName(key),
      required: false,
      inferred: true,
      confidence: inference.confidence,
    })
  }

  const definition = buildBlueprintDefinition(fields)
  const outputPath = resolveProjectPath('resources', 'blueprints', 'collections', `${handle}.yaml`)

  const validation = validateBlueprintSchema(definition)
  if (!validation.valid) {
    return {
      definition,
      fields,
      outputPath,
      written: false,
      validationErrors: validation.errors,
    }
  }

  await yamlWriter.writeBlueprint(outputPath, definition)

  return {
    definition,
    fields,
    outputPath,
    written: true,
  }
}

// --- From Schema mode ---

export async function generateBlueprintFromSchema(
  handle: string,
  schemaPath: string
): Promise<BlueprintGenerationResult> {
  const handleResult = validateHandle(handle)
  if (!handleResult.valid) {
    throw new Error(`Invalid handle: ${handleResult.error}`)
  }

  const fileContent = await fs.readFile(schemaPath, 'utf-8')
  const schema = JSON.parse(fileContent) as {
    properties?: Record<string, JsonSchemaProperty>
    required?: string[]
  }

  if (!schema.properties) {
    throw new Error('JSON Schema must have a "properties" object')
  }

  const requiredFields = new Set(schema.required ?? [])
  const fields: InferredField[] = []

  for (const [key, propSchema] of Object.entries(schema.properties)) {
    const inference = inferFieldTypeFromSchema(propSchema)

    if (inference.confidence === 'low') {
      console.warn(`Field "${key}": unknown type, defaulting to "text"`)
    }

    fields.push({
      handle: key,
      type: inference.type,
      display: toDisplayName(key),
      required: requiredFields.has(key),
      inferred: true,
      confidence: inference.confidence,
    })
  }

  const definition = buildBlueprintDefinition(fields)
  const outputPath = resolveProjectPath('resources', 'blueprints', 'collections', `${handle}.yaml`)

  const validation = validateBlueprintSchema(definition)
  if (!validation.valid) {
    return {
      definition,
      fields,
      outputPath,
      written: false,
      validationErrors: validation.errors,
    }
  }

  await yamlWriter.writeBlueprint(outputPath, definition)

  return {
    definition,
    fields,
    outputPath,
    written: true,
  }
}

// --- Interactive mode (skeleton) ---

export async function generateBlueprintInteractive(
  handle: string
): Promise<BlueprintGenerationResult> {
  const handleResult = validateHandle(handle)
  if (!handleResult.valid) {
    throw new Error(`Invalid handle: ${handleResult.error}`)
  }

  const fields: InferredField[] = []
  let addMore = true

  while (addMore) {
    const fieldHandle = await input({
      message: 'Field handle (lowercase, alphanumeric):',
    })

    const fieldType = await input({
      message: `Field type (${VALID_FIELD_TYPES.join(', ')}):`,
      default: 'text',
    })

    const resolvedType = VALID_FIELD_TYPES.includes(fieldType as MadoriFieldType)
      ? (fieldType as MadoriFieldType)
      : 'text'

    if (!VALID_FIELD_TYPES.includes(fieldType as MadoriFieldType)) {
      console.warn(`Unknown type "${fieldType}", defaulting to "text"`)
    }

    const isRequired = await confirm({
      message: 'Is this field required?',
      default: false,
    })

    fields.push({
      handle: fieldHandle,
      type: resolvedType,
      display: toDisplayName(fieldHandle),
      required: isRequired,
      inferred: false,
      confidence: 'high',
    })

    addMore = await confirm({
      message: 'Add another field?',
      default: true,
    })
  }

  const definition = buildBlueprintDefinition(fields)
  const outputPath = resolveProjectPath('resources', 'blueprints', 'collections', `${handle}.yaml`)

  const validation = validateBlueprintSchema(definition)
  if (!validation.valid) {
    return {
      definition,
      fields,
      outputPath,
      written: false,
      validationErrors: validation.errors,
    }
  }

  await yamlWriter.writeBlueprint(outputPath, definition)

  return {
    definition,
    fields,
    outputPath,
    written: true,
  }
}

// --- Helpers ---

function buildBlueprintDefinition(fields: InferredField[]): BlueprintDefinition {
  const blueprintFields: BlueprintFieldDefinition[] = fields.map((f) => ({
    handle: f.handle,
    field: {
      type: f.type,
      display: f.display,
      ...(f.required ? { required: true } : {}),
    },
  }))

  return {
    tabs: {
      main: {
        label: 'Main',
        fields: blueprintFields,
      },
    },
  }
}

function toDisplayName(handle: string): string {
  return handle
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
