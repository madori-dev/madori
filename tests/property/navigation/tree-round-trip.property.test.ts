// Property 14: Navigation Tree Persistence Round-Trip

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { serializeNavigation, deserializeNavigation } from '@/lib/navigation/tree'
import type { NavigationItem } from '@/lib/types'

/**
 * Validates: Requirements 12.4
 *
 * Property: For any valid navigation tree structure, serializing to YAML and then
 * deserializing SHALL produce a tree identical to the original structure (labels,
 * URLs, entry references, and nesting preserved).
 */

// --- Generators ---

/** Arbitrary navigation item label */
const labelArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,19}$/)

/** Arbitrary URL path */
const urlArb = fc.oneof(
  fc.constant('/'),
  fc.stringMatching(/^\/[a-z][a-z0-9\-\/]{0,30}$/),
)

/** Arbitrary entry reference */
const entryArb = fc.stringMatching(/^[a-z][a-z0-9\-\/]{1,30}$/)

/** Generate a leaf navigation item (no children) */
const leafItemArb: fc.Arbitrary<NavigationItem> = fc
  .record({
    label: labelArb,
    url: fc.option(urlArb, { nil: undefined }),
    entry: fc.option(entryArb, { nil: undefined }),
    external: fc.option(fc.constant(true), { nil: undefined }),
  })
  .map(({ label, url, entry, external }) => {
    const item: NavigationItem = { label }
    if (url !== undefined) item.url = url
    if (entry !== undefined) item.entry = entry
    if (external !== undefined) item.external = external
    return item
  })

/**
 * Generate a navigation tree with a specified max nesting depth.
 * Recursively builds items that may have children up to the given depth.
 */
function treeArb(maxDepth: number): fc.Arbitrary<NavigationItem[]> {
  if (maxDepth <= 0) {
    return fc.array(leafItemArb, { minLength: 1, maxLength: 5 })
  }

  const itemArb: fc.Arbitrary<NavigationItem> = fc
    .record({
      label: labelArb,
      url: fc.option(urlArb, { nil: undefined }),
      entry: fc.option(entryArb, { nil: undefined }),
      external: fc.option(fc.constant(true), { nil: undefined }),
      children: fc.option(treeArb(maxDepth - 1), { nil: undefined }),
    })
    .map(({ label, url, entry, external, children }) => {
      const item: NavigationItem = { label }
      if (url !== undefined) item.url = url
      if (entry !== undefined) item.entry = entry
      if (external !== undefined) item.external = external
      if (children !== undefined && children.length > 0) item.children = children
      return item
    })

  return fc.array(itemArb, { minLength: 1, maxLength: 5 })
}

/** Arbitrary valid navigation tree (up to 3 levels deep) */
const navigationTreeArb = treeArb(3)

// --- Property Tests ---

describe('Property 14: Navigation Tree Persistence Round-Trip', () => {
  it('serialize then deserialize produces identical tree', () => {
    fc.assert(
      fc.property(navigationTreeArb, (items) => {
        const yaml = serializeNavigation(items)
        const restored = deserializeNavigation(yaml)

        expect(restored).toEqual(items)
      }),
      { numRuns: 100 },
    )
  })

  it('round-trip preserves labels for all items at every nesting level', () => {
    fc.assert(
      fc.property(navigationTreeArb, (items) => {
        const yaml = serializeNavigation(items)
        const restored = deserializeNavigation(yaml)

        function collectLabels(tree: NavigationItem[]): string[] {
          const labels: string[] = []
          for (const item of tree) {
            labels.push(item.label)
            if (item.children) {
              labels.push(...collectLabels(item.children))
            }
          }
          return labels
        }

        expect(collectLabels(restored)).toEqual(collectLabels(items))
      }),
      { numRuns: 100 },
    )
  })

  it('round-trip preserves URLs and entry references', () => {
    fc.assert(
      fc.property(navigationTreeArb, (items) => {
        const yaml = serializeNavigation(items)
        const restored = deserializeNavigation(yaml)

        function collectRefs(tree: NavigationItem[]): Array<{ url?: string; entry?: string }> {
          const refs: Array<{ url?: string; entry?: string }> = []
          for (const item of tree) {
            refs.push({ url: item.url, entry: item.entry })
            if (item.children) {
              refs.push(...collectRefs(item.children))
            }
          }
          return refs
        }

        expect(collectRefs(restored)).toEqual(collectRefs(items))
      }),
      { numRuns: 100 },
    )
  })

  it('round-trip preserves nesting structure (child count at each level)', () => {
    fc.assert(
      fc.property(navigationTreeArb, (items) => {
        const yaml = serializeNavigation(items)
        const restored = deserializeNavigation(yaml)

        function getStructure(tree: NavigationItem[]): number[] {
          const counts: number[] = [tree.length]
          for (const item of tree) {
            if (item.children) {
              counts.push(...getStructure(item.children))
            }
          }
          return counts
        }

        expect(getStructure(restored)).toEqual(getStructure(items))
      }),
      { numRuns: 100 },
    )
  })
})
