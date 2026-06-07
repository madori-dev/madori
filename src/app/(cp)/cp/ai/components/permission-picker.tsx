'use client'

import { useCallback } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { McpPermission, McpResourceType, McpAction } from '@/lib/mcp/auth'

const RESOURCE_TYPES: { resource: McpResourceType; label: string }[] = [
  { resource: 'collections', label: 'Collections' },
  { resource: 'entries', label: 'Entries' },
  { resource: 'taxonomies', label: 'Taxonomies' },
  { resource: 'terms', label: 'Terms' },
  { resource: 'globals', label: 'Globals' },
  { resource: 'navigation', label: 'Navigation' },
  { resource: 'assets', label: 'Assets' },
  { resource: 'blueprints', label: 'Blueprints' },
  { resource: 'fieldsets', label: 'Fieldsets' },
  { resource: 'forms', label: 'Forms' },
]

const ACTIONS: McpAction[] = ['read', 'write']

interface PermissionPickerProps {
  value: McpPermission[]
  onChange: (permissions: McpPermission[]) => void
}

function hasAction(permissions: McpPermission[], resource: McpResourceType, action: McpAction): boolean {
  const entry = permissions.find((p) => p.resource === resource)
  return entry?.actions.includes(action) ?? false
}

function allSelected(permissions: McpPermission[]): boolean {
  return RESOURCE_TYPES.every(({ resource }) =>
    ACTIONS.every((action) => hasAction(permissions, resource, action))
  )
}

export function PermissionPicker({ value, onChange }: PermissionPickerProps) {
  const toggleAction = useCallback(
    (resource: McpResourceType, action: McpAction, checked: boolean) => {
      const existing = value.find((p) => p.resource === resource)

      if (checked) {
        if (existing) {
          onChange(
            value.map((p) =>
              p.resource === resource
                ? { ...p, actions: [...new Set([...p.actions, action])] }
                : p
            )
          )
        } else {
          onChange([...value, { resource, actions: [action] }])
        }
      } else {
        if (existing) {
          const newActions = existing.actions.filter((a) => a !== action)
          if (newActions.length === 0) {
            onChange(value.filter((p) => p.resource !== resource))
          } else {
            onChange(
              value.map((p) =>
                p.resource === resource ? { ...p, actions: newActions } : p
              )
            )
          }
        }
      }
    },
    [value, onChange]
  )

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        onChange(
          RESOURCE_TYPES.map(({ resource }) => ({
            resource,
            actions: [...ACTIONS],
          }))
        )
      } else {
        onChange([])
      }
    },
    [onChange]
  )

  const isAllSelected = allSelected(value)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b pb-2">
        <Checkbox
          id="select-all-permissions"
          checked={isAllSelected}
          onCheckedChange={(checked) => toggleSelectAll(checked === true)}
        />
        <Label htmlFor="select-all-permissions" className="cursor-pointer font-medium">
          Select all
        </Label>
      </div>

      <div className="grid gap-2">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-1 text-xs text-muted-foreground">
          <span>Resource</span>
          <span className="w-12 text-center">Read</span>
          <span className="w-12 text-center">Write</span>
        </div>

        {RESOURCE_TYPES.map(({ resource, label }) => (
          <div
            key={resource}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 rounded-md px-1 py-1 hover:bg-muted/50"
          >
            <span className="text-sm">{label}</span>
            {ACTIONS.map((action) => (
              <div key={action} className="flex w-12 items-center justify-center">
                <Checkbox
                  id={`perm-${resource}-${action}`}
                  checked={hasAction(value, resource, action)}
                  onCheckedChange={(checked) =>
                    toggleAction(resource, action, checked === true)
                  }
                  aria-label={`${label} ${action}`}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
