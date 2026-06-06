import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WatchMode } from '../watch-mode.js'
import type { GenerationPipeline, GenerationResult } from '../generation-pipeline.js'

// Mock chokidar
vi.mock('chokidar', () => {
  const listeners: Record<string, Function[]> = {}
  const mockWatcher = {
    on(event: string, cb: Function) {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(cb)
      return mockWatcher
    },
    close: vi.fn(),
    _emit(event: string, ...args: unknown[]) {
      for (const cb of listeners[event] ?? []) {
        cb(...args)
      }
    },
    _listeners: listeners,
  }
  return {
    watch: vi.fn(() => mockWatcher),
    __mockWatcher: mockWatcher,
  }
})

function createMockPipeline(result?: Partial<GenerationResult>): GenerationPipeline {
  return {
    run: vi.fn().mockResolvedValue({
      blueprintsProcessed: 2,
      filesGenerated: 8,
      durationMs: 42,
      ...result,
    }),
  } as unknown as GenerationPipeline
}

describe('WatchMode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('can be instantiated with options and pipeline', () => {
    const pipeline = createMockPipeline()
    const watchMode = new WatchMode(
      { blueprintDir: 'resources/blueprints', outputDir: '.madori/generated' },
      pipeline
    )
    expect(watchMode).toBeInstanceOf(WatchMode)
  })

  it('starts watching and logs the pattern', async () => {
    const pipeline = createMockPipeline()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const watchMode = new WatchMode(
      { blueprintDir: 'resources/blueprints', outputDir: '.madori/generated' },
      pipeline
    )
    watchMode.start()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Watching')
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('resources/blueprints/**/*.yaml')
    )
  })

  it('debounces rapid file changes into a single regeneration', async () => {
    const pipeline = createMockPipeline()
    const watchMode = new WatchMode(
      { blueprintDir: 'resources/blueprints', outputDir: '.madori/generated', debounceMs: 300 },
      pipeline
    )

    vi.spyOn(console, 'log').mockImplementation(() => {})

    // Simulate 5 rapid file changes within the debounce window
    watchMode.scheduleRegeneration()
    await vi.advanceTimersByTimeAsync(100)
    watchMode.scheduleRegeneration()
    await vi.advanceTimersByTimeAsync(100)
    watchMode.scheduleRegeneration()
    await vi.advanceTimersByTimeAsync(100)
    watchMode.scheduleRegeneration()
    await vi.advanceTimersByTimeAsync(100)
    watchMode.scheduleRegeneration()

    // Before debounce window expires, pipeline should not have been called
    expect(pipeline.run).not.toHaveBeenCalled()

    // Advance past the debounce window
    await vi.advanceTimersByTimeAsync(300)

    // Pipeline should have been called exactly once
    expect(pipeline.run).toHaveBeenCalledTimes(1)
  })

  it('uses default debounce of 300ms when not specified', async () => {
    const pipeline = createMockPipeline()
    const watchMode = new WatchMode(
      { blueprintDir: 'resources/blueprints', outputDir: '.madori/generated' },
      pipeline
    )

    vi.spyOn(console, 'log').mockImplementation(() => {})

    watchMode.scheduleRegeneration()

    // At 299ms, not yet called
    await vi.advanceTimersByTimeAsync(299)
    expect(pipeline.run).not.toHaveBeenCalled()

    // At 300ms, called
    await vi.advanceTimersByTimeAsync(1)
    expect(pipeline.run).toHaveBeenCalledTimes(1)
  })

  it('logs summary after successful regeneration', async () => {
    const pipeline = createMockPipeline({
      blueprintsProcessed: 3,
      filesGenerated: 12,
      durationMs: 55.7,
    })
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const watchMode = new WatchMode(
      { blueprintDir: 'resources/blueprints', outputDir: '.madori/generated', debounceMs: 100 },
      pipeline
    )

    watchMode.scheduleRegeneration()
    await vi.advanceTimersByTimeAsync(100)

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('3 blueprint(s)')
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('12 file(s)')
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('56ms')
    )
  })

  it('catches and logs errors during regeneration without crashing', async () => {
    const pipeline = {
      run: vi.fn().mockRejectedValue(new Error('Invalid YAML in blog.yaml: unexpected end of input')),
    } as unknown as GenerationPipeline

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const watchMode = new WatchMode(
      { blueprintDir: 'resources/blueprints', outputDir: '.madori/generated', debounceMs: 100 },
      pipeline
    )

    watchMode.scheduleRegeneration()
    await vi.advanceTimersByTimeAsync(100)

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Regeneration failed')
    )
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid YAML in blog.yaml')
    )
  })

  it('stop() clears the debounce timer and closes watcher', async () => {
    const pipeline = createMockPipeline()
    const watchMode = new WatchMode(
      { blueprintDir: 'resources/blueprints', outputDir: '.madori/generated', debounceMs: 300 },
      pipeline
    )

    vi.spyOn(console, 'log').mockImplementation(() => {})

    watchMode.start()
    watchMode.scheduleRegeneration()

    // Stop before debounce fires
    watchMode.stop()

    await vi.advanceTimersByTimeAsync(500)

    // Pipeline should never be called since we stopped
    expect(pipeline.run).not.toHaveBeenCalled()
  })
})
