import path from 'path'
import { MadoriConfigSchema, DEPRECATED_CONFIG_PROPERTIES, type MadoriConfig } from './schema'
import rawConfig from '../../../madori.config'

/**
 * Checks for deprecated properties in a raw config object and logs warnings.
 */
function checkDeprecatedProperties(config: Record<string, unknown>): void {
  for (const prop of DEPRECATED_CONFIG_PROPERTIES) {
    if (prop in config) {
      console.warn(
        `Deprecated: '${prop}' in madori.config.ts is no longer supported. ` +
        `Use flat files in resources/ instead. ` +
        `Run 'madori migrate:definitions' to migrate.`
      )
    }
  }
}

/**
 * Loads and validates the MADORI configuration.
 * The config is statically imported from the project root's madori.config.ts
 * so that the Next.js bundler can resolve it at build time.
 */
export async function loadConfig(_projectRoot?: string): Promise<MadoriConfig> {
  // Check for deprecated properties before parsing (which strips unknown keys)
  if (rawConfig && typeof rawConfig === 'object') {
    checkDeprecatedProperties(rawConfig as Record<string, unknown>)
  }

  return MadoriConfigSchema.parse(rawConfig)
}

/**
 * Resolves all config paths relative to the given project root.
 */
export function resolveConfigPaths(
  config: MadoriConfig,
  projectRoot: string
): MadoriConfig {
  return {
    ...config,
    contentPath: path.resolve(projectRoot, config.contentPath),
    resourcesPath: path.resolve(projectRoot, config.resourcesPath),
    usersPath: path.resolve(projectRoot, config.usersPath),
    assetsPath: path.resolve(projectRoot, config.assetsPath),
  }
}
