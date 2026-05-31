import * as path from 'path'
import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'

export type ResourceType =
  | 'collections'
  | 'entries'
  | 'taxonomies'
  | 'assets'
  | 'globals'
  | 'forms'
  | 'navigation'
  | 'users'
  | 'settings'

export type Action = 'view' | 'create' | 'edit' | 'delete' | 'publish'

export interface Permission {
  resource: ResourceType
  actions: Action[]
  scope?: string
}

export interface Role {
  handle: string
  display: string
  permissions: Permission[]
}

export class PermissionChecker {
  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    private readonly resourcesPath: string
  ) {}

  private roleFilePath(handle: string): string {
    return path.join(this.resourcesPath, 'roles', `${handle}.yaml`)
  }

  async loadRole(handle: string): Promise<Role | null> {
    const filePath = this.roleFilePath(handle)
    const exists = await this.fs.exists(filePath)
    if (!exists) {
      return null
    }
    const raw = await this.fs.readFile(filePath)
    const data = this.parser.parseYaml<Role>(raw)
    return {
      handle: data.handle,
      display: data.display,
      permissions: data.permissions ?? [],
    }
  }

  async loadRoles(handles: string[]): Promise<Role[]> {
    const roles: Role[] = []
    for (const handle of handles) {
      const role = await this.loadRole(handle)
      if (role) {
        roles.push(role)
      }
    }
    return roles
  }

  async hasPermission(
    userRoles: string[],
    resource: ResourceType,
    action: Action,
    scope?: string
  ): Promise<boolean> {
    const roles = await this.loadRoles(userRoles)

    for (const role of roles) {
      for (const permission of role.permissions) {
        if (permission.resource !== resource) {
          continue
        }
        if (!permission.actions.includes(action)) {
          continue
        }
        // If a scope is requested, the permission must either have no scope
        // (grants access to all) or match the requested scope exactly.
        if (scope !== undefined) {
          if (permission.scope !== undefined && permission.scope !== scope) {
            continue
          }
        }
        return true
      }
    }

    return false
  }
}
