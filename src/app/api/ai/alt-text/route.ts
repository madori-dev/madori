import { NextRequest, NextResponse } from 'next/server'
import { isFeatureEnabled } from '@/lib/ai/middleware'
import { getAiConfig } from '@/lib/ai/schema'
import { createProviderAdapter } from '@/lib/ai/provider/factory'
import { generateAltText } from '@/lib/ai/features/alt-text'
import { FileTokenTracker } from '@/lib/ai/usage/file-tracker'

/**
 * POST /api/ai/alt-text
 *
 * Generates alt text for an image using the configured provider's vision capabilities.
 *
 * Accepts either:
 * - multipart/form-data with an `image` field (file upload)
 * - JSON with `{ imagePath: string }` (path to an existing asset)
 *
 * Returns: `{ altText: string, usage: { inputTokens, outputTokens } }`
 *
 * Satisfies Requirements 7.1, 7.2, 7.4, 13.2.
 */
export async function POST(request: NextRequest) {
  // Check feature flag (Req 13.2)
  if (!isFeatureEnabled('altText')) {
    return NextResponse.json({ error: 'Feature disabled' }, { status: 404 })
  }

  // Load AI config
  const aiConfig = await getAiConfig()
  if (!aiConfig) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 404 })
  }

  // Check spend limit before proceeding
  const tracker = new FileTokenTracker()
  const limitCheck = await tracker.checkLimit()
  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error: 'Spend limit reached',
        currentTotal: limitCheck.currentTotal,
        limit: limitCheck.limit,
      },
      { status: 429 },
    )
  }

  // Parse image from request
  let imageBuffer: Buffer

  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    // Handle file upload via multipart/form-data
    const formData = await request.formData()
    const file = formData.get('image')

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'Validation failed', fields: { image: 'Image file is required' } },
        { status: 400 },
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    imageBuffer = Buffer.from(arrayBuffer)
  } else if (contentType.includes('application/json')) {
    // Handle JSON with imagePath
    const body = await request.json()

    if (!body.imagePath || typeof body.imagePath !== 'string') {
      return NextResponse.json(
        { error: 'Validation failed', fields: { imagePath: 'imagePath string is required' } },
        { status: 400 },
      )
    }

    // Read the image from the filesystem
    const { readFile } = await import('node:fs/promises')
    const path = await import('node:path')
    const resolvedPath = path.resolve(process.cwd(), body.imagePath)

    try {
      imageBuffer = await readFile(resolvedPath)
    } catch {
      return NextResponse.json(
        { error: 'Validation failed', fields: { imagePath: 'Image file not found at specified path' } },
        { status: 400 },
      )
    }
  } else {
    return NextResponse.json(
      { error: 'Validation failed', fields: { contentType: 'Expected multipart/form-data or application/json' } },
      { status: 400 },
    )
  }

  // Create provider adapter and generate alt text
  const provider = createProviderAdapter(aiConfig)

  try {
    const result = await generateAltText(imageBuffer, { provider })

    // Record usage
    await tracker.record({
      operation: 'alt-text',
      model: aiConfig.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    })

    return NextResponse.json({
      altText: result.altText,
      usage: result.usage,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // Check if this is a vision-unsupported error (Req 7.4)
    if (
      message.toLowerCase().includes('vision') ||
      message.toLowerCase().includes('not supported')
    ) {
      return NextResponse.json(
        { error: 'Vision not supported by current provider' },
        { status: 422 },
      )
    }

    // Generic provider error
    return NextResponse.json(
      { error: `Failed to generate alt text: ${message}` },
      { status: 502 },
    )
  }
}
