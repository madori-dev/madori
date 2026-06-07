/**
 * Blueprint generator feature module — natural language to YAML blueprint.
 *
 * Converts a natural language description of a content collection into
 * a valid Madori blueprint YAML file. The result is returned for review
 * before writing to the filesystem (Req 8.3).
 *
 * Satisfies Requirements 8.1, 8.2, 8.3, 8.4.
 */

import { parse as parseYaml, stringify } from 'yaml'
import type { ProviderAdapter, TokenUsage } from '../provider/interface'
import {
  GeneratedBlueprintSchema,
  VALID_FIELD_TYPES,
  type GeneratedBlueprint,
} from './blueprint-schema'

/**
 * Options required for blueprint generation.
 */
export interface BlueprintGeneratorOptions {
  provider: ProviderAdapter
}

/**
 * Result of blueprint generation — returned for review (Req 8.3).
 */
export interface BlueprintResult {
  yaml: string
  valid: boolean
  errors?: string[]
  usage: TokenUsage
}

/**
 * System prompt describing the blueprint structure and field types.
 */
const BLUEPRINT_SYSTEM_PROMPT = `You are a Madori CMS blueprint generator. Given a natural language description of a content collection, produce a valid blueprint structure as JSON.

A blueprint has the following structure:
- tabs: An object where each key is a tab handle (e.g. "main", "sidebar", "seo")
  - display: Optional human-readable tab name
  - sections: Optional object of named sections within the tab
    - display: Optional human-readable section name
    - fields: Array of field definitions
  - fields: Array of field definitions at the tab level (outside sections)

Each field definition has:
- handle: A snake_case identifier for the field (e.g. "title", "body", "featured_image")
- field: An object containing:
  - type: One of the valid field types listed below
  - display: Optional human-readable label
  - instructions: Optional help text for editors
  - required: Optional boolean
  - validate: Optional array of validation rule strings (e.g. "max:60")
  - options: Optional object for type-specific configuration (e.g. select options)

Valid field types: ${VALID_FIELD_TYPES.join(', ')}

Field type guidance for inference:
- Short text content (titles, names) → "text"
- Long plain text → "textarea"
- Rich text content (body, bio, description) → "tiptap"
- Markdown content → "markdown"
- URL slugs → "slug"
- Dates/times → "date"
- Boolean toggles (published, featured) → "toggle"
- Single image/file → "asset"
- Multiple images/files → "assets"
- Video embeds → "video"
- Dropdown selections → "select"
- Radio button choices → "radio"
- Multiple choice checkboxes → "checkboxes"
- Numeric ranges (ratings, progress) → "range"
- Color pickers → "color"
- URLs/links → "link"
- Category/tag references → "taxonomy"
- Related entry references → "entries"
- Repeating field groups → "replicator"
- Rich block-based content → "bard"
- Tabular data with fixed columns → "grid"
- Simple tabular data → "table"
- Code snippets → "code"
- Raw YAML → "yaml"
- Raw JSON → "json"

Produce a complete blueprint that organizes fields logically into tabs and sections. Use "main" as the primary tab. Group related fields into sections where appropriate.`

/**
 * Generates a valid Madori blueprint YAML from a natural language description.
 *
 * Uses the provider's generateStructured method to produce a structured
 * blueprint, then serializes to YAML and validates against the schema.
 * The result is returned for review before writing (Req 8.3).
 *
 * Satisfies Requirements 8.1, 8.2, 8.3.
 */
export async function generateBlueprint(
  description: string,
  options: BlueprintGeneratorOptions,
): Promise<BlueprintResult> {
  const { provider } = options

  const result = await provider.generateStructured<GeneratedBlueprint>(
    description,
    GeneratedBlueprintSchema,
    {
      systemPrompt: BLUEPRINT_SYSTEM_PROMPT,
      temperature: 0.3,
    },
  )

  const yaml = stringify(result.data, { indent: 2 })

  // Validate the generated blueprint against our schema (Req 8.4)
  const validation = validateBlueprintYaml(yaml)

  return {
    yaml,
    valid: validation.valid,
    errors: validation.errors,
    usage: result.usage,
  }
}

/**
 * Validates generated blueprint YAML against the schema.
 * Returns validation status and specific errors if invalid.
 *
 * Satisfies Requirement 8.4.
 */
export function validateBlueprintYaml(yaml: string): { valid: boolean; errors?: string[] } {
  let parsed: unknown

  try {
    parsed = parseYaml(yaml)
  } catch (err) {
    return {
      valid: false,
      errors: [`YAML parse error: ${err instanceof Error ? err.message : String(err)}`],
    }
  }

  const result = GeneratedBlueprintSchema.safeParse(parsed)

  if (result.success) {
    return { valid: true }
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })

  return { valid: false, errors }
}
