import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'
import { AtomicFileWriter } from '@/lib/fs/atomic-writer'
import * as path from 'path'
import type { ContentMutationReporter } from '@/lib/mutations'
import { noOpContentMutationReporter } from '@/lib/mutations'
import type { RuntimeSettings } from '@/lib/settings/model'

export type { RuntimeSettings } from '@/lib/settings/model'

const DEFAULT_SETTINGS: RuntimeSettings = {
  site_name: 'My Madori Site',
  locale: 'en-US',
  timezone: 'UTC',
}

export class RuntimeSettingsService {
  private readonly atomicWriter: AtomicFileWriter

  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    private readonly settingsPath: string,
    private readonly mutations: ContentMutationReporter = noOpContentMutationReporter
  ) {
    this.atomicWriter = new AtomicFileWriter(fs)
  }

  async read(): Promise<RuntimeSettings> {
    await this.ensureExists()
    const raw = await this.fs.readFile(this.settingsPath)
    const data = this.parser.parseYaml<Partial<RuntimeSettings>>(raw)
    return {
      site_name: data.site_name ?? DEFAULT_SETTINGS.site_name,
      locale: data.locale ?? DEFAULT_SETTINGS.locale,
      timezone: data.timezone ?? DEFAULT_SETTINGS.timezone,
    }
  }

  async write(settings: RuntimeSettings): Promise<void> {
    const yaml = this.parser.serializeYaml(settings)
    const result = await this.atomicWriter.writeFileAtomic(this.settingsPath, yaml)
    if (!result.success) throw result.error ?? new Error('Could not save runtime settings')
    this.mutations.report({ action: 'update', paths: [path.resolve(this.settingsPath)], resource: { type: 'runtime-settings', id: 'runtime' }, message: 'Updated runtime settings', source: 'system', timestamp: Date.now() })
  }

  async ensureExists(): Promise<void> {
    const exists = await this.fs.exists(this.settingsPath)
    if (!exists) {
      await this.write(DEFAULT_SETTINGS)
    }
  }
}
