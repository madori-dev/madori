import { describe, it, beforeEach, afterEach, vi } from 'vitest'
import fc from 'fast-check'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { AVAILABLE_PRESETS, getPreset, applyPreset } from '../preset-generator.js'
import { validateBlueprintSchema } from '../blueprint-generator.js'

/**
 * Validates: Requirements 8.1, 8.6
 * Property 16: Presets generate valid resources
 *
 * For any supported preset name, the preset's blueprints should all pass
 * validateBlueprintSchema, and applyPreset should create the expected number
 * of files without errors.
 */

let tempDir: string

// Mock resolveProjectPath to redirect all file writes to temp directory
vi.mock('../../utils/resolve-paths.js', () => ({
  resolveProjectPath: (...segments: string[]) => {
    return path.join(process.env.__TEST_TEMP_DIR__ || os.tmpdir(), ...segments)
  },
}))

describe('PresetGenerator — Property Tests', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'madori-preset-prop-'))
    process.env.__TEST_TEMP_DIR__ = tempDir
  })

  afterEach(async () => {
    delete process.env.__TEST_TEMP_DIR__
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('Property 16: Presets generate valid resources', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...AVAILABLE_PRESETS),
        async (presetName) => {
          // Clean temp dir between runs to avoid file conflicts across iterations
          await fs.rm(tempDir, { recursive: true, force: true })
          await fs.mkdir(tempDir, { recursive: true })

          const preset = getPreset(presetName)

          // Preset must have at least 1 collection and 1 blueprint
          if (preset.collections.length < 1) return false
          if (preset.blueprints.length < 1) return false

          // Each blueprint in the preset should pass schema validation
          for (const blueprint of preset.blueprints) {
            const validation = validateBlueprintSchema(blueprint)
            if (!validation.valid) return false
          }

          // applyPreset should complete without throwing
          const result = await applyPreset(presetName, { force: true })

          // Result should reference the correct preset name
          if (result.presetName !== presetName) return false

          // No conflicts when using force mode
          if (result.conflicts.length > 0) return false

          // The number of filesCreated should match expected:
          // collections + blueprints + fieldsets + navigations
          const expectedFileCount =
            preset.collections.length +
            preset.blueprints.length +
            preset.fieldsets.length +
            preset.navigations.length

          if (result.filesCreated.length !== expectedFileCount) return false

          // All created files should actually exist on disk
          for (const filePath of result.filesCreated) {
            try {
              await fs.access(filePath)
            } catch {
              return false
            }
          }

          return true
        }
      ),
      { numRuns: 20 }
    )
  })
})
