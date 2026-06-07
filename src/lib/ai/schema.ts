import { z } from 'zod'

export const AiFeaturesSchema = z.object({
  editor: z.boolean().default(true),
  seo: z.boolean().default(true),
  altText: z.boolean().default(true),
  blueprints: z.boolean().default(true),
  autoFill: z.boolean().default(true),
  taxonomy: z.boolean().default(true),
  bulk: z.boolean().default(true),
})

export const AiConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai-compatible']),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  spendLimit: z.object({
    maxTokens: z.number().positive(),
    period: z.enum(['daily', 'weekly', 'monthly']),
  }).optional(),
  features: AiFeaturesSchema.default(() => ({
    editor: true,
    seo: true,
    altText: true,
    blueprints: true,
    autoFill: true,
    taxonomy: true,
    bulk: true,
  })),
})

export const McpConfigSchema = z.object({
  enabled: z.boolean().default(false),
  path: z.string().default('/api/mcp'),
})

export type AiConfig = z.infer<typeof AiConfigSchema>
export type AiFeatures = z.infer<typeof AiFeaturesSchema>
export type McpConfig = z.infer<typeof McpConfigSchema>

/**
 * Retrieves the AI configuration from the Madori config.
 * Returns undefined if the `ai` block is not present.
 */
export async function getAiConfig(): Promise<AiConfig | undefined> {
  // Dynamic import to avoid circular dependency (config/schema imports ai/schema)
  const { loadConfig } = await import('@/lib/config/loader')
  const config = await loadConfig()
  return config.ai
}

/**
 * Retrieves the MCP configuration from the Madori config.
 * Returns undefined if the `mcp` block is not present.
 */
export async function getMcpConfig(): Promise<McpConfig | undefined> {
  // Dynamic import to avoid circular dependency (config/schema imports ai/schema)
  const { loadConfig } = await import('@/lib/config/loader')
  const config = await loadConfig()
  return config.mcp
}
