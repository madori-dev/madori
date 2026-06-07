import { AiConfigSchema, McpConfigSchema, type AiFeatures } from '@/lib/ai/schema'
import rawConfig from '../../../madori.config'

/**
 * Returns the parsed AI config if the `ai` block is present and valid.
 * Returns null if absent or invalid.
 */
function getAiConfig() {
  const cfg = rawConfig as Record<string, unknown>
  if (!cfg.ai) return null

  const result = AiConfigSchema.safeParse(cfg.ai)
  return result.success ? result.data : null
}

/**
 * Returns the parsed MCP config if the `mcp` block is present and valid.
 * Returns null if absent or invalid.
 */
function getMcpConfig() {
  const cfg = rawConfig as Record<string, unknown>
  if (!cfg.mcp) return null

  const result = McpConfigSchema.safeParse(cfg.mcp)
  return result.success ? result.data : null
}

/**
 * Returns true if the `ai` config block is present and valid in madori.config.ts.
 * When absent, all AI-related features are disabled.
 */
export function isAiEnabled(): boolean {
  return getAiConfig() !== null
}

/**
 * Returns true if `mcp.enabled` is true in the config.
 * Returns false if the MCP config block is absent or `enabled` is false.
 */
export function isMcpEnabled(): boolean {
  const mcpConfig = getMcpConfig()
  return mcpConfig?.enabled === true
}

/**
 * Returns true if AI is enabled AND the specific feature flag is true.
 * When the `ai` config block is present, all features default to true.
 * When a feature flag is explicitly set to false, the feature is disabled.
 */
export function isFeatureEnabled(feature: keyof AiFeatures): boolean {
  const aiConfig = getAiConfig()
  if (!aiConfig) return false

  return aiConfig.features[feature] === true
}
