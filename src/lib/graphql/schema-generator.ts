import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLInputObjectType,
  GraphQLFieldConfigMap,
  GraphQLInputFieldConfigMap,
  GraphQLOutputType,
} from 'graphql'
import type { Blueprint, BlueprintTab, FieldDefinition } from '../blueprints/types'
import type { CollectionConfig } from '../config/schema'

/**
 * Maps blueprint field types to GraphQL output types.
 */
function fieldTypeToGraphQL(fieldDef: FieldDefinition): GraphQLOutputType {
  const { field } = fieldDef

  switch (field.type) {
    case 'text':
    case 'slug':
    case 'markdown':
    case 'tiptap':
    case 'select':
    case 'date':
    case 'asset':
    case 'replicator':
    case 'grid':
    case 'yaml':
    case 'code':
    case 'hidden':
      return GraphQLString

    case 'number': {
      const integerOnly = field.options?.integer === true
      return integerOnly ? GraphQLInt : GraphQLFloat
    }

    case 'toggle':
      return GraphQLBoolean

    case 'multiselect':
    case 'entries':
    case 'taxonomy':
      return new GraphQLList(GraphQLString)

    default:
      return GraphQLString
  }
}

/**
 * Extracts all field definitions from a blueprint across all tabs and sections.
 */
function extractAllFields(blueprint: Blueprint): FieldDefinition[] {
  const fields: FieldDefinition[] = []

  for (const tab of Object.values(blueprint.tabs)) {
    for (const field of tab.fields) {
      fields.push(field)
    }
    if (tab.sections) {
      for (const section of Object.values(tab.sections)) {
        for (const field of section.fields) {
          fields.push(field)
        }
      }
    }
  }

  return fields
}

/**
 * Converts a collection handle to a PascalCase type name.
 * e.g. "blog" → "Blog", "case-studies" → "CaseStudies"
 */
function toPascalCase(handle: string): string {
  return handle
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/**
 * Pluralizes a handle for list query names.
 * Simple pluralization: append 's' if not already ending in 's'.
 */
function pluralize(handle: string): string {
  if (handle.endsWith('s')) return handle
  if (handle.endsWith('y') && !handle.endsWith('ey')) {
    return handle.slice(0, -1) + 'ies'
  }
  return handle + 's'
}

/** Standard fields added to every collection type */
const STANDARD_ENTRY_FIELDS: GraphQLFieldConfigMap<unknown, unknown> = {
  title: { type: GraphQLString },
  slug: { type: GraphQLString },
  status: { type: GraphQLString },
  author: { type: GraphQLString },
  content: { type: GraphQLString },
  createdAt: { type: GraphQLString },
  updatedAt: { type: GraphQLString },
}

export interface SchemaGenerator {
  generateSchema(blueprints: Blueprint[], collections: CollectionConfig[]): GraphQLSchema
  generateCollectionType(collection: CollectionConfig, blueprint: Blueprint): GraphQLObjectType
  generateFilterInput(blueprint: Blueprint): GraphQLInputObjectType
}

export class SchemaGeneratorImpl implements SchemaGenerator {
  /**
   * Build a full GraphQL schema from blueprints and collection configs.
   * Each collection gets a singular query (returns single item) and a plural list query.
   */
  generateSchema(blueprints: Blueprint[], collections: CollectionConfig[]): GraphQLSchema {
    const queryFields: GraphQLFieldConfigMap<unknown, unknown> = {}

    for (const collection of collections) {
      const blueprint = blueprints.find((bp) => bp.handle === collection.blueprint)
      if (!blueprint) continue

      const collectionType = this.generateCollectionType(collection, blueprint)
      const filterInput = this.generateFilterInput(blueprint)
      const handle = collection.handle
      const pluralHandle = pluralize(handle)

      // Singular query: e.g. blog(slug: String!): Blog
      queryFields[handle] = {
        type: collectionType,
        args: {
          slug: { type: new GraphQLNonNull(GraphQLString) },
        },
      }

      // List query: e.g. blogs(filter: BlogFilterInput, limit: Int, offset: Int, sort: String): [Blog!]!
      queryFields[pluralHandle] = {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(collectionType))),
        args: {
          filter: { type: filterInput },
          limit: { type: GraphQLInt },
          offset: { type: GraphQLInt },
          sort: { type: GraphQLString },
        },
      }
    }

    // If no collections, add a placeholder to avoid empty schema error
    if (Object.keys(queryFields).length === 0) {
      queryFields._empty = { type: GraphQLString }
    }

    const queryType = new GraphQLObjectType({
      name: 'Query',
      fields: queryFields,
    })

    return new GraphQLSchema({ query: queryType })
  }

  /**
   * Map a collection's blueprint fields to a GraphQL object type.
   * Includes standard entry fields plus all blueprint-defined fields.
   */
  generateCollectionType(collection: CollectionConfig, blueprint: Blueprint): GraphQLObjectType {
    const typeName = toPascalCase(collection.handle)
    const blueprintFields = extractAllFields(blueprint)

    const fields: GraphQLFieldConfigMap<unknown, unknown> = {
      ...STANDARD_ENTRY_FIELDS,
    }

    for (const fieldDef of blueprintFields) {
      // Skip fields that overlap with standard entry fields
      if (fieldDef.handle in STANDARD_ENTRY_FIELDS) continue

      fields[fieldDef.handle] = {
        type: fieldTypeToGraphQL(fieldDef),
      }
    }

    return new GraphQLObjectType({
      name: typeName,
      fields,
    })
  }

  /**
   * Create a filter input type for list queries.
   * All filter fields are optional Strings for simplicity in V0.
   */
  generateFilterInput(blueprint: Blueprint): GraphQLInputObjectType {
    const blueprintFields = extractAllFields(blueprint)
    const inputFields: GraphQLInputFieldConfigMap = {}

    // Add standard filterable fields
    inputFields.title = { type: GraphQLString }
    inputFields.slug = { type: GraphQLString }
    inputFields.status = { type: GraphQLString }
    inputFields.author = { type: GraphQLString }

    // Add blueprint-defined fields (all as String for V0 simplicity)
    for (const fieldDef of blueprintFields) {
      if (fieldDef.handle in inputFields) continue
      inputFields[fieldDef.handle] = { type: GraphQLString }
    }

    return new GraphQLInputObjectType({
      name: `${toPascalCase(blueprint.handle)}FilterInput`,
      fields: inputFields,
    })
  }
}
