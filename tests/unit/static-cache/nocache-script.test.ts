import { describe, it, expect } from 'vitest'
import { getNoCacheScript } from '@/lib/static-cache/nocache-script'

describe('getNoCacheScript', () => {
  it('returns a string containing a script tag', () => {
    const script = getNoCacheScript()
    expect(script).toContain('<script>')
    expect(script).toContain('</script>')
  })

  it('queries elements with [data-nocache-section] attribute', () => {
    const script = getNoCacheScript()
    expect(script).toContain("document.querySelectorAll('[data-nocache-section]')")
  })

  it('reads the endpoint from data-nocache-endpoint attribute', () => {
    const script = getNoCacheScript()
    expect(script).toContain("el.getAttribute('data-nocache-endpoint')")
  })

  it('fetches the endpoint URL', () => {
    const script = getNoCacheScript()
    expect(script).toContain('fetch(endpoint)')
  })

  it('replaces innerHTML on successful fetch', () => {
    const script = getNoCacheScript()
    expect(script).toContain('el.innerHTML = html')
  })

  it('logs errors to console on failure without modifying the element', () => {
    const script = getNoCacheScript()
    expect(script).toContain("console.error('[madori:nocache] Failed to load section:', err)")
  })

  it('throws on non-ok responses', () => {
    const script = getNoCacheScript()
    expect(script).toContain('if (!r.ok) throw new Error(r.status)')
  })

  it('is wrapped in an IIFE to avoid global scope pollution', () => {
    const script = getNoCacheScript()
    expect(script).toContain('(function() {')
    expect(script).toContain('})();')
  })
})
