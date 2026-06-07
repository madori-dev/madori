import type { ProviderAdapter, TokenUsage } from '../provider/interface'

/**
 * Options for SEO generation functions.
 */
export interface SeoGeneratorOptions {
  provider: ProviderAdapter
}

/**
 * Result from an SEO generation operation.
 */
export interface SeoResult {
  text: string
  usage: TokenUsage
}

const META_TITLE_MAX_LENGTH = 60
const META_DESCRIPTION_MAX_LENGTH = 160

const META_TITLE_SYSTEM_PROMPT = `You are an SEO specialist. Generate a concise, compelling meta title for the given content.

Rules:
- The meta title MUST be ${META_TITLE_MAX_LENGTH} characters or fewer
- Focus on the primary topic of the content
- Use action-oriented or descriptive language
- Do not use quotes around the title
- Return ONLY the meta title text, nothing else`

const META_DESCRIPTION_SYSTEM_PROMPT = `You are an SEO specialist. Generate a concise, compelling meta description for the given content.

Rules:
- The meta description MUST be ${META_DESCRIPTION_MAX_LENGTH} characters or fewer
- Summarize the key value or topic of the content
- Use natural language that encourages clicks
- Do not use quotes around the description
- Return ONLY the meta description text, nothing else`

/**
 * Generates an SEO meta title (≤60 characters) derived from entry content.
 *
 * Satisfies Requirement 6.1: THE SEO_Generator SHALL produce a meta title
 * of 60 characters or fewer derived from the entry content.
 */
export async function generateMetaTitle(
  content: string,
  options: SeoGeneratorOptions,
): Promise<SeoResult> {
  const response = await options.provider.generateText(content, {
    systemPrompt: META_TITLE_SYSTEM_PROMPT,
    maxTokens: 100,
    temperature: 0.7,
  })

  const text = response.text.trim().slice(0, META_TITLE_MAX_LENGTH)

  return {
    text,
    usage: response.usage,
  }
}

/**
 * Generates an SEO meta description (≤160 characters) derived from entry content.
 *
 * Satisfies Requirement 6.2: THE SEO_Generator SHALL produce a meta description
 * of 160 characters or fewer derived from the entry content.
 */
export async function generateMetaDescription(
  content: string,
  options: SeoGeneratorOptions,
): Promise<SeoResult> {
  const response = await options.provider.generateText(content, {
    systemPrompt: META_DESCRIPTION_SYSTEM_PROMPT,
    maxTokens: 200,
    temperature: 0.7,
  })

  const text = response.text.trim().slice(0, META_DESCRIPTION_MAX_LENGTH)

  return {
    text,
    usage: response.usage,
  }
}
