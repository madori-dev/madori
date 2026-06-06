import { describe, it, expect } from 'vitest'
import { validateHandle } from '../../../../packages/madori-cli/src/utils/handle-validator.js'

describe('validateHandle', () => {
  it('accepts a valid simple handle', () => {
    expect(validateHandle('blog-posts')).toEqual({ valid: true })
  })

  it('accepts a handle with underscores', () => {
    expect(validateHandle('my_collection')).toEqual({ valid: true })
  })

  it('accepts a single letter handle', () => {
    expect(validateHandle('a')).toEqual({ valid: true })
  })

  it('accepts a handle at max length (64 chars)', () => {
    const handle = 'a' + 'b'.repeat(63)
    expect(validateHandle(handle)).toEqual({ valid: true })
  })

  it('rejects an empty string', () => {
    const result = validateHandle('')
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('rejects a handle starting with a number', () => {
    const result = validateHandle('1blog')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('start with a lowercase letter')
  })

  it('rejects a handle starting with a hyphen', () => {
    const result = validateHandle('-blog')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('start with a lowercase letter')
  })

  it('rejects a handle starting with an underscore', () => {
    const result = validateHandle('_blog')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('start with a lowercase letter')
  })

  it('rejects uppercase characters', () => {
    const result = validateHandle('BlogPosts')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('lowercase letter')
  })

  it('rejects special characters', () => {
    const result = validateHandle('blog.posts')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('lowercase alphanumeric')
  })

  it('rejects spaces', () => {
    const result = validateHandle('blog posts')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('lowercase alphanumeric')
  })

  it('rejects handles exceeding 64 characters', () => {
    const handle = 'a' + 'b'.repeat(64)
    const result = validateHandle(handle)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('64 characters')
  })

  it('rejects reserved name "admin"', () => {
    const result = validateHandle('admin')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('reserved name')
  })

  it('rejects reserved name "system"', () => {
    const result = validateHandle('system')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('reserved name')
  })

  it('rejects reserved name "config"', () => {
    const result = validateHandle('config')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('reserved name')
  })

  it('allows handles that contain reserved names as substrings', () => {
    expect(validateHandle('admin-panel')).toEqual({ valid: true })
    expect(validateHandle('my-config')).toEqual({ valid: true })
    expect(validateHandle('system-logs')).toEqual({ valid: true })
  })
})
