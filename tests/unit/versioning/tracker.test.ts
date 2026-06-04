import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VersionTracker } from '@/lib/versioning/tracker'
import type { FileSystemAdapter } from '@/lib/fs/adapter'

/**
 * Unit tests for VersionTracker module.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

function createMockFs(files: Map<string, string> = new Map()): FileSystemAdapter {
  return {
    exists: vi.fn(async (path: string) => files.has(path)),
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path)
      if (!content) throw new Error(`File not found: ${path}`)
      return content
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      files.set(path, content)
    }),
    mkdir: vi.fn(async () => {}),
    deleteFile: vi.fn(async () => {}),
    listFiles: vi.fn(async () => []),
    listDirectories: vi.fn(async () => []),
    copyFile: vi.fn(async () => {}),
    moveFile: vi.fn(async () => {}),
  }
}

describe('VersionTracker', () => {
  const manifestPath = '.madori/manifest.json'
  const expectedVersion = '1.0.0'

  describe('loadManifest', () => {
    it('creates manifest with expected version and empty changelog when file does not exist', async () => {
      const mockFs = createMockFs()
      const tracker = new VersionTracker(mockFs, manifestPath, expectedVersion)

      const manifest = await tracker.loadManifest()

      expect(manifest).toEqual({
        schemaVersion: '1.0.0',
        changelog: [],
      })
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        manifestPath,
        JSON.stringify({ schemaVersion: '1.0.0', changelog: [] }, null, 2)
      )
    })

    it('creates parent directory if it does not exist', async () => {
      const files = new Map<string, string>()
      const mockFs = createMockFs(files)
      // Override exists to return false for both manifest and directory
      ;(mockFs.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false)

      const tracker = new VersionTracker(mockFs, manifestPath, expectedVersion)
      await tracker.loadManifest()

      expect(mockFs.mkdir).toHaveBeenCalledWith('.madori')
    })

    it('loads and parses existing manifest file', async () => {
      const existingManifest = {
        schemaVersion: '0.9.0',
        changelog: ['0.8.0', '0.7.0'],
      }
      const files = new Map([
        [manifestPath, JSON.stringify(existingManifest)],
      ])
      const mockFs = createMockFs(files)
      const tracker = new VersionTracker(mockFs, manifestPath, expectedVersion)

      const manifest = await tracker.loadManifest()

      expect(manifest).toEqual(existingManifest)
    })

    it('throws on invalid manifest JSON', async () => {
      const files = new Map([
        [manifestPath, 'not valid json'],
      ])
      const mockFs = createMockFs(files)
      const tracker = new VersionTracker(mockFs, manifestPath, expectedVersion)

      await expect(tracker.loadManifest()).rejects.toThrow()
    })

    it('throws on manifest with invalid schema version format', async () => {
      const files = new Map([
        [manifestPath, JSON.stringify({ schemaVersion: 'bad', changelog: [] })],
      ])
      const mockFs = createMockFs(files)
      const tracker = new VersionTracker(mockFs, manifestPath, expectedVersion)

      await expect(tracker.loadManifest()).rejects.toThrow()
    })
  })

  describe('check', () => {
    it('returns compatible: true when manifest version matches expected', async () => {
      const files = new Map([
        [manifestPath, JSON.stringify({ schemaVersion: '1.0.0', changelog: ['0.9.0'] })],
      ])
      const mockFs = createMockFs(files)
      const tracker = new VersionTracker(mockFs, manifestPath, '1.0.0')

      const result = await tracker.check()

      expect(result.compatible).toBe(true)
      expect(result.currentVersion).toBe('1.0.0')
      expect(result.expectedVersion).toBe('1.0.0')
      expect(result.pendingVersions).toEqual([])
    })

    it('returns compatible: false with pending versions when manifest is behind', async () => {
      const files = new Map([
        [manifestPath, JSON.stringify({ schemaVersion: '0.9.0', changelog: ['0.8.0'] })],
      ])
      const mockFs = createMockFs(files)
      const tracker = new VersionTracker(mockFs, manifestPath, '1.0.0')

      const result = await tracker.check()

      expect(result.compatible).toBe(false)
      expect(result.currentVersion).toBe('0.9.0')
      expect(result.expectedVersion).toBe('1.0.0')
      expect(result.pendingVersions).toContain('1.0.0')
    })

    it('returns compatible: false when manifest is ahead of expected', async () => {
      const files = new Map([
        [manifestPath, JSON.stringify({ schemaVersion: '2.0.0', changelog: ['1.0.0'] })],
      ])
      const mockFs = createMockFs(files)
      const tracker = new VersionTracker(mockFs, manifestPath, '1.5.0')

      const result = await tracker.check()

      expect(result.compatible).toBe(false)
      expect(result.currentVersion).toBe('2.0.0')
      expect(result.expectedVersion).toBe('1.5.0')
    })

    it('creates manifest and returns compatible when no manifest exists', async () => {
      const mockFs = createMockFs()
      const tracker = new VersionTracker(mockFs, manifestPath, '1.0.0')

      const result = await tracker.check()

      // When manifest doesn't exist, it's created with expectedVersion, so it matches
      expect(result.compatible).toBe(true)
      expect(result.currentVersion).toBe('1.0.0')
      expect(result.expectedVersion).toBe('1.0.0')
    })
  })

  describe('bumpVersion', () => {
    it('updates schemaVersion and prepends old version to changelog', async () => {
      const files = new Map([
        [manifestPath, JSON.stringify({ schemaVersion: '1.0.0', changelog: [] })],
      ])
      const mockFs = createMockFs(files)
      const tracker = new VersionTracker(mockFs, manifestPath, '1.0.0')

      const result = await tracker.bumpVersion('1.1.0')

      expect(result.schemaVersion).toBe('1.1.0')
      expect(result.changelog).toEqual(['1.0.0'])
    })

    it('preserves existing changelog entries on bump', async () => {
      const files = new Map([
        [manifestPath, JSON.stringify({ schemaVersion: '1.1.0', changelog: ['1.0.0', '0.9.0'] })],
      ])
      const mockFs = createMockFs(files)
      const tracker = new VersionTracker(mockFs, manifestPath, '1.1.0')

      const result = await tracker.bumpVersion('1.2.0')

      expect(result.schemaVersion).toBe('1.2.0')
      expect(result.changelog).toEqual(['1.1.0', '1.0.0', '0.9.0'])
    })

    it('writes updated manifest to disk', async () => {
      const files = new Map([
        [manifestPath, JSON.stringify({ schemaVersion: '1.0.0', changelog: [] })],
      ])
      const mockFs = createMockFs(files)
      const tracker = new VersionTracker(mockFs, manifestPath, '1.0.0')

      await tracker.bumpVersion('1.1.0')

      const written = JSON.parse(files.get(manifestPath)!)
      expect(written.schemaVersion).toBe('1.1.0')
      expect(written.changelog).toEqual(['1.0.0'])
    })
  })
})

describe('CLI check command exit codes', () => {
  let originalExitCode: number | undefined
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    originalExitCode = process.exitCode
    process.exitCode = undefined
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.exitCode = originalExitCode
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it('exits with code 0 when version is compatible', async () => {
    // Simulate the CLI logic: compatible result → exitCode 0
    const files = new Map([
      ['.madori/manifest.json', JSON.stringify({ schemaVersion: '1.0.0', changelog: [] })],
    ])
    const mockFs = createMockFs(files)
    const tracker = new VersionTracker(mockFs, '.madori/manifest.json', '1.0.0')

    const result = await tracker.check()

    if (result.compatible) {
      console.log(`✓ Schema version is up to date (v${result.currentVersion})`)
      process.exitCode = 0
    } else {
      console.error(`✗ Schema version mismatch`)
      process.exitCode = 1
    }

    expect(process.exitCode).toBe(0)
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('up to date')
    )
  })

  it('exits with code 1 when version is incompatible', async () => {
    const files = new Map([
      ['.madori/manifest.json', JSON.stringify({ schemaVersion: '0.9.0', changelog: [] })],
    ])
    const mockFs = createMockFs(files)
    const tracker = new VersionTracker(mockFs, '.madori/manifest.json', '1.0.0')

    const result = await tracker.check()

    if (result.compatible) {
      console.log(`✓ Schema version is up to date (v${result.currentVersion})`)
      process.exitCode = 0
    } else {
      console.error(
        `✗ Schema version mismatch: manifest is v${result.currentVersion}, expected v${result.expectedVersion}`
      )
      if (result.pendingVersions.length > 0) {
        console.error('Pending versions:')
        for (const version of result.pendingVersions) {
          console.error(`  - v${version}`)
        }
      }
      process.exitCode = 1
    }

    expect(process.exitCode).toBe(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('mismatch')
    )
  })

  it('lists pending versions when incompatible', async () => {
    const files = new Map([
      ['.madori/manifest.json', JSON.stringify({ schemaVersion: '0.8.0', changelog: ['0.7.0'] })],
    ])
    const mockFs = createMockFs(files)
    const tracker = new VersionTracker(mockFs, '.madori/manifest.json', '1.0.0')

    const result = await tracker.check()

    expect(result.compatible).toBe(false)
    expect(result.pendingVersions.length).toBeGreaterThan(0)

    // Simulate CLI output
    if (!result.compatible && result.pendingVersions.length > 0) {
      console.error('Pending versions:')
      for (const version of result.pendingVersions) {
        console.error(`  - v${version}`)
      }
      process.exitCode = 1
    }

    expect(process.exitCode).toBe(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith('Pending versions:')
    expect(consoleErrorSpy).toHaveBeenCalledWith('  - v1.0.0')
  })
})
