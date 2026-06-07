import type { ProviderAdapter, TokenUsage } from '../provider/interface'

/**
 * Options for generating alt text from an image.
 */
export interface AltTextOptions {
  provider: ProviderAdapter
}

/**
 * Result of alt text generation.
 */
export interface AltTextResult {
  altText: string
  usage: TokenUsage
}

const ALT_TEXT_PROMPT = [
  'Describe this image in a single, concise sentence suitable for use as HTML alt text.',
  'The description must be objective and factual.',
  'Keep the description under 125 characters for optimal accessibility.',
  'Do not start with "Image of" or "Picture of".',
  'Output only the alt text with no additional commentary.',
].join(' ')

/**
 * Generates descriptive alt text for an image using the configured provider's
 * vision capabilities.
 *
 * Satisfies Requirements 7.1, 7.2:
 * - Sends image to the provider vision API
 * - Returns a concise, descriptive alt text string
 *
 * @throws {Error} If the provider does not support vision capabilities
 */
export async function generateAltText(
  image: Buffer,
  options: AltTextOptions,
): Promise<AltTextResult> {
  const { provider } = options

  try {
    const response = await provider.generateWithVision(image, ALT_TEXT_PROMPT, {
      maxTokens: 100,
      temperature: 0.3,
    })

    return {
      altText: response.text.trim(),
      usage: response.usage,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)

    if (
      message.toLowerCase().includes('vision') ||
      message.toLowerCase().includes('image') ||
      message.toLowerCase().includes('not supported')
    ) {
      throw new Error(
        `Vision is not supported by the current provider configuration. ${message}`,
      )
    }

    throw new Error(`Failed to generate alt text: ${message}`)
  }
}
