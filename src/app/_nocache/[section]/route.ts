/**
 * NoCache API endpoint.
 *
 * Renders registered dynamic section components and returns their HTML.
 * Sections register themselves via the exported `sectionRegistry` map,
 * keyed by a unique section identifier string.
 */

/** A section renderer returns an HTML string for the given section. */
export type SectionRenderer = () => Promise<string> | string

/**
 * Registry of dynamic section renderers.
 * Other parts of the app register sections by adding entries to this map:
 *
 * ```ts
 * import { sectionRegistry } from '@/app/_nocache/[section]/route'
 * sectionRegistry.set('my-section', async () => '<p>dynamic content</p>')
 * ```
 */
export const sectionRegistry = new Map<string, SectionRenderer>()

interface RouteParams {
  params: Promise<{ section: string }>
}

export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<Response> {
  const { section } = await params

  const renderer = sectionRegistry.get(section)

  if (!renderer) {
    return new Response('Section not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  try {
    const html = await renderer()
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    console.error(`[madori:nocache] Failed to render section "${section}":`, error)
    return new Response('Internal server error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}
