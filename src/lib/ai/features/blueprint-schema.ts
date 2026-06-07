/**
 * Blueprint validation schema for AI-generated blueprints.
 *
 * Defines a Zod schema that validates generated blueprint YAML
 * against the Madori blueprint structure: tabs → sections → fields
 * with correct FieldType values.
 *
 * Satisfies Requirements 8.1, 8.4.
 */

import { z } from 'zod'

/**
 * All valid Madori field types.
 * Matches the FieldType union in src/lib/blueprints/types.ts plus
 * additional types specified in the requirements.
 */
export const VALID_FIELD_TYPES = [
  'text',
  'textarea',
  'tiptap',
  'markdown',
  'slug',
  'date',
  'toggle',
  'asset',
  'assets',
  'video',
  'select',
  'radio',
  'checkboxes',
  'range',
  'color',
  'link',
  'taxonomy',
  'entries',
  'replicator',
  'bard',
  'grid',
  'table',
  'code',
  'yaml',
  'json',
] as const

export type BlueprintFieldType = (typeof VALID_FIELD_TYPES)[number]

/**
 * Zod schema for field type validation.
 */
export const BlueprintFieldTypeSchema = z.enum(VALID_FIELD_TYPES)

/**
 * Schema for a single field definition within a blueprint.
 */
export const BlueprintFieldSchema = z.object({
  handle: z.string().min(1, 'Field handle is required'),
  field: z.object({
    type: BlueprintFieldTypeSchema,
    display: z.string().optional(),
    instructions: z.string().optional(),
    required: z.boolean().optional(),
    default: z.unknown().optional(),
    validate: z.array(z.string()).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  }),
})

/**
 * Schema for a section within a tab.
 */
export const BlueprintSectionSchema = z.object({
  display: z.string().optional(),
  fields: z.array(BlueprintFieldSchema).min(1, 'Section must have at least one field'),
})

/**
 * Schema for a tab within the blueprint.
 */
export const BlueprintTabSchema = z.object({
  display: z.string().optional(),
  sections: z.record(z.string(), BlueprintSectionSchema).optional(),
  fields: z.array(BlueprintFieldSchema).default([]),
})

/**
 * Top-level schema for a complete generated blueprint.
 */
export const GeneratedBlueprintSchema = z.object({
  tabs: z.record(z.string(), BlueprintTabSchema).refine(
    (tabs) => Object.keys(tabs).length > 0,
    { message: 'Blueprint must have at least one tab' },
  ),
})

export type GeneratedBlueprint = z.infer<typeof GeneratedBlueprintSchema>
