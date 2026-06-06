import { watch, type FSWatcher } from 'chokidar'
import type { GenerationPipeline, GenerationResult } from './generation-pipeline.js'

export interface WatchModeOptions {
  blueprintDir: string
  outputDir: string
  debounceMs?: number // default: 300
}

export class WatchMode {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private watcher: FSWatcher | null = null

  constructor(
    private readonly options: WatchModeOptions,
    private readonly pipeline: GenerationPipeline
  ) {}

  start(): void {
    const pattern = `${this.options.blueprintDir}/**/*.yaml`

    this.watcher = watch(pattern, {
      ignoreInitial: true,
    })

    this.watcher.on('all', (_event, _path) => {
      this.scheduleRegeneration()
    })

    console.log(`👀 Watching ${pattern} for changes...`)
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  scheduleRegeneration(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(async () => {
      try {
        const result: GenerationResult = await this.pipeline.run()
        console.log(
          `✓ Regenerated: ${result.blueprintsProcessed} blueprint(s), ` +
            `${result.filesGenerated} file(s) in ${result.durationMs.toFixed(0)}ms`
        )
      } catch (err: unknown) {
        const error = err as Error
        console.error(`✗ Regeneration failed: ${error.message}`)
      }
    }, this.options.debounceMs ?? 300)
  }
}
