import { describe, it, expect } from 'vitest'
import { getDefaultsFromBlueprint, getAllFields } from '@/lib/blueprints/defaults'
import type { Blueprint } from '@/lib/blueprints/types'

describe('getAllFields', () => {
  it('returns fields from tab-level fields', () => {
    const blueprint: Blueprint = {
      handle: 'test',
      tabs: {
        main: {
          display: 'Main',
          fields: [
            { handle: 'title', field: { type: 'text' } },
            { handle: 'body', field: { type: 'markdown' } },
          ],
        },
      },
    }

    const fields = getAllFields(blueprint)
    expect(fields).toHaveLength(2)
    expect(fields[0].handle).toBe('title')
    expect(fields[1].handle).toBe('body')
  })

  it('returns fields from sections within tabs', () => {
    const blueprint: Blueprint = {
      handle: 'test',
      tabs: {
        main: {
          display: 'Main',
          fields: [{ handle: 'title', field: { type: 'text' } }],
          sections: {
            meta: {
              display: 'Meta',
              fields: [{ handle: 'author', field: { type: 'text' } }],
            },
          },
        },
      },
    }

    const fields = getAllFields(blueprint)
    expect(fields).toHaveLength(2)
    expect(fields.map((f) => f.handle)).toEqual(['title', 'author'])
  })

  it('returns fields from multiple tabs', () => {
    const blueprint: Blueprint = {
      handle: 'test',
      tabs: {
        main: {
          display: 'Main',
          fields: [{ handle: 'title', field: { type: 'text' } }],
        },
        seo: {
          display: 'SEO',
          fields: [{ handle: 'meta_title', field: { type: 'text' } }],
        },
      },
    }

    const fields = getAllFields(blueprint)
    expect(fields).toHaveLength(2)
    expect(fields.map((f) => f.handle)).toEqual(['title', 'meta_title'])
  })

  it('returns empty array for blueprint with no fields', () => {
    const blueprint: Blueprint = {
      handle: 'empty',
      tabs: {
        main: { display: 'Main', fields: [] },
      },
    }

    expect(getAllFields(blueprint)).toEqual([])
  })
})

describe('getDefaultsFromBlueprint', () => {
  it('returns defaults from fields that define them', () => {
    const blueprint: Blueprint = {
      handle: 'test',
      tabs: {
        main: {
          display: 'Main',
          fields: [
            { handle: 'status', field: { type: 'select', default: 'draft' } },
            { handle: 'featured', field: { type: 'toggle', default: false } },
          ],
        },
      },
    }

    const defaults = getDefaultsFromBlueprint(blueprint)
    expect(defaults).toEqual({ status: 'draft', featured: false })
  })

  it('omits fields without a default value', () => {
    const blueprint: Blueprint = {
      handle: 'test',
      tabs: {
        main: {
          display: 'Main',
          fields: [
            { handle: 'title', field: { type: 'text' } },
            { handle: 'status', field: { type: 'select', default: 'published' } },
            { handle: 'body', field: { type: 'markdown' } },
          ],
        },
      },
    }

    const defaults = getDefaultsFromBlueprint(blueprint)
    expect(defaults).toEqual({ status: 'published' })
    expect('title' in defaults).toBe(false)
    expect('body' in defaults).toBe(false)
  })

  it('handles defaults across multiple tabs and sections', () => {
    const blueprint: Blueprint = {
      handle: 'test',
      tabs: {
        main: {
          display: 'Main',
          fields: [
            { handle: 'title', field: { type: 'text', default: 'Untitled' } },
          ],
          sections: {
            options: {
              display: 'Options',
              fields: [
                { handle: 'layout', field: { type: 'select', default: 'default' } },
              ],
            },
          },
        },
        seo: {
          display: 'SEO',
          fields: [
            { handle: 'robots', field: { type: 'select', default: 'index,follow' } },
          ],
        },
      },
    }

    const defaults = getDefaultsFromBlueprint(blueprint)
    expect(defaults).toEqual({
      title: 'Untitled',
      layout: 'default',
      robots: 'index,follow',
    })
  })

  it('preserves falsy default values (false, 0, empty string)', () => {
    const blueprint: Blueprint = {
      handle: 'test',
      tabs: {
        main: {
          display: 'Main',
          fields: [
            { handle: 'enabled', field: { type: 'toggle', default: false } },
            { handle: 'count', field: { type: 'number', default: 0 } },
            { handle: 'placeholder', field: { type: 'text', default: '' } },
          ],
        },
      },
    }

    const defaults = getDefaultsFromBlueprint(blueprint)
    expect(defaults).toEqual({ enabled: false, count: 0, placeholder: '' })
  })

  it('returns empty object when no fields have defaults', () => {
    const blueprint: Blueprint = {
      handle: 'test',
      tabs: {
        main: {
          display: 'Main',
          fields: [
            { handle: 'title', field: { type: 'text' } },
            { handle: 'body', field: { type: 'markdown' } },
          ],
        },
      },
    }

    const defaults = getDefaultsFromBlueprint(blueprint)
    expect(defaults).toEqual({})
  })

  it('returns empty object for blueprint with no tabs', () => {
    const blueprint: Blueprint = { handle: 'empty', tabs: {} }
    const defaults = getDefaultsFromBlueprint(blueprint)
    expect(defaults).toEqual({})
  })

  it('handles array and object default values', () => {
    const blueprint: Blueprint = {
      handle: 'test',
      tabs: {
        main: {
          display: 'Main',
          fields: [
            { handle: 'tags', field: { type: 'multiselect', default: ['news', 'featured'] } },
            { handle: 'config', field: { type: 'yaml', default: { key: 'value' } } },
          ],
        },
      },
    }

    const defaults = getDefaultsFromBlueprint(blueprint)
    expect(defaults).toEqual({
      tags: ['news', 'featured'],
      config: { key: 'value' },
    })
  })
})
