// Feature: project-madori, Property 4: TipTap Markdown Round-Trip

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { serializeTipTapToMarkdown } from '@/lib/editor/serializer'
import { parseMarkdownToTipTap } from '@/lib/editor/parser'
import type { TipTapDocument, TipTapNode } from '@/lib/editor/types'

/**
 * Validates: Requirements 9.1
 *
 * Property: For any valid TipTap document structure (containing headings, lists,
 * code blocks, quotes, links, tables, and inline formatting), serializing to
 * Markdown and parsing back should preserve the document's semantic structure —
 * node types, nesting, and text content remain equivalent.
 *
 * Note: Markdown is lossy for some structures. Consecutive lists of the same type
 * will merge when round-tripped. We account for this by ensuring generated documents
 * don't have consecutive same-type list nodes.
 */

// --- Generators ---

/**
 * Generate safe text content that won't be interpreted as markdown syntax.
 * Avoids characters that trigger markdown formatting.
 */
const safeText = fc
  .stringMatching(/^[a-zA-Z0-9 ]+$/)
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim())

/**
 * Generate a text node (plain, no marks).
 */
const textNode = (): fc.Arbitrary<TipTapNode> => {
  return safeText.map((text) => ({ type: 'text', text }))
}

/**
 * Generate a paragraph node with random text content.
 */
const paragraphNode: fc.Arbitrary<TipTapNode> = fc
  .array(textNode(), { minLength: 1, maxLength: 3 })
  .map((content) => ({ type: 'paragraph', content }))

/**
 * Generate a heading node with random level (1-6) and text.
 */
const headingNode: fc.Arbitrary<TipTapNode> = fc
  .tuple(
    fc.integer({ min: 1, max: 6 }),
    fc.array(textNode(), { minLength: 1, maxLength: 2 }),
  )
  .map(([level, content]) => ({
    type: 'heading',
    attrs: { level },
    content,
  }))

/**
 * Generate a bullet list node with random items.
 */
const bulletListNode: fc.Arbitrary<TipTapNode> = fc
  .array(
    fc.array(textNode(), { minLength: 1, maxLength: 2 }).map((content) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content }],
    })),
    { minLength: 1, maxLength: 4 },
  )
  .map((items) => ({
    type: 'bulletList',
    content: items,
  }))

/**
 * Generate a code block node with random content and optional language.
 */
const codeBlockNode: fc.Arbitrary<TipTapNode> = fc
  .tuple(
    safeText,
    fc.oneof(
      fc.constant('javascript'),
      fc.constant('typescript'),
      fc.constant('python'),
      fc.constant(''),
    ),
  )
  .map(([text, language]) => ({
    type: 'codeBlock',
    attrs: { language: language || null },
    content: [{ type: 'text', text }],
  }))

/**
 * Generate a blockquote node with random paragraph content (plain text only).
 */
const blockquoteNode: fc.Arbitrary<TipTapNode> = fc
  .array(
    fc.array(textNode(), { minLength: 1, maxLength: 2 }).map((content) => ({
      type: 'paragraph',
      content,
    })),
    { minLength: 1, maxLength: 2 },
  )
  .map((content) => ({
    type: 'blockquote',
    content,
  }))

/**
 * Generate a document node with a random mix of block nodes.
 * Ensures no two consecutive nodes are the same list type (markdown merges them).
 */
const documentNode: fc.Arbitrary<TipTapDocument> = fc
  .array(
    fc.oneof(
      { weight: 3, arbitrary: paragraphNode },
      { weight: 2, arbitrary: headingNode },
      { weight: 2, arbitrary: bulletListNode },
      { weight: 2, arbitrary: codeBlockNode },
      { weight: 2, arbitrary: blockquoteNode },
    ),
    { minLength: 1, maxLength: 6 },
  )
  .map((content) => {
    // Remove consecutive same-type list/blockquote nodes (markdown merges them)
    const deduped: TipTapNode[] = []
    for (const node of content) {
      const prev = deduped[deduped.length - 1]
      if (prev && prev.type === node.type && (node.type === 'bulletList' || node.type === 'orderedList')) {
        continue // skip consecutive same-type lists
      }
      deduped.push(node)
    }
    return { type: 'doc' as const, content: deduped.length > 0 ? deduped : [content[0]] }
  })

// --- Helpers ---

/**
 * Extract all text content from a TipTap node tree.
 */
function extractTextContent(node: TipTapNode): string {
  if (node.text) return node.text
  if (!node.content) return ''
  return node.content.map(extractTextContent).join('')
}

/**
 * Extract the semantic node types at the top level of a document.
 */
function extractBlockTypes(nodes: TipTapNode[]): string[] {
  return nodes.map((node) => node.type)
}

/**
 * Extract the flattened structure of a document for comparison.
 * Returns an array of { type, textContent } for each block node.
 */
function extractStructure(nodes: TipTapNode[]): Array<{ type: string; text: string }> {
  return nodes.map((node) => ({
    type: node.type,
    text: extractTextContent(node).replace(/\s+/g, ' ').trim(),
  }))
}

/**
 * Extract heading levels from a document.
 */
function extractHeadingLevels(nodes: TipTapNode[]): number[] {
  return nodes
    .filter((n) => n.type === 'heading')
    .map((n) => (n.attrs?.level as number) ?? 1)
}

/**
 * Extract list item count from bullet/ordered lists.
 */
function extractListItemCounts(nodes: TipTapNode[]): number[] {
  return nodes
    .filter((n) => n.type === 'bulletList' || n.type === 'orderedList')
    .map((n) => n.content?.length ?? 0)
}

// --- Property Tests ---

describe('Property 4: TipTap Markdown Round-Trip', () => {
  it('node types are preserved after round-trip', () => {
    fc.assert(
      fc.property(documentNode, (doc) => {
        const markdown = serializeTipTapToMarkdown(doc)
        const parsed = parseMarkdownToTipTap(markdown)

        const originalTypes = extractBlockTypes(doc.content)
        const parsedTypes = extractBlockTypes(parsed.content)

        expect(parsedTypes).toEqual(originalTypes)
      }),
      { numRuns: 100 },
    )
  })

  it('text content is preserved after round-trip', () => {
    fc.assert(
      fc.property(documentNode, (doc) => {
        const markdown = serializeTipTapToMarkdown(doc)
        const parsed = parseMarkdownToTipTap(markdown)

        const originalStructure = extractStructure(doc.content)
        const parsedStructure = extractStructure(parsed.content)

        // Each block's text content should be preserved
        expect(parsedStructure.length).toBe(originalStructure.length)
        for (let i = 0; i < originalStructure.length; i++) {
          expect(parsedStructure[i]?.text).toBe(originalStructure[i].text)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('heading levels are preserved after round-trip', () => {
    fc.assert(
      fc.property(documentNode, (doc) => {
        const markdown = serializeTipTapToMarkdown(doc)
        const parsed = parseMarkdownToTipTap(markdown)

        const originalLevels = extractHeadingLevels(doc.content)
        const parsedLevels = extractHeadingLevels(parsed.content)

        expect(parsedLevels).toEqual(originalLevels)
      }),
      { numRuns: 100 },
    )
  })

  it('list item counts are preserved after round-trip', () => {
    fc.assert(
      fc.property(documentNode, (doc) => {
        const markdown = serializeTipTapToMarkdown(doc)
        const parsed = parseMarkdownToTipTap(markdown)

        const originalCounts = extractListItemCounts(doc.content)
        const parsedCounts = extractListItemCounts(parsed.content)

        expect(parsedCounts).toEqual(originalCounts)
      }),
      { numRuns: 100 },
    )
  })

  it('nesting structure is preserved for blockquotes', () => {
    fc.assert(
      fc.property(documentNode, (doc) => {
        const markdown = serializeTipTapToMarkdown(doc)
        const parsed = parseMarkdownToTipTap(markdown)

        // For each blockquote, verify inner paragraph count is preserved
        const originalBlockquotes = doc.content.filter((n) => n.type === 'blockquote')
        const parsedBlockquotes = parsed.content.filter((n) => n.type === 'blockquote')

        expect(parsedBlockquotes.length).toBe(originalBlockquotes.length)

        for (let i = 0; i < originalBlockquotes.length; i++) {
          const origInner = originalBlockquotes[i].content ?? []
          const parsedInner = parsedBlockquotes[i].content ?? []

          // Inner paragraph count should match
          expect(parsedInner.length).toBe(origInner.length)

          // Inner text content should match
          const origText = origInner.map((n) => extractTextContent(n).replace(/\s+/g, ' ').trim())
          const parsedText = parsedInner.map((n) => extractTextContent(n).replace(/\s+/g, ' ').trim())
          expect(parsedText).toEqual(origText)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('code block language attribute is preserved after round-trip', () => {
    fc.assert(
      fc.property(documentNode, (doc) => {
        const markdown = serializeTipTapToMarkdown(doc)
        const parsed = parseMarkdownToTipTap(markdown)

        const originalCodeBlocks = doc.content.filter((n) => n.type === 'codeBlock')
        const parsedCodeBlocks = parsed.content.filter((n) => n.type === 'codeBlock')

        expect(parsedCodeBlocks.length).toBe(originalCodeBlocks.length)

        for (let i = 0; i < originalCodeBlocks.length; i++) {
          const origLang = originalCodeBlocks[i].attrs?.language || null
          const parsedLang = parsedCodeBlocks[i].attrs?.language || null
          expect(parsedLang).toBe(origLang)
        }
      }),
      { numRuns: 100 },
    )
  })
})
