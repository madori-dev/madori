'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { FieldRenderer } from './FieldRenderer'

import type { FieldConfig, FieldDefinition } from '@/lib/blueprints/types'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

interface Block {
  _type: string
  _id?: string
  [key: string]: unknown
}

interface FieldsetData {
  handle: string
  fields: FieldDefinition[]
}

/** Generate a stable unique ID for a block */
function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Ensure all blocks have stable _id fields */
function ensureBlockIds(blocks: Block[]): Block[] {
  let changed = false
  const result = blocks.map((block) => {
    if (!block._id) {
      changed = true
      return { ...block, _id: generateBlockId() }
    }
    return block
  })
  return changed ? result : blocks
}

export function ReplicatorField({ value, onChange, field, error }: FieldComponentProps) {
  const [fieldsets, setFieldsets] = useState<FieldsetData[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)

  const rawBlocks: Block[] = Array.isArray(value) ? value : []
  const configuredSets = (field.options?.sets as string[]) ?? []

  // Ensure all blocks have stable IDs for dnd-kit
  const blocksRef = useRef<Block[]>(rawBlocks)
  const blocks = useMemo(() => {
    const withIds = ensureBlockIds(rawBlocks)
    if (withIds !== rawBlocks) {
      // Defer the onChange to avoid render-during-render
      blocksRef.current = withIds
    }
    return withIds
  }, [rawBlocks])

  // Sync IDs back to parent if they were missing
  useEffect(() => {
    if (blocksRef.current !== rawBlocks && blocksRef.current.length > 0) {
      onChange(blocksRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const blockIds = useMemo(() => blocks.map((b) => b._id!), [blocks])

  // dnd-kit sensors with activation constraints to avoid accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    async function loadFieldsets() {
      if (configuredSets.length === 0) {
        setLoading(false)
        return
      }

      try {
        const results: FieldsetData[] = []
        for (const handle of configuredSets) {
          const res = await fetch(`/api/fieldsets/${handle}`)
          if (res.ok) {
            const json = await res.json()
            const fields = (json.data?.fields ?? []).filter(
              (f: { field?: unknown }) => f.field
            )
            results.push({ handle, fields })
          }
        }
        setFieldsets(results)
      } catch {
        // Fieldsets failed to load — fallback to raw mode
      } finally {
        setLoading(false)
      }
    }
    loadFieldsets()
  }, [configuredSets.join(',')])

  function addBlock(type: string) {
    const newBlock: Block = { _type: type, _id: generateBlockId() }
    const fs = fieldsets.find((f) => f.handle === type)
    if (fs) {
      for (const fieldDef of fs.fields) {
        if (fieldDef.field.default !== undefined) {
          newBlock[fieldDef.handle] = fieldDef.field.default
        }
      }
    }
    const updated = [...blocks, newBlock]
    onChange(updated)
    setExpandedBlocks((prev) => new Set([...prev, updated.length - 1]))
  }

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index))
    setExpandedBlocks((prev) => {
      const next = new Set<number>()
      for (const i of prev) {
        if (i < index) next.add(i)
        else if (i > index) next.add(i - 1)
      }
      return next
    })
  }

  function updateBlock(index: number, fieldHandle: string, fieldValue: unknown) {
    const updated = blocks.map((block, i) =>
      i === index ? { ...block, [fieldHandle]: fieldValue } : block
    )
    onChange(updated)
  }

  function moveBlock(from: number, to: number) {
    const updated = arrayMove(blocks, from, to)
    onChange(updated)
    setExpandedBlocks((prev) => {
      const next = new Set<number>()
      for (const i of prev) {
        if (i === from) next.add(to)
        else if (from < to && i > from && i <= to) next.add(i - 1)
        else if (from > to && i >= to && i < from) next.add(i + 1)
        else next.add(i)
      }
      return next
    })
  }

  function toggleExpanded(index: number) {
    setExpandedBlocks((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)

      if (over && active.id !== over.id) {
        const oldIndex = blockIds.indexOf(active.id as string)
        const newIndex = blockIds.indexOf(over.id as string)
        if (oldIndex !== -1 && newIndex !== -1) {
          moveBlock(oldIndex, newIndex)
        }
      }
    },
    [blockIds, blocks] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const activeBlock = activeId ? blocks.find((b) => b._id === activeId) : undefined
  const activeBlockFs = activeBlock
    ? fieldsets.find((f) => f.handle === activeBlock._type)
    : undefined

  // No sets configured
  if (configuredSets.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        {field.display && (
          <label className="text-sm font-medium text-foreground">
            {field.display}
            {field.required && <span className="text-destructive ml-0.5">*</span>}
          </label>
        )}
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No fieldsets configured for this replicator.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Edit the blueprint to assign fieldsets as block types.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-1">
        {field.display && (
          <label className="text-sm font-medium text-foreground">{field.display}</label>
        )}
        <div className="h-20 rounded-lg bg-muted animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {field.display && (
        <label className="text-sm font-medium text-foreground">
          {field.display}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}

      {/* Block list with drag-and-drop */}
      {blocks.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2" role="list" aria-label="Replicator blocks">
              {blocks.map((block, index) => (
                <SortableBlock
                  key={block._id}
                  block={block}
                  index={index}
                  totalBlocks={blocks.length}
                  isExpanded={expandedBlocks.has(index)}
                  fieldsets={fieldsets}
                  isDragOverlay={false}
                  onToggleExpanded={() => toggleExpanded(index)}
                  onUpdateBlock={(fieldHandle, fieldValue) =>
                    updateBlock(index, fieldHandle, fieldValue)
                  }
                  onRemoveBlock={() => removeBlock(index)}
                  onMoveUp={index > 0 ? () => moveBlock(index, index - 1) : undefined}
                  onMoveDown={
                    index < blocks.length - 1 ? () => moveBlock(index, index + 1) : undefined
                  }
                />
              ))}
            </div>
          </SortableContext>

          {/* Drag overlay for smooth visual feedback */}
          <DragOverlay dropAnimation={{
            duration: 200,
            easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
          }}>
            {activeBlock ? (
              <SortableBlockOverlay block={activeBlock} fieldset={activeBlockFs} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Add block buttons */}
      <div className="flex flex-wrap gap-2">
        {fieldsets.map((fs) => (
          <Button
            key={fs.handle}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addBlock(fs.handle)}
          >
            <Plus className="size-3.5" />
            {fs.handle}
          </Button>
        ))}
      </div>

      {/* Errors */}
      {error && error.length > 0 && (
        <div className="text-xs text-destructive">
          {error.map((msg, i) => (
            <p key={i}>{msg}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sortable Block Component ────────────────────────────────────────────────

interface SortableBlockProps {
  block: Block
  index: number
  totalBlocks: number
  isExpanded: boolean
  fieldsets: FieldsetData[]
  isDragOverlay: boolean
  onToggleExpanded: () => void
  onUpdateBlock: (fieldHandle: string, fieldValue: unknown) => void
  onRemoveBlock: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}

function SortableBlock({
  block,
  index,
  totalBlocks,
  isExpanded,
  fieldsets,
  onToggleExpanded,
  onUpdateBlock,
  onRemoveBlock,
  onMoveUp,
  onMoveDown,
}: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block._id! })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const fs = fieldsets.find((f) => f.handle === block._type)

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`p-0 overflow-hidden transition-shadow duration-200 ${
        isDragging
          ? 'opacity-40 shadow-lg ring-2 ring-primary/20 scale-[0.98]'
          : 'opacity-100'
      }`}
      role="listitem"
      aria-label={`Block ${index + 1}: ${block._type}`}
    >
      {/* Block header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
        {/* Drag handle */}
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none rounded-sm p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Drag to reorder block ${index + 1}`}
          aria-roledescription="sortable"
        >
          <GripVertical className="size-3.5 text-muted-foreground/50 shrink-0" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={isExpanded}
          aria-controls={`replicator-block-${index}-content`}
          className="flex items-center gap-2 flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {isExpanded ? (
            <ChevronDown className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          )}
          <Badge variant="secondary" className="text-xs">
            {block._type}
          </Badge>
          <span className="text-xs text-muted-foreground flex-1 truncate">
            {getBlockPreview(block, fs)}
          </span>
        </button>

        <div className="flex items-center gap-0.5">
          {onMoveUp && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onMoveUp}
              aria-label={`Move block ${index + 1} up`}
            >
              <span className="text-xs">↑</span>
            </Button>
          )}
          {onMoveDown && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onMoveDown}
              aria-label={`Move block ${index + 1} down`}
            >
              <span className="text-xs">↓</span>
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-destructive"
                />
              }
            >
              <Trash2 className="size-3" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove block?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove this &ldquo;{block._type}&rdquo; block and all its content.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onRemoveBlock}>
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Block fields */}
      {isExpanded && fs && (
        <div id={`replicator-block-${index}-content`} className="p-4 space-y-4">
          {fs.fields.map((fieldDef) => (
            <FieldRenderer
              key={fieldDef.handle}
              fieldDefinition={fieldDef}
              value={block[fieldDef.handle]}
              onChange={(val) => onUpdateBlock(fieldDef.handle, val)}
            />
          ))}
          {fs.fields.length === 0 && (
            <p className="text-xs text-muted-foreground">
              This fieldset has no fields defined.
            </p>
          )}
        </div>
      )}

      {isExpanded && !fs && (
        <div id={`replicator-block-${index}-content`} className="p-4">
          <p className="text-xs text-muted-foreground">
            Fieldset &ldquo;{block._type}&rdquo; not found.
          </p>
        </div>
      )}
    </Card>
  )
}

// ─── Drag Overlay ────────────────────────────────────────────────────────────

interface SortableBlockOverlayProps {
  block: Block
  fieldset: FieldsetData | undefined
}

function SortableBlockOverlay({ block, fieldset }: SortableBlockOverlayProps) {
  return (
    <Card className="p-0 overflow-hidden shadow-2xl ring-2 ring-primary/30 rotate-1 scale-[1.02]">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
        <GripVertical className="size-3.5 text-muted-foreground/50 shrink-0 cursor-grabbing" aria-hidden="true" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Badge variant="secondary" className="text-xs">
            {block._type}
          </Badge>
          <span className="text-xs text-muted-foreground flex-1 truncate">
            {getBlockPreview(block, fieldset)}
          </span>
        </div>
      </div>
    </Card>
  )
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Get a short preview string from block data */
function getBlockPreview(block: Block, fs: FieldsetData | undefined): string {
  if (!fs) return ''
  for (const fieldDef of fs.fields) {
    if (['text', 'slug'].includes(fieldDef.field.type)) {
      const val = block[fieldDef.handle]
      if (val && typeof val === 'string') return val
    }
  }
  return ''
}
