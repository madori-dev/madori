import type { FileSystemAdapter } from '@/lib/fs/adapter'
import type { ContentParser } from '@/lib/fs/parser'

export interface RuntimeSettings {
  site_name: string
  locale: string
  timezone: string
}

const DEFAULT_SETTINGS: RuntimeSettings = {
  site_name: 'My Madori Site',
  locale: 'en-US',
  timezone: 'UTC',
}

export class RuntimeSettingsService {
  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly parser: ContentParser,
    private readonly settingsPath: string
  ) {}

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
    await this.fs.writeFile(this.settingsPath, yaml)
  }

  async ensureExists(): Promise<void> {
    const exists = await this.fs.exists(this.settingsPath)
    if (!exists) {
      await this.write(DEFAULT_SETTINGS)
    }
  }
}
