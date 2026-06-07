import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import type { TokenUsage } from '../provider/interface'

/**
 * Property 3: Every provider response includes non-negative token count metadata
 * **Validates: Requirements 2.7**
 *
 * For any call to any provider method, the response SHALL include
 * inputTokens >= 0 and outputTokens >= 0.
 */

// Mock the OpenAI SDK
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn(),
        },
      }
      constructor() {}
    },
  }
})

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn(),
        stream: vi.fn(),
      }
      constructor() {}
    },
  }
})

describe('Property 3: Token count metadata non-negativity', () => {
  const baseConfig = {
    provider: 'openai-compatible' as const,
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'test-key',
    model: 'gpt-4',
    features: {
      editor: true,
      seo: true,
      altText: true,
      blueprints: true,
      autoFill: true,
      taxonomy: true,
      bulk: true,
    },
  }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('OpenAI adapter extracts non-negative inputTokens and outputTokens for any non-negative token pair', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 1_000_000 }),
        fc.nat({ max: 1_000_000 }),
        async (promptTokens, completionTokens) => {
          vi.resetModules()
          vi.clearAllMocks()

          // Re-mock with the specific token values
          vi.doMock('openai', () => ({
            default: class {
              chat = {
                completions: {
                  create: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: 'test response' } }],
                    usage: {
                      prompt_tokens: promptTokens,
                      completion_tokens: completionTokens,
                      total_tokens: promptTokens + completionTokens,
                    },
                  }),
                },
              }
              constructor() {}
            },
          }))

          const { OpenAiCompatibleAdapter } = await import('../provider/openai-compatible')
          const adapter = new OpenAiCompatibleAdapter(baseConfig)
          const result = await adapter.generateText('test prompt')

          expect(result.usage.inputTokens).toBeGreaterThanOrEqual(0)
          expect(result.usage.outputTokens).toBeGreaterThanOrEqual(0)
          expect(Number.isInteger(result.usage.inputTokens)).toBe(true)
          expect(Number.isInteger(result.usage.outputTokens)).toBe(true)
          expect(result.usage.inputTokens).toBe(promptTokens)
          expect(result.usage.outputTokens).toBe(completionTokens)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Anthropic adapter extracts non-negative inputTokens and outputTokens for any non-negative token pair', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 1_000_000 }),
        fc.nat({ max: 1_000_000 }),
        async (inputTokens, outputTokens) => {
          vi.resetModules()
          vi.clearAllMocks()

          vi.doMock('@anthropic-ai/sdk', () => ({
            default: class {
              messages = {
                create: vi.fn().mockResolvedValue({
                  content: [{ type: 'text', text: 'test response' }],
                  usage: {
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                  },
                }),
                stream: vi.fn(),
              }
              constructor() {}
            },
          }))

          const { AnthropicAdapter } = await import('../provider/anthropic')
          const adapter = new AnthropicAdapter({
            ...baseConfig,
            provider: 'anthropic',
          })
          const result = await adapter.generateText('test prompt')

          expect(result.usage.inputTokens).toBeGreaterThanOrEqual(0)
          expect(result.usage.outputTokens).toBeGreaterThanOrEqual(0)
          expect(Number.isInteger(result.usage.inputTokens)).toBe(true)
          expect(Number.isInteger(result.usage.outputTokens)).toBe(true)
          expect(result.usage.inputTokens).toBe(inputTokens)
          expect(result.usage.outputTokens).toBe(outputTokens)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('OpenAI adapter defaults to { inputTokens: 0, outputTokens: 0 } when usage is null/undefined', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(null, undefined),
        async (usageValue) => {
          vi.resetModules()
          vi.clearAllMocks()

          vi.doMock('openai', () => ({
            default: class {
              chat = {
                completions: {
                  create: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: 'test response' } }],
                    usage: usageValue,
                  }),
                },
              }
              constructor() {}
            },
          }))

          const { OpenAiCompatibleAdapter } = await import('../provider/openai-compatible')
          const adapter = new OpenAiCompatibleAdapter(baseConfig)
          const result = await adapter.generateText('test prompt')

          expect(result.usage.inputTokens).toBe(0)
          expect(result.usage.outputTokens).toBe(0)
          expect(Number.isInteger(result.usage.inputTokens)).toBe(true)
          expect(Number.isInteger(result.usage.outputTokens)).toBe(true)
        },
      ),
      { numRuns: 10 },
    )
  })

  it('token values are always integers (no floating point) for both adapters', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 1_000_000 }),
        fc.nat({ max: 1_000_000 }),
        fc.constantFrom('openai', 'anthropic'),
        async (tokens1, tokens2, provider) => {
          vi.resetModules()
          vi.clearAllMocks()

          if (provider === 'openai') {
            vi.doMock('openai', () => ({
              default: class {
                chat = {
                  completions: {
                    create: vi.fn().mockResolvedValue({
                      choices: [{ message: { content: 'test' } }],
                      usage: {
                        prompt_tokens: tokens1,
                        completion_tokens: tokens2,
                        total_tokens: tokens1 + tokens2,
                      },
                    }),
                  },
                }
                constructor() {}
              },
            }))

            const { OpenAiCompatibleAdapter } = await import('../provider/openai-compatible')
            const adapter = new OpenAiCompatibleAdapter(baseConfig)
            const result = await adapter.generateText('test')

            expect(result.usage.inputTokens % 1).toBe(0)
            expect(result.usage.outputTokens % 1).toBe(0)
          } else {
            vi.doMock('@anthropic-ai/sdk', () => ({
              default: class {
                messages = {
                  create: vi.fn().mockResolvedValue({
                    content: [{ type: 'text', text: 'test' }],
                    usage: {
                      input_tokens: tokens1,
                      output_tokens: tokens2,
                    },
                  }),
                  stream: vi.fn(),
                }
                constructor() {}
              },
            }))

            const { AnthropicAdapter } = await import('../provider/anthropic')
            const adapter = new AnthropicAdapter({
              ...baseConfig,
              provider: 'anthropic',
            })
            const result = await adapter.generateText('test')

            expect(result.usage.inputTokens % 1).toBe(0)
            expect(result.usage.outputTokens % 1).toBe(0)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
