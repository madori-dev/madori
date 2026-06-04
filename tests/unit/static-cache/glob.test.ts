import { describe, it, expect } from 'vitest'
import { globToRegex, matchGlob } from '@/lib/static-cache/glob'

describe('globToRegex', () => {
  it('converts * to .* wildcard', () => {
    const regex = globToRegex('/blog/*')
    expect(regex.source).toBe('^\\/blog\\/.*$')
  })

  it('escapes regex special characters', () => {
    const regex = globToRegex('/path.html')
    expect(regex.test('/path.html')).toBe(true)
    expect(regex.test('/pathXhtml')).toBe(false)
  })

  it('anchors pattern to start and end', () => {
    const regex = globToRegex('/blog')
    expect(regex.test('/blog')).toBe(true)
    expect(regex.test('/blog/extra')).toBe(false)
    expect(regex.test('prefix/blog')).toBe(false)
  })
})

describe('matchGlob', () => {
  it('matches exact paths', () => {
    expect(matchGlob('/about', '/about')).toBe(true)
    expect(matchGlob('/about', '/contact')).toBe(false)
  })

  it('matches wildcard at end of path', () => {
    expect(matchGlob('/blog/*', '/blog/hello-world')).toBe(true)
    expect(matchGlob('/blog/*', '/blog/2024/post')).toBe(true)
    expect(matchGlob('/blog/*', '/other/page')).toBe(false)
  })

  it('matches wildcard in middle of path', () => {
    expect(matchGlob('/users/*/profile', '/users/123/profile')).toBe(true)
    expect(matchGlob('/users/*/profile', '/users/abc/profile')).toBe(true)
    expect(matchGlob('/users/*/profile', '/users/123/settings')).toBe(false)
  })

  it('matches single wildcard for any string', () => {
    expect(matchGlob('*', '/anything/at/all')).toBe(true)
    expect(matchGlob('*', '')).toBe(true)
  })

  it('handles paths with special regex characters', () => {
    expect(matchGlob('/path[1]', '/path[1]')).toBe(true)
    expect(matchGlob('/path(test)', '/path(test)')).toBe(true)
    expect(matchGlob('/file.html', '/file.html')).toBe(true)
    expect(matchGlob('/price$100', '/price$100')).toBe(true)
  })
})
