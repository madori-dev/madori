import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { AVAILABLE_STARTERS, isValidStarter, downloadStarter } from '../starters.js'

describe('isValidStarter', () => {
  it('returns true for each available starter name', () => {
    expect(isValidStarter('marketing')).toBe(true)
    expect(isValidStarter('blog')).toBe(true)
    expect(isValidStarter('documentation')).toBe(true)
    expect(isValidStarter('saas')).toBe(true)
    expect(isValidStarter('agency')).toBe(true)
  })

  it('returns false for invalid names', () => {
    expect(isValidStarter('invalid')).toBe(false)
    expect(isValidStarter('wordpress')).toBe(false)
    expect(isValidStarter('')).toBe(false)
    expect(isValidStarter('BLOG')).toBe(false)
  })

  it('AVAILABLE_STARTERS has exactly 5 entries', () => {
    expect(AVAILABLE_STARTERS).toHaveLength(5)
  })
})

describe('downloadStarter fallback', () => {
  let tmpDir: string
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madori-starter-test-'))
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('logs a warning and returns without throwing when fetch returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      body: null,
    }))

    await expect(downloadStarter('blog', tmpDir)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Could not download starter')
    )
  })

  it('logs a warning and returns without throwing when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unreachable')))

    await expect(downloadStarter('blog', tmpDir)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to download starter')
    )
  })

  it('logs a warning and returns without throwing when fetch returns empty body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
    }))

    await expect(downloadStarter('blog', tmpDir)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Empty response when downloading starter')
    )
  })

  it('target directory is empty after a failed download', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')))

    const targetDir = path.join(tmpDir, 'my-project')
    await downloadStarter('marketing', targetDir)

    // Directory may or may not have been created depending on when the error occurs
    if (fs.existsSync(targetDir)) {
      const files = fs.readdirSync(targetDir)
      expect(files).toHaveLength(0)
    }
  })
})
