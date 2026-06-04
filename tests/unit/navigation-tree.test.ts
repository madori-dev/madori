import { describe, it, expect } from 'vitest'
import {
  getTreeDepth,
  enforceMaxDepth,
  removeItemWithPromotion,
  serializeNavigation,
  deserializeNavigation,
} from '@/lib/navigation/tree'
import type { NavigationItem } from '@/lib/types'

describe('getTreeDepth', () => {
  it('returns 0 for an empty array', () => {
    expect(getTreeDepth([])).toBe(0)
  })

  it('returns 0 for a flat list', () => {
    const items: NavigationItem[] = [
      { label: 'Home', url: '/' },
      { label: 'About', url: '/about' },
    ]
    expect(getTreeDepth(items)).toBe(0)
  })

  it('returns 1 for a single level of nesting', () => {
    const items: NavigationItem[] = [
      {
        label: 'Docs',
        url: '/docs',
        children: [{ label: 'Getting Started', url: '/docs/getting-started' }],
      },
    ]
    expect(getTreeDepth(items)).toBe(1)
  })

  it('returns 3 for deeply nested items', () => {
    const items: NavigationItem[] = [
      {
        label: 'L0',
        children: [
          {
            label: 'L1',
            children: [
              {
                label: 'L2',
                children: [{ label: 'L3' }],
              },
            ],
          },
        ],
      },
    ]
    expect(getTreeDepth(items)).toBe(3)
  })
})

describe('enforceMaxDepth', () => {
  it('returns true when depth is within limit', () => {
    const items: NavigationItem[] = [
      { label: 'Home', children: [{ label: 'Sub' }] },
    ]
    expect(enforceMaxDepth(items, 1)).toBe(true)
    expect(enforceMaxDepth(items, 2)).toBe(true)
  })

  it('returns false when depth exceeds limit', () => {
    const items: NavigationItem[] = [
      { label: 'Home', children: [{ label: 'Sub', children: [{ label: 'Deep' }] }] },
    ]
    expect(enforceMaxDepth(items, 1)).toBe(false)
  })
})

describe('removeItemWithPromotion', () => {
  it('removes a top-level item without children', () => {
    const items: NavigationItem[] = [
      { label: 'Home', url: '/' },
      { label: 'About', url: '/about' },
    ]
    const result = removeItemWithPromotion(items, 'About')
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('Home')
  })

  it('promotes children when removing a parent', () => {
    const items: NavigationItem[] = [
      {
        label: 'Docs',
        url: '/docs',
        children: [
          { label: 'Getting Started', url: '/docs/start' },
          { label: 'Config', url: '/docs/config' },
        ],
      },
      { label: 'About', url: '/about' },
    ]
    const result = removeItemWithPromotion(items, 'Docs')
    expect(result).toHaveLength(3)
    expect(result[0].label).toBe('Getting Started')
    expect(result[1].label).toBe('Config')
    expect(result[2].label).toBe('About')
  })

  it('recursively finds and removes nested items', () => {
    const items: NavigationItem[] = [
      {
        label: 'Docs',
        children: [
          {
            label: 'API',
            children: [{ label: 'REST' }, { label: 'GraphQL' }],
          },
        ],
      },
    ]
    const result = removeItemWithPromotion(items, 'API')
    expect(result[0].children).toHaveLength(2)
    expect(result[0].children![0].label).toBe('REST')
    expect(result[0].children![1].label).toBe('GraphQL')
  })
})

describe('serializeNavigation / deserializeNavigation', () => {
  it('round-trips a flat navigation', () => {
    const items: NavigationItem[] = [
      { label: 'Home', url: '/' },
      { label: 'GitHub', url: 'https://github.com', external: true },
    ]
    const yaml = serializeNavigation(items)
    const result = deserializeNavigation(yaml)
    expect(result).toEqual(items)
  })

  it('round-trips a nested navigation', () => {
    const items: NavigationItem[] = [
      {
        label: 'Docs',
        url: '/docs',
        children: [
          { label: 'Getting Started', entry: 'pages/getting-started' },
          { label: 'Config', url: '/docs/config' },
        ],
      },
      { label: 'About', url: '/about' },
    ]
    const yaml = serializeNavigation(items)
    const result = deserializeNavigation(yaml)
    expect(result).toEqual(items)
  })

  it('deserializeNavigation returns empty array for invalid yaml', () => {
    expect(deserializeNavigation('')).toEqual([])
    expect(deserializeNavigation('foo: bar')).toEqual([])
  })

  it('serialized output matches project YAML structure', () => {
    const items: NavigationItem[] = [
      { label: 'Home', url: '/' },
    ]
    const yaml = serializeNavigation(items)
    expect(yaml).toContain('items:')
    expect(yaml).toContain('label: Home')
  })
})
