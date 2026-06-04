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
  GraphQLUnionType,
  GraphQLFieldConfigMap,
  GraphQLInputFieldConfigMap,
  GraphQLOutputType,
  GraphQLInputType,
} from 'graphql'
import type { GraphQLFieldResolver } from 'graphql'
import type { Blueprint, FieldDefinition } from '../blueprints/types'
import type { CollectionConfig } from '../config/schema'
import { sanitiseFieldHandle } from './sanitise-field-handle'

/**
 * Provides resolved field definitions for a fieldset handle.
 * Used by the schema generator to produce structured types for replicator/grid sets.
 */
export interface FieldsetProvider {
  getFieldset(handle: string): FieldDefinition[] | undefined
}

/**
 * Maps blueprint field types to GraphQL output types.
 * For replicator/grid fields, returns GraphQLString unless a replicator type override is provided.
 */
function fieldTypeToGraphQL(fieldDef: FieldDefinition, replicatorType?: GraphQLOutputType): GraphQLOutputType {
  const { field } = fieldDef

  switch (field.type) {
    case 'text':
    case 'slug':
    case 'markdown':
    case 'tiptap':
    case 'select':
    case 'date':
    case 'asset':
    case 'yaml':
    case 'code':
    case 'hidden':
      return GraphQLString

    case 'replicator':
    case 'grid':
      return replicatorType ?? GraphQLString

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
  generateSchema(blueprints: Blueprint[], collections: CollectionConfig[], resolvers?: Record<string, unknown>): GraphQLSchema
  generateCollectionType(collection: CollectionConfig, blueprint: Blueprint): GraphQLObjectType
  generateFilterInput(blueprint: Blueprint): GraphQLInputObjectType
}

export class SchemaGeneratorImpl implements SchemaGenerator {
  /** Optional provider for resolving fieldset definitions for replicator/grid sets. */
  private readonly fieldsetProvider?: FieldsetProvider

  /** Cache of generated replicator set types to avoid duplicates within a schema. */
  private readonly generatedSetTypes: Map<string, GraphQLObjectType> = new Map()

  constructor(fieldsetProvider?: FieldsetProvider) {
    this.fieldsetProvider = fieldsetProvider
  }

  /**
   * Build a full GraphQL schema from blueprints and collection configs.
   * Each collection gets a singular query (returns single item) and a plural list query.
   * When resolvers are provided, they are attached to the corresponding query fields.
   */
  generateSchema(blueprints: Blueprint[], collections: CollectionConfig[], resolvers?: Record<string, unknown>): GraphQLSchema {
    // Clear set type cache for each schema generation
    this.generatedSetTypes.clear()

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
        ...(resolvers?.[handle] ? { resolve: resolvers[handle] as GraphQLFieldResolver<unknown, unknown> } : {}),
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
        ...(resolvers?.[pluralHandle] ? { resolve: resolvers[pluralHandle] as GraphQLFieldResolver<unknown, unknown> } : {}),
      }
    }

    // Add non-collection resolvers (taxonomies, globals, navigation, assets)
    if (resolvers) {
      const nonCollectionFields: Array<{ name: string; type: GraphQLOutputType; args?: Record<string, { type: GraphQLInputType }> }> = [
        { name: 'taxonomies', type: new GraphQLList(GraphQLString) },
        { name: 'taxonomy', type: GraphQLString, args: { handle: { type: new GraphQLNonNull(GraphQLString) } } },
        { name: 'terms', type: new GraphQLList(GraphQLString), args: { taxonomy: { type: new GraphQLNonNull(GraphQLString) } } },
        { name: 'globals', type: new GraphQLList(GraphQLString) },
        { name: 'global', type: GraphQLString, args: { handle: { type: new GraphQLNonNull(GraphQLString) } } },
        { name: 'navigations', type: new GraphQLList(GraphQLString) },
        { name: 'navigation', type: GraphQLString, args: { handle: { type: new GraphQLNonNull(GraphQLString) } } },
        { name: 'assets', type: new GraphQLList(GraphQLString), args: { directory: { type: GraphQLString } } },
        { name: 'asset', type: GraphQLString, args: { path: { type: new GraphQLNonNull(GraphQLString) } } },
      ]

      for (const field of nonCollectionFields) {
        if (resolvers[field.name] && !queryFields[field.name]) {
          queryFields[field.name] = {
            type: field.type,
            ...(field.args ? { args: field.args } : {}),
            resolve: resolvers[field.name] as GraphQLFieldResolver<unknown, unknown>,
          }
        }
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

      const sanitisedHandle = sanitiseFieldHandle(fieldDef.handle)
      const replicatorType = this.buildReplicatorType(typeName, fieldDef)
      fields[sanitisedHandle] = {
        type: fieldTypeToGraphQL(fieldDef, replicatorType),
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
      const sanitisedHandle = sanitiseFieldHandle(fieldDef.handle)
      if (sanitisedHandle in inputFields) continue
      inputFields[sanitisedHandle] = { type: GraphQLString }
    }

    return new GraphQLInputObjectType({
      name: `${toPascalCase(blueprint.handle)}FilterInput`,
      fields: inputFields,
    })
  }

  /**
   * Build a structured GraphQL type for a replicator or grid field.
   * If a fieldset provider is available and the field has sets defined,
   * generates dedicated GraphQLObjectTypes per set and returns a list type.
   *
   * Returns undefined if the field is not a replicator/grid or has no resolvable sets.
   */
  private buildReplicatorType(
    parentTypeName: string,
    fieldDef: FieldDefinition
  ): GraphQLOutputType | undefined {
    if (fieldDef.field.type !== 'replicator' && fieldDef.field.type !== 'grid') {
      return undefined
    }

    const sets = fieldDef.field.options?.sets as string[] | undefined
    if (!sets || !Array.isArray(sets) || sets.length === 0) {
      return undefined
    }

    if (!this.fieldsetProvider) {
      return undefined
    }

    const fieldPascal = toPascalCase(fieldDef.handle)
    const setObjectTypes: GraphQLObjectType[] = []

    for (const setHandle of sets) {
      const setFields = this.fieldsetProvider.getFieldset(setHandle)
      if (!setFields) continue

      const setTypeName = `${parentTypeName}${fieldPascal}${toPascalCase(setHandle)}Set`
      const existingType = this.generatedSetTypes.get(setTypeName)

      if (existingType) {
        setObjectTypes.push(existingType)
        continue
      }

      const setType = this.buildSetObjectType(setTypeName, setFields)
      this.generatedSetTypes.set(setTypeName, setType)
      setObjectTypes.push(setType)
    }

    if (setObjectTypes.length === 0) {
      return undefined
    }

    // If there's only one set, use a list of that type directly
    if (setObjectTypes.length === 1) {
      return new GraphQLList(setObjectTypes[0])
    }

    // If there are multiple sets, create a union type
    const unionTypeName = `${parentTypeName}${fieldPascal}Union`
    const unionType = new GraphQLUnionType({
      name: unionTypeName,
      types: setObjectTypes,
    })

    return new GraphQLList(unionType)
  }

  /**
   * Build a GraphQLObjectType for a single replicator/grid set.
   * Includes a `_type` discriminator field and all fields from the fieldset.
   */
  private buildSetObjectType(
    typeName: string,
    setFields: FieldDefinition[]
  ): GraphQLObjectType {
    const fields: GraphQLFieldConfigMap<unknown, unknown> = {
      _type: { type: GraphQLString },
    }

    for (const fieldDef of setFields) {
      const sanitisedHandle = sanitiseFieldHandle(fieldDef.handle)
      // Recursively handle nested replicator/grid fields within sets
      const nestedReplicatorType = this.buildReplicatorType(typeName, fieldDef)
      fields[sanitisedHandle] = {
        type: fieldTypeToGraphQL(fieldDef, nestedReplicatorType),
      }
    }

    return new GraphQLObjectType({
      name: typeName,
      fields,
    })
  }
}
