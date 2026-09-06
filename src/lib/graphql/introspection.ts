import { GraphQLError, type ValidationRule } from 'graphql'

const noSchemaIntrospection: ValidationRule = (context) => ({
  Field(node) {
    if (node.name.value === '__schema' || node.name.value === '__type') {
      context.reportError(new GraphQLError('GraphQL schema introspection is disabled.', { nodes: node }))
    }
  },
})
import type { Plugin } from 'graphql-yoga'

/** Apply after request decoding so every accepted GraphQL transport is covered. */
export function introspectionPolicy(enabled: boolean): Plugin {
  return {
    onValidate({ addValidationRule }) {
      if (!enabled) addValidationRule(noSchemaIntrospection)
    },
  }
}
