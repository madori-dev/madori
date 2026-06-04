import { describe, it, expect } from 'vitest'
import {
  CSRF_PLACEHOLDER,
  injectCsrfPlaceholder,
  replaceCsrfPlaceholder,
} from '@/lib/static-cache/csrf'

describe('CSRF_PLACEHOLDER', () => {
  it('is a deterministic placeholder string', () => {
    expect(CSRF_PLACEHOLDER).toBe('__MADORI_CSRF_TOKEN__')
  })
})

describe('injectCsrfPlaceholder', () => {
  it('replaces a single token occurrence with the placeholder', () => {
    const html = '<input type="hidden" name="_csrf" value="abc123">'
    const result = injectCsrfPlaceholder(html, 'abc123')
    expect(result).toBe(
      `<input type="hidden" name="_csrf" value="${CSRF_PLACEHOLDER}">`
    )
  })

  it('replaces multiple token occurrences with the placeholder', () => {
    const html = '<meta content="tok42"><input value="tok42">'
    const result = injectCsrfPlaceholder(html, 'tok42')
    expect(result).toBe(
      `<meta content="${CSRF_PLACEHOLDER}"><input value="${CSRF_PLACEHOLDER}">`
    )
  })

  it('returns html unchanged when token is not present', () => {
    const html = '<p>No token here</p>'
    const result = injectCsrfPlaceholder(html, 'missing-token')
    expect(result).toBe(html)
  })

  it('handles empty html string', () => {
    expect(injectCsrfPlaceholder('', 'token')).toBe('')
  })

  it('handles empty token string', () => {
    const html = '<p>content</p>'
    // Empty token matches between every character — this is replaceAll behavior
    // In practice tokens are never empty, but the function delegates to replaceAll
    const result = injectCsrfPlaceholder(html, '')
    expect(result).toBe(html.replaceAll('', CSRF_PLACEHOLDER))
  })
})

describe('replaceCsrfPlaceholder', () => {
  it('replaces a single placeholder with the fresh token', () => {
    const html = `<input value="${CSRF_PLACEHOLDER}">`
    const result = replaceCsrfPlaceholder(html, 'fresh-token-xyz')
    expect(result).toBe('<input value="fresh-token-xyz">')
  })

  it('replaces multiple placeholders with the fresh token', () => {
    const html = `<meta content="${CSRF_PLACEHOLDER}"><input value="${CSRF_PLACEHOLDER}">`
    const result = replaceCsrfPlaceholder(html, 'new-token')
    expect(result).toBe('<meta content="new-token"><input value="new-token">')
  })

  it('returns html unchanged when no placeholder is present', () => {
    const html = '<p>No placeholder here</p>'
    const result = replaceCsrfPlaceholder(html, 'fresh-token')
    expect(result).toBe(html)
  })

  it('handles empty html string', () => {
    expect(replaceCsrfPlaceholder('', 'token')).toBe('')
  })
})

describe('inject → replace round-trip', () => {
  it('produces html with fresh token in all original token positions', () => {
    const originalToken = 'original-csrf-abc123'
    const freshToken = 'fresh-csrf-xyz789'
    const html = `<html><form><input name="_csrf" value="${originalToken}"><meta content="${originalToken}"></form></html>`

    const cached = injectCsrfPlaceholder(html, originalToken)
    const served = replaceCsrfPlaceholder(cached, freshToken)

    // No placeholder remains
    expect(served).not.toContain(CSRF_PLACEHOLDER)
    // No original token remains
    expect(served).not.toContain(originalToken)
    // Fresh token is in place
    expect(served).toContain(freshToken)
    // Structure is preserved
    expect(served).toBe(
      `<html><form><input name="_csrf" value="${freshToken}"><meta content="${freshToken}"></form></html>`
    )
  })
})
