import { describe, it, expect } from 'vitest'
import {
  duplicateBlock,
  getBlockPreview,
  flattenNestedReplicator,
  hydrateNestedReplicator,
  type Block,
} from '@/lib/replicator/operations'

describe('duplicateBlock', () => {
  it('duplicates block at given index', () => {
    const blocks: Block[] = [
      { _type: 'heading', text: 'Hello' },
      { _type: 'paragraph', text: 'World' },
    ]
    const result = duplicateBlock(blocks, 0)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ _type: 'heading', text: 'Hello' })
    expect(result[1]).toEqual({ _type: 'heading', text: 'Hello' })
    expect(result[2]).toEqual({ _type: 'paragraph', text: 'World' })
  })

  it('returns original array for out-of-bounds index', () => {
    const blocks: Block[] = [{ _type: 'heading', text: 'Hello' }]
    expect(duplicateBlock(blocks, 5)).toBe(blocks)
    expect(duplicateBlock(blocks, -1)).toBe(blocks)
  })

  it('does not mutate the original array', () => {
    const blocks: Block[] = [{ _type: 'heading', text: 'Hello' }]
    const result = duplicateBlock(blocks, 0)
    expect(result).not.toBe(blocks)
    expect(blocks).toHaveLength(1)
  })

  it('produces a deep clone (no shared references)', () => {
    const blocks: Block[] = [{ _type: 'card', items: [1, 2, 3] }]
    const result = duplicateBlock(blocks, 0)
    ;(result[1].items as number[]).push(4)
    expect((result[0].items as number[])).toEqual([1, 2, 3])
  })
})

describe('getBlockPreview', () => {
  it('returns type and primary text when field exists', () => {
    const block: Block = { _type: 'heading', text: 'Hello World' }
    expect(getBlockPreview(block, 'text')).toBe('heading: Hello World')
  })

  it('returns just the type when no primaryTextField specified', () => {
    const block: Block = { _type: 'image', src: '/photo.jpg' }
    expect(getBlockPreview(block)).toBe('image')
  })

  it('returns just the type when primaryTextField value is not a string', () => {
    const block: Block = { _type: 'counter', count: 42 }
    expect(getBlockPreview(block, 'count')).toBe('counter')
  })

  it('returns just the type when primaryTextField does not exist on block', () => {
    const block: Block = { _type: 'spacer' }
    expect(getBlockPreview(block, 'title')).toBe('spacer')
  })
})

describe('flattenNestedReplicator / hydrateNestedReplicator', () => {
  it('handles flat blocks (no nesting)', () => {
    const blocks: Block[] = [
      { _type: 'heading', text: 'Title' },
      { _type: 'paragraph', text: 'Body' },
    ]
    const flattened = flattenNestedReplicator(blocks)
    const hydrated = hydrateNestedReplicator(flattened)
    expect(hydrated).toEqual(blocks)
  })

  it('handles 1 level of nesting', () => {
    const blocks: Block[] = [
      {
        _type: 'section',
        title: 'Section 1',
        content: [
          { _type: 'paragraph', text: 'Nested paragraph' },
        ],
      },
    ]
    const flattened = flattenNestedReplicator(blocks)
    const hydrated = hydrateNestedReplicator(flattened)
    expect(hydrated).toEqual(blocks)
  })

  it('handles 3 levels of nesting', () => {
    const blocks: Block[] = [
      {
        _type: 'level1',
        children: [
          {
            _type: 'level2',
            items: [
              {
                _type: 'level3',
                value: 'deep',
              },
            ],
          },
        ],
      },
    ]
    const flattened = flattenNestedReplicator(blocks)
    const hydrated = hydrateNestedReplicator(flattened)
    expect(hydrated).toEqual(blocks)
  })

  it('preserves non-block array fields unchanged', () => {
    const blocks: Block[] = [
      { _type: 'list', items: ['a', 'b', 'c'], count: 3 },
    ]
    const flattened = flattenNestedReplicator(blocks)
    const hydrated = hydrateNestedReplicator(flattened)
    expect(hydrated).toEqual(blocks)
  })

  it('hydrateNestedReplicator returns empty array for non-array input', () => {
    expect(hydrateNestedReplicator(null)).toEqual([])
    expect(hydrateNestedReplicator(undefined)).toEqual([])
    expect(hydrateNestedReplicator('not an array')).toEqual([])
    expect(hydrateNestedReplicator(42)).toEqual([])
  })

  it('hydrateNestedReplicator filters out invalid items', () => {
    const data = [
      { _type: 'valid', text: 'ok' },
      { noType: true },
      'not an object',
      null,
    ]
    const result = hydrateNestedReplicator(data)
    expect(result).toEqual([{ _type: 'valid', text: 'ok' }])
  })
})
