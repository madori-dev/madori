import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { FileCacheDriver } from '@/lib/static-cache/drivers/file'

/**
 * Property 3: File driver cache round-trip
 * Validates: Requirements 3.1, 3.2, 3.3, 1.3
 *
 * For any valid URL path and HTML string, storing the HTML via the file driver
 * SHALL write a file at `{storagePath}/{url_path}/index.html`, and retrieving
 * it with the same key SHALL return the identical HTML string. All intermediate
 * directories SHALL exist after the write.
 */
describe('Property 3: File driver cache round-trip', () => {
  let storagePath: string
  let driver: FileCacheDriver

  beforeEach(async () => {
    storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-file-cache-'))
    driver = new FileCacheDriver(storagePath)
  })

  afterEach(async () => {
    await fs.rm(storagePath, { recursive: true, force: true })
  })

  /**
   * Generator for valid URL path segments (filesystem-safe).
   * Produces paths like "/blog/hello-world", "/about", "/docs/getting-started".
   */
  const urlSegmentChar = fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')
  )

  const urlSegment = fc
    .array(urlSegmentChar, { minLength: 1, maxLength: 20 })
    .map((chars) => chars.join(''))

  const urlPath = fc
    .array(urlSegment, { minLength: 1, maxLength: 5 })
    .map((segments) => '/' + segments.join('/'))

  const htmlContent = fc
    .string({ minLength: 1, maxLength: 500 })
    .map((s) => `<html><body>${s}</body></html>`)

  /**
   * **Validates: Requirements 3.1, 3.2, 1.3**
   *
   * For any valid URL path and HTML string, storing and then retrieving
   * with the same key SHALL return the identical HTML string.
   */
  it('round-trip: set then get returns identical HTML', async () => {
    await fc.assert(
      fc.asyncProperty(urlPath, htmlContent, async (key, html) => {
        await driver.set(key, html)
        const retrieved = await driver.get(key)
        expect(retrieved).toBe(html)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 3.1, 1.3**
   *
   * For any valid URL path and HTML string, storing the HTML SHALL write
   * a file at `{storagePath}/{url_path}/index.html`.
   */
  it('set writes a file at the expected path', async () => {
    await fc.assert(
      fc.asyncProperty(urlPath, htmlContent, async (key, html) => {
        await driver.set(key, html)

        const segments = key.replace(/^\//, '').replace(/\/$/, '')
        const expectedFilePath = path.join(storagePath, segments || '_root', 'index.html')
        const fileContent = await fs.readFile(expectedFilePath, 'utf-8')
        expect(fileContent).toBe(html)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 3.3**
   *
   * All intermediate directories SHALL exist after the write.
   */
  it('set creates all intermediate directories', async () => {
    await fc.assert(
      fc.asyncProperty(urlPath, htmlContent, async (key, html) => {
        await driver.set(key, html)

        const segments = key.replace(/^\//, '').replace(/\/$/, '')
        const dirPath = path.join(storagePath, segments || '_root')
        const stat = await fs.stat(dirPath)
        expect(stat.isDirectory()).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})
