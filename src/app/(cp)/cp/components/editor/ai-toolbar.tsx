'use client'

import { useState, useCallback, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import {
  SparklesIcon,
  PenLineIcon,
  ListIcon,
  ArrowRightIcon,
  Loader2Icon,
  WandSparklesIcon,
  ShrinkIcon,
  ExpandIcon,
  SmilePlusIcon,
} from 'lucide-react'
import type { RewriteMode } from './extensions/ai-extension'

interface AiToolbarProps {
  editor: Editor
}

/**
 * Editor AI Toolbar — provides contextual AI actions via a floating bubble menu
 * when text is selected, plus a generate prompt popover and continue button.
 *
 * Uses commands from the AiExtension:
 *   - editor.commands.aiGenerate(prompt)
 *   - editor.commands.aiRewrite(mode)
 *   - editor.commands.aiSummarize()
 *   - editor.commands.aiContinue()
 *
 * Satisfies Requirement 5.5.
 */
export function AiToolbar({ editor }: AiToolbarProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [promptValue, setPromptValue] = useState('')

  // Track loading state by listening to SSE responses
  // The extension streams text progressively, so we show loading briefly
  useEffect(() => {
    if (!editor) return

    let timeout: ReturnType<typeof setTimeout>

    const onTransaction = () => {
      // If loading, auto-clear after content is inserted (debounce)
      if (isLoading) {
        clearTimeout(timeout)
        timeout = setTimeout(() => setIsLoading(false), 1500)
      }
    }

    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
      clearTimeout(timeout)
    }
  }, [editor, isLoading])

  const handleGenerate = useCallback(() => {
    if (!promptValue.trim()) return
    setIsLoading(true)
    editor.commands.aiGenerate(promptValue.trim())
    setPromptValue('')
    setGenerateOpen(false)
  }, [editor, promptValue])

  const handleRewrite = useCallback(
    (mode: RewriteMode) => {
      setIsLoading(true)
      editor.commands.aiRewrite(mode)
    },
    [editor],
  )

  const handleSummarize = useCallback(() => {
    setIsLoading(true)
    editor.commands.aiSummarize()
  }, [editor])

  const handleContinue = useCallback(() => {
    setIsLoading(true)
    editor.commands.aiContinue()
  }, [editor])

  return (
    <>
      {/* Floating bubble menu — appears when text is selected */}
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md"
        options={{
          placement: 'top',
          offset: 8,
        }}
      >
        {isLoading ? (
          <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" />
            <span>AI generating…</span>
          </div>
        ) : (
          <>
            {/* Rewrite dropdown with mode submenu */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="xs" className="gap-1" />}
              >
                <PenLineIcon className="size-3.5" />
                Rewrite
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" sideOffset={8}>
                <DropdownMenuLabel>Rewrite mode</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleRewrite('tone-shift')}>
                  <SmilePlusIcon className="size-3.5" />
                  Tone shift
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleRewrite('simplify')}>
                  <ShrinkIcon className="size-3.5" />
                  Simplify
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleRewrite('expand')}>
                  <ExpandIcon className="size-3.5" />
                  Expand
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleRewrite('shorten')}>
                  <ListIcon className="size-3.5" />
                  Shorten
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Summarize button */}
            <Button
              variant="ghost"
              size="xs"
              className="gap-1"
              onClick={handleSummarize}
            >
              <ListIcon className="size-3.5" />
              Summarize
            </Button>
          </>
        )}
      </BubbleMenu>

      {/* Generate prompt popover — accessible from toolbar area */}
      <div className="flex items-center gap-1">
        <Popover open={generateOpen} onOpenChange={setGenerateOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="xs"
                className="gap-1 text-muted-foreground"
                disabled={isLoading}
              />
            }
          >
            <WandSparklesIcon className="size-3.5" />
            Generate
          </PopoverTrigger>
          <PopoverContent
            side="top"
            sideOffset={8}
            align="start"
            className="w-80"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleGenerate()
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={promptValue}
                onChange={(e) => setPromptValue((e.target as HTMLInputElement).value)}
                placeholder="Describe what to generate…"
                className="flex-1 text-sm"
                autoFocus
              />
              <Button
                type="submit"
                size="xs"
                disabled={!promptValue.trim() || isLoading}
              >
                {isLoading ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <ArrowRightIcon className="size-3.5" />
                )}
              </Button>
            </form>
          </PopoverContent>
        </Popover>

        {/* Continue button */}
        <Button
          variant="ghost"
          size="xs"
          className="gap-1 text-muted-foreground"
          onClick={handleContinue}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <SparklesIcon className="size-3.5" />
          )}
          Continue
        </Button>
      </div>
    </>
  )
}
