// Property 16: Navigation Child Promotion on Deletion

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { removeItemWithPromotion } from '@/lib/navigation/tree'
import type { NavigationItem } from '@/lib/types'

/**
 * Validates: Requirements 12.6
 *
 * Property: For any navigation tree and any item with children, removing that item
 * with the "promote" option SHALL produce a tree where the removed item's children
 * appear at the position the removed item occupied, and the total item count equals
 * the original count minus one.
 */

// --- Helpers ---

/** Count the total number of items in a navigation tree (recursively) */
function countItems(items: NavigationItem[]): number {
  let count = 0
  for (const item of items) {
    count += 1
    if (item.children?.length) {
      count += countItems(item.children)
    }
  }
  return count
}

/** Collect all labels in the tree */
function collectLabels(items: NavigationItem[]): string[] {
  const labels: string[] = []
  for (const item of items) {
    labels.push(item.label)
    if (item.children?.length) {
      labels.push(...collectLabels(item.children))
    }
  }
  return labels
}

/** Find an item by label in the tree */
function findItem(items: NavigationItem[], label: string): NavigationItem | undefined {
  for (const item of items) {
    if (item.label === label) return item
    if (item.children?.length) {
      const found = findItem(item.children, label)
      if (found) return found
    }
  }
  return undefined
}

// --- Generators ---

/** Generate a unique label from an index to ensure labels are distinct */
const uniqueLabelArb = (index: number) => fc.constant(`item-${index}`)

/** Generate a navigation item leaf (no children) */
const leafItemArb = (labelIndex: number): fc.Arbitrary<NavigationItem> =>
  fc.record({
    label: fc.constant(`item-${labelIndex}`),
    url: fc.option(fc.webUrl(), { nil: undefined }),
    entry: fc.option(fc.stringMatching(/^[a-z]+\/[a-z-]+$/), { nil: undefined }),
  }).map(({ label, url, entry }) => {
    const item: NavigationItem = { label }
    if (url !== undefined) item.url = url
    if (entry !== undefined) item.entry = entry
    return item
  })

/**
 * Generate a navigation tree with unique labels where at least one item has children.
 * Returns [tree, labelOfItemWithChildren] so we can target removal.
 */
const treeWithParentArb: fc.Arbitrary<[NavigationItem[], string]> = fc.integer({ min: 2, max: 8 }).chain((childCount) =>
  fc.integer({ min: 1, max: 5 }).chain((siblingCount) =>
    fc.tuple(
      fc.array(fc.webUrl(), { minLength: childCount, maxLength: childCount }),
      fc.array(fc.webUrl(), { minLength: siblingCount, maxLength: siblingCount }),
      fc.nat({ max: siblingCount }), // position to insert the parent among siblings
    ).map(([childUrls, siblingUrls, insertPos]) => {
      // Build children for the target parent
      const children: NavigationItem[] = childUrls.map((url, i) => ({
        label: `child-${i}`,
        url,
      }))

      // The parent item that will be removed
      const parentItem: NavigationItem = {
        label: 'target-parent',
        url: '/parent',
        children,
      }

      // Build sibling items around the parent
      const siblings: NavigationItem[] = siblingUrls.map((url, i) => ({
        label: `sibling-${i}`,
        url,
      }))

      // Insert parent at the specified position
      const tree = [...siblings]
      const pos = Math.min(insertPos, tree.length)
      tree.splice(pos, 0, parentItem)

      return [tree, 'target-parent'] as [NavigationItem[], string]
    })
  )
)

/**
 * Generate a deeper tree where the target parent is nested within another item.
 */
const nestedTreeWithParentArb: fc.Arbitrary<[NavigationItem[], string]> = fc.integer({ min: 1, max: 4 }).chain((childCount) =>
  fc.tuple(
    fc.array(fc.webUrl(), { minLength: childCount, maxLength: childCount }),
    fc.nat({ max: 3 }),
  ).map(([childUrls, siblingCount]) => {
    // Build children for the nested target parent
    const children: NavigationItem[] = childUrls.map((url, i) => ({
      label: `nested-child-${i}`,
      url,
    }))

    // The nested parent item to be removed
    const nestedParent: NavigationItem = {
      label: 'nested-target',
      children,
    }

    // Build siblings at the nested level
    const nestedSiblings: NavigationItem[] = Array.from({ length: siblingCount }, (_, i) => ({
      label: `nested-sibling-${i}`,
      url: `/nested/${i}`,
    }))

    // Wrapper item containing the nested parent
    const wrapper: NavigationItem = {
      label: 'wrapper',
      url: '/wrapper',
      children: [nestedParent, ...nestedSiblings],
    }

    // Top-level tree
    const tree: NavigationItem[] = [
      { label: 'top-1', url: '/top-1' },
      wrapper,
      { label: 'top-2', url: '/top-2' },
    ]

    return [tree, 'nested-target'] as [NavigationItem[], string]
  })
)

// --- Property Tests ---

describe('Property 16: Navigation Child Promotion on Deletion', () => {
  it('total count after removal equals original count minus one', () => {
    fc.assert(
      fc.property(
        treeWithParentArb,
        ([tree, targetLabel]) => {
          const originalCount = countItems(tree)
          const result = removeItemWithPromotion(tree, targetLabel)
          const resultCount = countItems(result)

          expect(resultCount).toBe(originalCount - 1)
        }
      ),
      { numRuns: 100 },
    )
  })

  it('removed item children are promoted to parent level', () => {
    fc.assert(
      fc.property(
        treeWithParentArb,
        ([tree, targetLabel]) => {
          const targetItem = findItem(tree, targetLabel)!
          const childLabels = targetItem.children!.map((c) => c.label)

          const result = removeItemWithPromotion(tree, targetLabel)
          const resultLabels = collectLabels(result)

          // Target should be gone
          expect(resultLabels).not.toContain(targetLabel)

          // All children should still exist in the result
          for (const childLabel of childLabels) {
            expect(resultLabels).toContain(childLabel)
          }
        }
      ),
      { numRuns: 100 },
    )
  })

  it('total count equals original - 1 for nested removal', () => {
    fc.assert(
      fc.property(
        nestedTreeWithParentArb,
        ([tree, targetLabel]) => {
          const originalCount = countItems(tree)
          const result = removeItemWithPromotion(tree, targetLabel)
          const resultCount = countItems(result)

          expect(resultCount).toBe(originalCount - 1)
        }
      ),
      { numRuns: 100 },
    )
  })

  it('promoted children appear at the position of the removed item (nested case)', () => {
    fc.assert(
      fc.property(
        nestedTreeWithParentArb,
        ([tree, targetLabel]) => {
          const targetItem = findItem(tree, targetLabel)!
          const childLabels = targetItem.children!.map((c) => c.label)

          const result = removeItemWithPromotion(tree, targetLabel)
          const resultLabels = collectLabels(result)

          // Target removed
          expect(resultLabels).not.toContain(targetLabel)

          // All children promoted and present
          for (const childLabel of childLabels) {
            expect(resultLabels).toContain(childLabel)
          }
        }
      ),
      { numRuns: 100 },
    )
  })

  it('non-target items are preserved unchanged', () => {
    fc.assert(
      fc.property(
        treeWithParentArb,
        ([tree, targetLabel]) => {
          const originalLabels = collectLabels(tree)
          const nonTargetLabels = originalLabels.filter((l) => l !== targetLabel)

          const result = removeItemWithPromotion(tree, targetLabel)
          const resultLabels = collectLabels(result)

          // Every non-target label should still be present
          for (const label of nonTargetLabels) {
            expect(resultLabels).toContain(label)
          }
        }
      ),
      { numRuns: 100 },
    )
  })
})
