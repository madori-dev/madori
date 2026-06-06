/**
 * HTML-to-Markdown converter for WordPress content migration.
 * Wraps TurndownService with Madori-specific rules to preserve
 * semantic structure: headings, paragraphs, lists, links, emphasis, code blocks.
 */

import TurndownService from 'turndown'

/**
 * Pre-configured TurndownService instance with Madori-specific settings
 * and WordPress-specific custom rules.
 */
function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  })

  // WordPress <figure> / <figcaption> handling
  turndown.addRule('figure', {
    filter: 'figure',
    replacement(_content, node) {
      const el = node as HTMLElement
      const img = el.querySelector('img')
      const figcaption = el.querySelector('figcaption')

      if (!img) {
        // No image inside figure — just return any text content
        const textContent = el.textContent?.trim() ?? ''
        return textContent ? `\n\n${textContent}\n\n` : ''
      }

      const src = img.getAttribute('src') ?? ''
      const alt = img.getAttribute('alt') ?? figcaption?.textContent?.trim() ?? ''
      const caption = figcaption?.textContent?.trim()

      let result = `![${alt}](${src})`
      if (caption) {
        result += `\n*${caption}*`
      }

      return `\n\n${result}\n\n`
    },
  })

  // Strip WordPress shortcodes: [shortcode attr="val"]...[/shortcode] → inner content
  // Convert [caption]...[/caption] to figure-like output
  turndown.addRule('wordpressShortcodes', {
    filter(node) {
      if (node.nodeName !== '#text' && node.nodeType !== 3) return false
      const text = node.textContent ?? ''
      return /\[[\w-]+[^\]]*\]/.test(text)
    },
    replacement(content) {
      // Strip shortcode brackets: [shortcode attr="val"] → ''
      // Preserve any text between opening and closing shortcodes
      return content
        .replace(/\[caption[^\]]*\](.*?)\[\/caption\]/gi, '$1')
        .replace(/\[\/?[\w-]+[^\]]*\]/g, '')
    },
  })

  // WordPress wp-block-* divs — just pass through content
  turndown.addRule('wpBlocks', {
    filter(node) {
      if (node.nodeName !== 'DIV') return false
      const className = (node as HTMLElement).getAttribute('class') ?? ''
      return /wp-block-/.test(className)
    },
    replacement(content) {
      return `\n\n${content.trim()}\n\n`
    },
  })

  return turndown
}

// Singleton instance — rules are stateless, safe to reuse
const turndownInstance = createTurndownService()

/**
 * Strip CDATA wrapping from content if present.
 */
function stripCdata(html: string): string {
  return html
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
}

/**
 * Convert HTML content to Markdown using Madori-specific TurndownService configuration.
 *
 * Handles edge cases:
 * - Empty/null/undefined input → returns empty string
 * - CDATA wrapping → stripped before processing
 * - WordPress shortcodes → brackets stripped, inner content preserved
 * - WordPress block classes → content passed through
 */
export function htmlToMarkdown(html: string): string {
  if (!html || html.trim() === '') {
    return ''
  }

  const cleaned = stripCdata(html)
  const markdown = turndownInstance.turndown(cleaned)

  // Collapse excessive blank lines (3+ → 2)
  return markdown.replace(/\n{3,}/g, '\n\n').trim()
}
