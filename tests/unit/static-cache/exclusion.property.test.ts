import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { isExcluded } from '@/lib/static-cache/exclusion'

/**
 * Property 6: URL exclusion matching
 * Validates: Requirements 6.2, 6.3
 *
 * For any request URL that starts with the configured `cp.path` prefix, the
 * exclusion check SHALL return `true`. For any request URL matching a glob
 * pattern in the `exclude` array, the exclusion check SHALL return `true`.
 * For any request URL matching neither, it SHALL return `false`.
 */
describe('Property 6: URL exclusion matching', () => {
  // Generator for URL-like path segments (no wildcards)
  const urlSegment = fc.stringMatching(/^[a-z][a-z0-9\-]{0,9}$/)

  // Generator for URL paths like /foo/bar/baz
  const urlPath = fc
    .array(urlSegment, { minLength: 1, maxLength: 5 })
    .map((segments) => '/' + segments.join('/'))

  // Generator for a cpPath prefix (always starts with /)
  const cpPathGen = urlSegment.map((seg) => '/' + seg)

  /**
   * **Validates: Requirements 6.3**
   *
   * Any URL that starts with the configured CP path prefix SHALL be excluded.
   */
  it('CP path prefix: any URL starting with cpPath is excluded', () => {
    fc.assert(
      fc.property(cpPathGen, urlPath, (cpPath, suffix) => {
        const urlUnderCp = cpPath + suffix
        expect(isExcluded(urlUnderCp, [], cpPath)).toBe(true)
      }),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 6.3**
   *
   * The cpPath itself (exact match) SHALL also be excluded since it starts
   * with the prefix.
   */
  it('CP path exact: the cpPath itself is excluded', () => {
    fc.assert(
      fc.property(cpPathGen, (cpPath) => {
        expect(isExcluded(cpPath, [], cpPath)).toBe(true)
      }),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 6.2**
   *
   * Any URL that matches a glob pattern in the exclude array SHALL be excluded.
   */
  it('glob exclusion: a URL matching an exclude pattern is excluded', () => {
    fc.assert(
      fc.property(urlPath, cpPathGen, (url, cpPath) => {
        // Ensure the URL doesn't start with cpPath so we're testing glob logic only
        fc.pre(!url.startsWith(cpPath))

        // Create a glob pattern that matches: use the URL's first segment + wildcard
        const slashIdx = url.indexOf('/', 1)
        const prefix = slashIdx > 0 ? url.substring(0, slashIdx) : url
        const pattern = prefix + '/*'

        // If the URL has more segments after the prefix, it should match
        if (url.length > prefix.length) {
          expect(isExcluded(url, [pattern], cpPath)).toBe(true)
        }
      }),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 6.2**
   *
   * An exact path in the exclude array SHALL exclude that exact URL.
   */
  it('exact exclusion: a URL listed exactly in exclude patterns is excluded', () => {
    fc.assert(
      fc.property(urlPath, cpPathGen, (url, cpPath) => {
        fc.pre(!url.startsWith(cpPath))

        // The URL itself as a pattern (no wildcard) should match exactly
        expect(isExcluded(url, [url], cpPath)).toBe(true)
      }),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * A URL that does NOT start with cpPath and does NOT match any exclude
   * pattern SHALL return false.
   */
  it('no match: a URL matching neither cpPath nor exclude patterns returns false', () => {
    fc.assert(
      fc.property(urlPath, cpPathGen, (url, cpPath) => {
        // Ensure URL doesn't start with cpPath
        fc.pre(!url.startsWith(cpPath))

        // Use patterns that cannot possibly match the generated URL
        // by using a distinct prefix that is not in our character set
        const nonMatchingPatterns = ['/zzz-nomatch-aaa/*', '/yyy-nomatch-bbb']

        // Ensure our URL doesn't accidentally match these
        fc.pre(!url.startsWith('/zzz-nomatch-aaa'))
        fc.pre(url !== '/yyy-nomatch-bbb')

        expect(isExcluded(url, nonMatchingPatterns, cpPath)).toBe(false)
      }),
      { numRuns: 500 }
    )
  })
})
