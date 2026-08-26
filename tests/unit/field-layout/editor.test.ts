import { describe, expect, it } from 'vitest'
import { editFieldLayout, editFieldList, emptyField, fieldAt } from '@/lib/field-layout'
import type { Blueprint, FieldDefinition } from '@/lib/blueprints/types'

const field = (handle: string): FieldDefinition => ({ handle, field: { type: 'text' } })
const blueprint = (): Blueprint => ({
  handle: 'article',
  tabs: {
    main: {
      fields: [field('title'), field('slug')],
      sections: { details: { fields: [field('author'), field('date')] } },
    },
  },
})

describe('Field Layout editing interface', () => {
  it('applies bounds-safe immutable field edits', () => {
    const original = [field('one'), field('two')]
    expect(editFieldList(original, { type: 'move', from: 0, to: 1 }).map(item => item.handle)).toEqual(['two', 'one'])
    expect(editFieldList(original, { type: 'remove', index: 0 }).map(item => item.handle)).toEqual(['two'])
    expect(editFieldList(original, { type: 'update', index: 1, field: field('changed') }).map(item => item.handle)).toEqual(['one', 'changed'])
    expect(editFieldList(original, { type: 'add' }).at(-1)).toEqual(emptyField())
    expect(original.map(item => item.handle)).toEqual(['one', 'two'])
  })

  it('owns tab and section key allocation without collisions', () => {
    const withSparseKeys: Blueprint = {
      ...blueprint(),
      tabs: {
        main: { fields: [], sections: { section_2: { fields: [] }, section_3: { fields: [] } } },
        tab_3: { fields: [] },
      },
    }
    const withTab = editFieldLayout(withSparseKeys, { type: 'tab.add' })
    expect(withTab.tabs).toHaveProperty('tab_4')
    const withSection = editFieldLayout(withSparseKeys, { type: 'section.add', tabKey: 'main' })
    expect(withSection.tabs.main.sections).toHaveProperty('section_4')
  })

  it('edits and resolves nested fields through one target model', () => {
    const target = { tabKey: 'main', sectionKey: 'details', fieldIndex: 1 }
    const updated = editFieldLayout(blueprint(), {
      type: 'field.edit',
      target: { tabKey: target.tabKey, sectionKey: target.sectionKey },
      mutation: { type: 'update', index: target.fieldIndex, field: field('published_at') },
    })
    expect(fieldAt(updated, target)?.handle).toBe('published_at')
  })

  it('keeps at least one tab and ignores missing targets', () => {
    const original = blueprint()
    expect(editFieldLayout(original, { type: 'tab.remove', tabKey: 'main' })).toBe(original)
    expect(editFieldLayout(original, {
      type: 'field.edit',
      target: { tabKey: 'missing' },
      mutation: { type: 'remove', index: 0 },
    })).toBe(original)
  })
})
