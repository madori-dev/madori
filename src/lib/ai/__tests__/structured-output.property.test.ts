import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { z } from 'zod'
import { OpenAiCompatibleAdapter } from '../provider/openai-compatible'
import type { AiConfig } from '../schema'

/**
 * Property 2: Structured output validates against the provided Zod schema
 * **Validates: Requirements 2.4**
 *
 * For any Zod schema and response from generateStructured, the returned data
 * SHALL validate against the schema.
 */

// Mock the openai module with a proper constructor
vi.mock('openai', () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn(),
      },
    }
  }
  return { default: MockOpenAI }
})

const baseConfig: AiConfig = {
  provider: 'openai-compatible',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: 'test-key',
  model: 'test-model',
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

function createAdapterWithMockResponse(jsonContent: string): OpenAiCompatibleAdapter {
  const adapter = new OpenAiCompatibleAdapter(baseConfig)

  // Override the internal client's create method to return our mock response
  const client = (adapter as unknown as { client: { chat: { completions: { create: ReturnType<typeof vi.fn> } } } }).client
  client.chat.completions.create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: jsonContent } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  })

  return adapter
}

describe('Property 2: Structured output validates against the provided Zod schema', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returned data validates against simple string schema', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (value) => {
        const schema = z.object({ value: z.string() })
        const adapter = createAdapterWithMockResponse(JSON.stringify({ value }))

        const result = await adapter.generateStructured('test prompt', schema)
        expect(schema.safeParse(result.data).success).toBe(true)
        expect(result.data.value).toBe(value)
      }),
      { numRuns: 100 },
    )
  })

  it('returned data validates against simple number schema', async () => {
    // Use integers to avoid JSON serialization edge cases (e.g. -0 → 0)
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        async (num) => {
          const schema = z.object({ count: z.number() })
          const adapter = createAdapterWithMockResponse(JSON.stringify({ count: num }))

          const result = await adapter.generateStructured('test prompt', schema)
          expect(schema.safeParse(result.data).success).toBe(true)
          expect(result.data.count).toBe(num)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('returned data validates against object schema with required fields', async () => {
    const dataArb = fc.record({
      name: fc.string({ minLength: 0, maxLength: 100 }),
      age: fc.integer({ min: 0, max: 150 }),
      active: fc.boolean(),
    })

    await fc.assert(
      fc.asyncProperty(dataArb, async (data) => {
        const schema = z.object({
          name: z.string(),
          age: z.number(),
          active: z.boolean(),
        })
        const adapter = createAdapterWithMockResponse(JSON.stringify(data))

        const result = await adapter.generateStructured('test prompt', schema)
        expect(schema.safeParse(result.data).success).toBe(true)
        expect(result.data.name).toBe(data.name)
        expect(result.data.age).toBe(data.age)
        expect(result.data.active).toBe(data.active)
      }),
      { numRuns: 100 },
    )
  })

  it('returned data validates against schema with optional fields and defaults', async () => {
    const dataArb = fc.record({
      title: fc.string({ minLength: 1, maxLength: 80 }),
      subtitle: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: undefined }),
    })

    await fc.assert(
      fc.asyncProperty(dataArb, async (data) => {
        const schema = z.object({
          title: z.string(),
          subtitle: z.string().optional().default('Untitled'),
        })
        // Only include subtitle in JSON if defined
        const jsonObj: Record<string, string> = { title: data.title }
        if (data.subtitle !== undefined) {
          jsonObj.subtitle = data.subtitle
        }
        const adapter = createAdapterWithMockResponse(JSON.stringify(jsonObj))

        const result = await adapter.generateStructured('test prompt', schema)
        expect(schema.safeParse(result.data).success).toBe(true)
        expect(result.data.title).toBe(data.title)
        if (data.subtitle !== undefined) {
          expect(result.data.subtitle).toBe(data.subtitle)
        } else {
          expect(result.data.subtitle).toBe('Untitled')
        }
      }),
      { numRuns: 100 },
    )
  })

  it('returned data validates against array schemas', async () => {
    const dataArb = fc.array(fc.string({ minLength: 0, maxLength: 50 }), {
      minLength: 0,
      maxLength: 10,
    })

    await fc.assert(
      fc.asyncProperty(dataArb, async (tags) => {
        const schema = z.object({ tags: z.array(z.string()) })
        const adapter = createAdapterWithMockResponse(JSON.stringify({ tags }))

        const result = await adapter.generateStructured('test prompt', schema)
        expect(schema.safeParse(result.data).success).toBe(true)
        expect(result.data.tags).toEqual(tags)
      }),
      { numRuns: 100 },
    )
  })

  it('throws ZodError when response does NOT conform to schema', async () => {
    // Generate responses with wrong types: name should be string, age should be number
    const badDataArb = fc.record({
      name: fc.integer(), // wrong: should be string
      age: fc.string({ minLength: 1 }), // wrong: should be number
    })

    await fc.assert(
      fc.asyncProperty(badDataArb, async (badData) => {
        const schema = z.object({
          name: z.string(),
          age: z.number(),
        })
        const adapter = createAdapterWithMockResponse(JSON.stringify(badData))

        await expect(
          adapter.generateStructured('test prompt', schema),
        ).rejects.toBeInstanceOf(z.ZodError)
      }),
      { numRuns: 100 },
    )
  })

  it('throws when response is missing required fields', async () => {
    // Schema expects { title: string, body: string } but response only has title
    const partialDataArb = fc.record({
      title: fc.string({ minLength: 1, maxLength: 50 }),
    })

    await fc.assert(
      fc.asyncProperty(partialDataArb, async (partialData) => {
        const schema = z.object({
          title: z.string(),
          body: z.string(),
        })
        const adapter = createAdapterWithMockResponse(JSON.stringify(partialData))

        await expect(
          adapter.generateStructured('test prompt', schema),
        ).rejects.toBeInstanceOf(z.ZodError)
      }),
      { numRuns: 50 },
    )
  })
})
