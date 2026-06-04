// Property 15: Navigation Max-Depth Enforcement

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getTreeDepth, enforceMaxDepth } from '@/lib/navigation/tree'
import type { NavigationItem } from '@/lib/types'

/**
 * Validates: Requirements 12.3
 *
 * Property: For any navigation tree and any configured max_depth value,
 * the system SHALL reject saves where the tree depth exceeds max_depth.
 * Equivalently, for any persisted navigation tree, its depth SHALL be
 * less than or equal to the configured max_depth.
 */

// --- Generators ---

/** Arbitrary navigation item label */
const labelArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,19}$/)

/** Arbitrary URL */
const urlArb = fc.oneof(
  fc.constant('/'),
  fc.stringMatching(/^\/[a-z][a-z0-9\-\/]{0,30}$/),
  fc.webUrl(),
)

/** Arbitrary entry reference */
const entryArb = fc.stringMatching(/^[a-z][a-z0-9\-\/]{1,30}$/)

/** Generate a leaf navigation item (no children) */
const leafItemArb: fc.Arbitrary<NavigationItem> = fc.record({
  label: labelArb,
  url: fc.option(urlArb, { nil: undefined }),
  entry: fc.option(entryArb, { nil: undefined }),
  external: fc.option(fc.boolean(), { nil: undefined }),
}).map(({ label, url, entry, external }) => {
  const item: NavigationItem = { label }
  if (url !== undefined) item.url = url
  if (entry !== undefined) item.entry = entry
  if (external !== undefined) item.external = external
  return item
})

/**
 * Generate a navigation tree with a guaranteed exact depth.
 * This builds a tree where at least one path reaches exactly `depth` levels.
 */
function treeOfExactDepth(depth: number): fc.Arbitrary<NavigationItem[]> {
  if (depth <= 0) {
    // Flat list — no children
    return fc.array(leafItemArb, { minLength: 1, maxLength: 4 })
  }

  // At least one item must have children at depth-1
  const itemWithChildrenArb = fc.record({
    label: labelArb,
    url: fc.option(urlArb, { nil: undefined }),
    children: treeOfExactDepth(depth - 1),
  }).map(({ label, url, children }) => {
    const item: NavigationItem = { label }
    if (url !== undefined) item.url = url
    item.children = children
    return item
  })

  // Mix of leaves and items with children, ensuring at least one deep item
  return fc.tuple(
    itemWithChildrenArb,
    fc.array(fc.oneof(leafItemArb, itemWithChildrenArb), { minLength: 0, maxLength: 3 }),
  ).map(([deepItem, others]) => [deepItem, ...others])
}

/**
 * Generate a navigation tree with arbitrary depth (0 to maxDepth).
 */
function treeWithMaxDepth(maxDepth: number): fc.Arbitrary<NavigationItem[]> {
  return fc.integer({ min: 0, max: maxDepth }).chain((depth) => treeOfExactDepth(depth))
}

// --- Property Tests ---

describe('Property 15: Navigation Max-Depth Enforcement', () => {
  it('rejects trees whose depth exceeds max_depth', () => {
    fc.assert(
      fc.property(
        // Generate a max_depth between 0 and 3
        fc.integer({ min: 0, max: 3 }),
        // Generate a tree depth that exceeds the max_depth (at least max_depth + 1)
        fc.integer({ min: 0, max: 3 }),
        (maxDepth, extraDepth) => {
          const treeDepth = maxDepth + 1 + extraDepth
          // Generate a tree with exactly treeDepth levels
          const tree = fc.sample(treeOfExactDepth(treeDepth), { numValues: 1 })[0]

          // The tree depth should exceed maxDepth
          const actualDepth = getTreeDepth(tree)
          expect(actualDepth).toBeGreaterThan(maxDepth)

          // enforceMaxDepth should return false (rejection)
          expect(enforceMaxDepth(tree, maxDepth)).toBe(false)
        }
      ),
      { numRuns: 100 },
    )
  }, 30000)

  it('accepts trees whose depth is within max_depth', () => {
    fc.assert(
      fc.property(
        // Generate a max_depth between 0 and 5
        fc.integer({ min: 0, max: 5 }),
        (maxDepth) => {
          // Generate a tree with depth at most maxDepth
          const tree = fc.sample(treeWithMaxDepth(maxDepth), { numValues: 1 })[0]

          const actualDepth = getTreeDepth(tree)
          expect(actualDepth).toBeLessThanOrEqual(maxDepth)

          // enforceMaxDepth should return true (acceptance)
          expect(enforceMaxDepth(tree, maxDepth)).toBe(true)
        }
      ),
      { numRuns: 100 },
    )
  })

  it('getTreeDepth returns 0 for a flat list (no children)', () => {
    fc.assert(
      fc.property(
        fc.array(leafItemArb, { minLength: 1, maxLength: 10 }),
        (items) => {
          expect(getTreeDepth(items)).toBe(0)
        }
      ),
      { numRuns: 100 },
    )
  })

  it('enforceMaxDepth is equivalent to getTreeDepth <= maxDepth', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        (treeDepth, maxDepth) => {
          const tree = fc.sample(treeOfExactDepth(treeDepth), { numValues: 1 })[0]
          const actualDepth = getTreeDepth(tree)

          // enforceMaxDepth should be equivalent to depth <= maxDepth
          expect(enforceMaxDepth(tree, maxDepth)).toBe(actualDepth <= maxDepth)
        }
      ),
      { numRuns: 100 },
    )
  })
})
