import type { PermissionChecker, ResourceType, Action } from './permissions'
import type { GraphQLContext } from '@/lib/graphql/resolvers'
import { AuthorizationError } from '@/lib/errors'

/**
 * Authentication context extracted from a request.
 * Null context means the request is unauthenticated.
 */
export interface AuthContext {
  userId: string
  roles: string[]
}

/**
 * Configuration mapping resolver/route names to their required permissions.
 */
export interface GuardConfig {
  /** Map of resolver/route name to required permission. */
  permissions: Map<string, { resource: ResourceType; action: Action; scope?: string }>
}

/**
 * Middleware layer that enforces role-based access control on GraphQL resolvers
 * and API route handlers using the existing PermissionChecker.
 *
 * - Missing auth context is treated as unauthenticated (deny all protected resources)
 * - Scoped permissions restrict access to specific resources (e.g. a collection handle)
 * - Multi-role grant logic: any matching role grants access
 */
export class PermissionGuard {
  constructor(
    private readonly checker: PermissionChecker,
    private readonly config: GuardConfig
  ) {}

  /**
   * Check if the given auth context has permission for the operation.
   * Throws AuthorizationError on failure (missing context or insufficient permission).
   */
  async authorize(
    context: AuthContext | null,
    resource: ResourceType,
    action: Action,
    scope?: string
  ): Promise<void> {
    // Missing auth context means unauthenticated — deny all protected resources
    if (!context) {
      throw new AuthorizationError(resource, action)
    }

    // Multi-role grant logic: PermissionChecker.hasPermission checks all roles
    // and grants access if any role provides the required permission.
    const granted = await this.checker.hasPermission(
      context.roles,
      resource,
      action,
      scope
    )

    if (!granted) {
      throw new AuthorizationError(resource, action)
    }
  }

  /**
   * Wrap a GraphQL resolver with permission checking.
   * The permission check runs before the resolver executes.
   * If the check fails, the resolver is never called.
   *
   * @param resource - The resource type being accessed
   * @param action - The action being performed
   * @param resolver - The original resolver function
   * @param scope - Optional function to extract scope from resolver args
   */
  wrapResolver<TArgs, TResult>(
    resource: ResourceType,
    action: Action,
    resolver: (parent: unknown, args: TArgs, ctx: GraphQLContext) => Promise<TResult>,
    scope?: (args: TArgs) => string | undefined
  ): (parent: unknown, args: TArgs, ctx: GraphQLContext) => Promise<TResult> {
    return async (parent, args, ctx) => {
      const authContext = ctx.auth ?? null
      const resolvedScope = scope ? scope(args) : undefined

      await this.authorize(authContext, resource, action, resolvedScope)

      return resolver(parent, args, ctx)
    }
  }
}
