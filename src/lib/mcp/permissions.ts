import type { McpApiKey, McpResourceType, McpAction } from './auth'

export class McpPermissionChecker {
  /**
   * Check if a key has permission for the given tool operation.
   * Maps tool names to resource+action pairs.
   *
   * - Revoked keys always deny (Req 16.2)
   * - Wildcard `*` resource grants access to all tools (Req 16.3)
   * - Resource + action must match (Req 16.1)
   * - Optional scope narrows access to a specific collection (Req 16.5)
   */
  hasPermission(
    key: McpApiKey,
    resource: McpResourceType,
    action: McpAction,
    scope?: string,
  ): boolean {
    // Revoked keys are always denied regardless of permissions
    if (key.revokedAt) return false

    for (const permission of key.permissions) {
      // Wildcard permission grants access to everything
      if ((permission.resource as string) === '*') return true

      // Resource must match
      if (permission.resource !== resource) continue

      // Action must be included in the permission's actions
      if (!permission.actions.includes(action)) continue

      // Scope check: if both the request and permission specify a scope, they must match
      if (scope && permission.scope && permission.scope !== scope) continue

      return true
    }

    return false
  }
}
