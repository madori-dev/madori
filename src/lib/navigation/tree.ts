import { stringify, parse } from 'yaml'
import type { NavigationItem } from '@/lib/types'

/**
 * Returns the maximum nesting depth of a navigation tree.
 * A flat list (no children) has depth 0.
 * Each level of nesting adds 1.
 */
export function getTreeDepth(items: NavigationItem[]): number {
  let maxDepth = 0
  for (const item of items) {
    if (item.children?.length) {
      maxDepth = Math.max(maxDepth, 1 + getTreeDepth(item.children))
    }
  }
  return maxDepth
}

/**
 * Returns true if the tree depth does not exceed maxDepth.
 */
export function enforceMaxDepth(items: NavigationItem[], maxDepth: number): boolean {
  return getTreeDepth(items) <= maxDepth
}

/**
 * Removes the first item matching targetLabel and promotes its children
 * to the position the removed item occupied. Recursively searches nested children.
 */
export function removeItemWithPromotion(
  items: NavigationItem[],
  targetLabel: string
): NavigationItem[] {
  const result: NavigationItem[] = []
  for (const item of items) {
    if ((item.label as string) === targetLabel) {
      if (item.children) {
        result.push(...item.children)
      }
    } else {
      result.push({
        ...item,
        children: item.children
          ? removeItemWithPromotion(item.children, targetLabel)
          : undefined,
      })
    }
  }
  return result
}

/**
 * Serializes a navigation tree to YAML format matching the
 * content/navigation/*.yaml structure (top-level `items` key).
 */
export function serializeNavigation(items: NavigationItem[]): string {
  return stringify({ items: cleanItems(items) })
}

/**
 * Deserializes YAML into a NavigationItem array.
 * Expects a top-level `items` key matching the project's YAML format.
 */
export function deserializeNavigation(yaml: string): NavigationItem[] {
  const parsed = parse(yaml) as { items?: NavigationItem[] } | null
  if (!parsed || !Array.isArray(parsed.items)) {
    return []
  }
  return normalizeItems(parsed.items)
}

/**
 * Strips undefined/empty children arrays to keep serialized YAML clean.
 */
function cleanItems(items: NavigationItem[]): NavigationItem[] {
  return items.map((item) => {
    const { children, ...fields } = item
    const clean: NavigationItem = { ...fields }
    if (children && children.length > 0) {
      clean.children = cleanItems(children)
    }
    return clean
  })
}

/**
 * Normalizes parsed items to ensure consistent structure
 * (e.g. missing children becomes undefined rather than null).
 */
function normalizeItems(items: unknown[]): NavigationItem[] {
  return items.map((raw) => {
    if (typeof raw !== 'object' || raw === null) return {}
    const { children, ...fields } = raw as Record<string, unknown>
    const normalized: NavigationItem = { ...fields }
    if (Array.isArray(children) && children.length > 0) {
      normalized.children = normalizeItems(children)
    }
    return normalized
  })
}
