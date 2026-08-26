import * as path from 'path'
import { describe, expect, it } from 'vitest'
import { resolveZipEntryDestination } from '../archive-importer.js'

describe('ZIP extraction paths', () => {
  const extractionRoot = path.resolve('/tmp/madori-import-test')

  it('keeps regular entries inside extraction root', () => {
    expect(resolveZipEntryDestination('content/pages/home.md', extractionRoot)).toBe(
      path.join(extractionRoot, 'content/pages/home.md'),
    )
  })

  it.each([
    '../outside.md',
    'content/../../outside.md',
    '/absolute/path.md',
    'C:/absolute/path.md',
    '..\\outside.md',
    'content/evil\0.md',
  ])('rejects unsafe path %s', (entryPath) => {
    expect(() => resolveZipEntryDestination(entryPath, extractionRoot)).toThrow(
      `Unsafe ZIP entry: ${entryPath}`,
    )
  })

  it('rejects Unix symbolic-link entries', () => {
    const symbolicLinkMode = 0o120777 << 16

    expect(() => resolveZipEntryDestination('content/link', extractionRoot, symbolicLinkMode)).toThrow(
      'Unsafe ZIP entry: content/link',
    )
  })
})
