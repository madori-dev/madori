/**
 * TipTap AI Extension — provides AI-powered text operations within the editor.
 *
 * Integrates with the editor AI streaming route at `/api/ai/editor`.
 * Supports four commands:
 *   - aiGenerate(prompt)   — streams generated text at cursor position (Req 5.1)
 *   - aiRewrite(mode)      — replaces selected text with AI rewrite (Req 5.2)
 *   - aiSummarize()        — inserts summary below selected text (Req 5.3)
 *   - aiContinue()         — streams continuation at cursor (Req 5.4)
 *
 * Satisfies Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 4.5.
 */

import { Extension } from '@tiptap/react'

export type RewriteMode = 'tone-shift' | 'simplify' | 'expand' | 'shorten'

export interface AiExtensionOptions {
  /** Base endpoint for the editor AI route. Defaults to '/api/ai/editor'. */
  endpoint: string
}

/** SSE event payload shapes emitted by the /api/ai/editor route. */
interface SseChunkEvent {
  type: 'chunk'
  text: string
}

interface SseDoneEvent {
  type: 'done'
  usage: { inputTokens: number; outputTokens: number }
}

interface SseErrorEvent {
  type: 'error'
  error: string
}

type SseEvent = SseChunkEvent | SseDoneEvent | SseErrorEvent

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiExtension: {
      /**
       * Generate text from a prompt and stream it at the current cursor position.
       */
      aiGenerate: (prompt: string) => ReturnType
      /**
       * Rewrite the current selection with the given mode and replace it with the result.
       */
      aiRewrite: (mode: RewriteMode) => ReturnType
      /**
       * Summarize the current selection and insert the summary below.
       */
      aiSummarize: () => ReturnType
      /**
       * Continue writing from the current cursor position using preceding content as context.
       */
      aiContinue: () => ReturnType
    }
  }
}

/**
 * Parses an SSE stream response body and yields parsed events.
 */
async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE events are separated by double newlines
      const parts = buffer.split('\n\n')
      // Keep the last incomplete part in the buffer
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const trimmed = part.trim()
        if (!trimmed) continue

        // Each line starts with "data: "
        const dataLine = trimmed
          .split('\n')
          .find((line) => line.startsWith('data: '))

        if (!dataLine) continue

        const json = dataLine.slice(6) // Remove "data: " prefix
        try {
          const event = JSON.parse(json) as SseEvent
          yield event
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const dataLine = buffer
        .trim()
        .split('\n')
        .find((line) => line.startsWith('data: '))

      if (dataLine) {
        try {
          const event = JSON.parse(dataLine.slice(6)) as SseEvent
          yield event
        } catch {
          // Skip malformed trailing data
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Sends a request to the editor AI endpoint and processes the SSE stream,
 * inserting text progressively into the editor.
 */
async function streamToEditor(
  editor: { chain: () => any; state: { selection: { from: number; to: number } } },
  endpoint: string,
  body: Record<string, unknown>,
  insertPosition: number,
  options?: { replaceFrom?: number; replaceTo?: number },
): Promise<void> {
  let response: Response

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('[AI Extension] Network error:', err)
    return
  }

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[AI Extension] API error:', response.status, errorBody)
    return
  }

  if (!response.body) {
    console.error('[AI Extension] No response body')
    return
  }

  // If we're replacing a selection, delete it first
  if (options?.replaceFrom !== undefined && options?.replaceTo !== undefined) {
    editor.chain()
      .deleteRange({ from: options.replaceFrom, to: options.replaceTo })
      .run()
    // After deletion, insertion point is at the start of the deleted range
    insertPosition = options.replaceFrom
  }

  let currentPos = insertPosition

  for await (const event of parseSseStream(response.body)) {
    switch (event.type) {
      case 'chunk': {
        if (event.text) {
          editor.chain()
            .insertContentAt(currentPos, event.text)
            .run()
          currentPos += event.text.length
        }
        break
      }
      case 'done': {
        // Stream complete — usage metadata available if needed
        break
      }
      case 'error': {
        console.error('[AI Extension] Stream error:', event.error)
        break
      }
    }
  }
}

/**
 * Handles a non-streaming JSON response (e.g. summarize) by inserting
 * the result below the selection.
 */
async function insertBelowSelection(
  editor: { chain: () => any; state: { selection: { from: number; to: number }; doc: any } },
  endpoint: string,
  body: Record<string, unknown>,
  insertAfterPos: number,
): Promise<void> {
  let response: Response

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('[AI Extension] Network error:', err)
    return
  }

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[AI Extension] API error:', response.status, errorBody)
    return
  }

  const data = await response.json()

  if (data.summary) {
    // Insert a new paragraph with the summary below the selection
    editor.chain()
      .insertContentAt(insertAfterPos, [
        { type: 'paragraph', content: [{ type: 'text', text: data.summary }] },
      ])
      .run()
  }
}

/**
 * Extracts plain text content from the editor's document up to a given position.
 */
function getTextBefore(doc: any, pos: number): string {
  return doc.textBetween(0, pos, '\n', '\n')
}

/**
 * Extracts plain text of the current selection.
 */
function getSelectedText(doc: any, from: number, to: number): string {
  return doc.textBetween(from, to, '\n', '\n')
}

/**
 * Resolves the position at the end of the block containing `pos`.
 */
function getEndOfBlock(doc: any, pos: number): number {
  const resolved = doc.resolve(pos)
  const parentEnd = resolved.end(resolved.depth)
  return parentEnd
}

export const AiExtension = Extension.create<AiExtensionOptions>({
  name: 'aiExtension',

  addOptions() {
    return {
      endpoint: '/api/ai/editor',
    }
  },

  addCommands() {
    return {
      aiGenerate:
        (prompt: string) =>
        ({ editor }) => {
          const { from } = editor.state.selection

          streamToEditor(
            editor,
            this.options.endpoint,
            { action: 'generate', prompt },
            from,
          )

          // Return true to indicate the command was handled
          return true
        },

      aiRewrite:
        (mode: RewriteMode) =>
        ({ editor }) => {
          const { from, to } = editor.state.selection
          if (from === to) {
            // No selection — nothing to rewrite
            console.warn('[AI Extension] aiRewrite requires a text selection')
            return false
          }

          const selectedText = getSelectedText(editor.state.doc, from, to)

          streamToEditor(
            editor,
            this.options.endpoint,
            { action: 'rewrite', text: selectedText, mode },
            from,
            { replaceFrom: from, replaceTo: to },
          )

          return true
        },

      aiSummarize:
        () =>
        ({ editor }) => {
          const { from, to } = editor.state.selection
          if (from === to) {
            console.warn('[AI Extension] aiSummarize requires a text selection')
            return false
          }

          const selectedText = getSelectedText(editor.state.doc, from, to)
          // Insert summary after the end of the block containing the selection
          const insertPos = getEndOfBlock(editor.state.doc, to)

          insertBelowSelection(
            editor,
            this.options.endpoint,
            { action: 'summarize', text: selectedText },
            insertPos,
          )

          return true
        },

      aiContinue:
        () =>
        ({ editor }) => {
          const { from } = editor.state.selection
          const precedingContent = getTextBefore(editor.state.doc, from)

          if (!precedingContent.trim()) {
            console.warn('[AI Extension] aiContinue requires preceding content')
            return false
          }

          streamToEditor(
            editor,
            this.options.endpoint,
            { action: 'continue', precedingContent },
            from,
          )

          return true
        },
    }
  },
})
