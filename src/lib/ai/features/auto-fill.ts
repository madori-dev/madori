/**
 * Field Auto-Fill feature module — suggests values for empty entry fields
 * based on other populated fields and blueprint context.
 *
 * Provides two operations:
 * - getDerivableFields: determines which empty fields can be derived (Req 9.3)
 * - suggestFieldValues: generates AI suggestions for derivable fields (Req 9.1, 9.2)
 *
 * Operates on-demand when invoked by the editor user (Req 9.4).
 *
 * Satisfies Requirements 9.1, 9.2, 9.3, 9.4.
 */

import { z } from 'zod'
import type { ProviderAdapter, TokenUsage } from '../provider/interface'

/**
 * A populated field on the entry — has a handle, value, and type.
 */
export interface FieldValue {
  handle: string
  value: string | number | boolean
  type: string
}

/**
 * A blueprint field definition — describes an empty field that may be derivable.
 */
export interface BlueprintField {
  handle: string
  type: string
  display?: string
}

/**
 * Options for the auto-fill suggestion operation.
 */
export interface AutoFillOptions {
  provider: ProviderAdapter
}

/**
 * A single suggestion for an empty field.
 */
export interface AutoFillSuggestion {
  handle: string
  suggestedValue: string
}

/**
 * Result of the auto-fill suggestion operation.
 */
export interface AutoFillResult {
  suggestions: AutoFillSuggestion[]
  usage: TokenUsage
}

/**
 * Mapping of source field handle patterns to derivable target field handle patterns.
 * If a source pattern matches a populated field, the corresponding target patterns
 * are considered derivable (if they exist in emptyFields).
 */
const DERIVATION_RULES: Array<{ sources: string[]; targets: string[] }> = [
  { sources: ['title', 'name', 'heading'], targets: ['slug', 'meta_title', 'seo_title', 'og_title'] },
  { sources: ['body', 'content', 'text', 'description'], targets: ['excerpt', 'summary', 'meta_description', 'seo_description', 'og_description'] },
  { sources: ['title', 'name'], targets: ['excerpt', 'summary'] },
  { sources: ['body', 'content'], targets: ['slug'] },
  { sources: ['title'], targets: ['description'] },
  { sources: ['author', 'author_name'], targets: ['author_bio', 'author_slug'] },
  { sources: ['price', 'title', 'name'], targets: ['sku'] },
  { sources: ['address', 'city', 'state', 'zip'], targets: ['location', 'region'] },
  { sources: ['first_name', 'last_name'], targets: ['full_name', 'display_name', 'username'] },
  { sources: ['url', 'link'], targets: ['link_text', 'label'] },
]

/**
 * Determines which empty fields can be meaningfully derived from populated fields.
 *
 * Uses heuristic rules: e.g., if 'title' is populated, 'slug' is derivable;
 * if 'body'/'content' is populated, 'excerpt'/'summary' is derivable.
 *
 * Only returns fields where meaningful derivation is possible (Req 9.3).
 */
export function getDerivableFields(
  populatedFields: FieldValue[],
  emptyFields: BlueprintField[],
): BlueprintField[] {
  if (populatedFields.length === 0 || emptyFields.length === 0) {
    return []
  }

  const populatedHandles = new Set(
    populatedFields.map((f) => f.handle.toLowerCase()),
  )

  const emptyHandleMap = new Map<string, BlueprintField>()
  for (const field of emptyFields) {
    emptyHandleMap.set(field.handle.toLowerCase(), field)
  }

  const derivableHandles = new Set<string>()

  for (const rule of DERIVATION_RULES) {
    // Check if any source pattern matches a populated field
    const hasSource = rule.sources.some((source) => populatedHandles.has(source))
    if (!hasSource) continue

    // Add matching target fields that are empty
    for (const target of rule.targets) {
      if (emptyHandleMap.has(target)) {
        derivableHandles.add(target)
      }
    }
  }

  return Array.from(derivableHandles)
    .map((handle) => emptyHandleMap.get(handle)!)
    .filter(Boolean)
}

/**
 * Generates AI-suggested values for derivable empty fields.
 *
 * Uses generateStructured with a Zod schema to get suggestions as JSON.
 * The system prompt explains the blueprint context and populated field values.
 *
 * Satisfies Requirements 9.1, 9.2, 9.4.
 */
export async function suggestFieldValues(
  populatedFields: FieldValue[],
  emptyFields: BlueprintField[],
  options: AutoFillOptions,
): Promise<AutoFillResult> {
  const derivableFields = getDerivableFields(populatedFields, emptyFields)

  if (derivableFields.length === 0) {
    return {
      suggestions: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    }
  }

  const suggestionsSchema = z.object({
    suggestions: z.array(
      z.object({
        handle: z.string(),
        suggestedValue: z.string(),
      }),
    ),
  })

  const populatedContext = populatedFields
    .map((f) => `- ${f.handle} (${f.type}): ${String(f.value)}`)
    .join('\n')

  const emptyContext = derivableFields
    .map((f) => `- ${f.handle} (${f.type})${f.display ? ` — "${f.display}"` : ''}`)
    .join('\n')

  const prompt =
    `Given an entry with the following populated fields:\n${populatedContext}\n\n` +
    `Suggest appropriate values for these empty fields:\n${emptyContext}\n\n` +
    `Return a suggestion for each empty field listed above. ` +
    `Each suggestion should be a short, meaningful value derived from the populated fields.`

  const systemPrompt =
    'You are a content management assistant. Your job is to suggest values for empty ' +
    'fields on a content entry based on the values already filled in by the editor. ' +
    'Derive meaningful values: for example, generate a slug from a title, an excerpt ' +
    'from body content, or a meta description from the main content. ' +
    'Keep suggestions concise and relevant. Return only the JSON structure requested.'

  const result = await options.provider.generateStructured(prompt, suggestionsSchema, {
    systemPrompt,
    temperature: 0.3,
  })

  // Filter suggestions to only include handles that are actually derivable
  const derivableHandleSet = new Set(derivableFields.map((f) => f.handle))
  const filteredSuggestions = result.data.suggestions.filter((s) =>
    derivableHandleSet.has(s.handle),
  )

  return {
    suggestions: filteredSuggestions,
    usage: result.usage,
  }
}
