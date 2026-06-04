'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, GripVertical } from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Input } from '@/components/ui/input'

import type { FieldConfig, FieldDefinition } from '@/lib/blueprints/types'

interface FieldComponentProps {
  value: unknown
  onChange: (value: unknown) => void
  field: FieldConfig
  error?: string[]
}

interface GridRow {
  _id: string
  [key: string]: unknown
}

/** Generate a stable unique ID for a row */
function generateRowId(): string {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Ensure all rows have stable _id fields */
function ensureRowIds(rows: GridRow[]): GridRow[] {
  let changed = false
  const result = rows.map((row) => {
    if (!row._id) {
      changed = true
      return { ...row, _id: generateRowId() }
    }
    return row
  })
  return changed ? result : rows
}

/** Get column definitions from field options */
function getColumns(field: FieldConfig): FieldDefinition[] {
  const fields = field.options?.fields as FieldDefinition[] | undefined
  if (Array.isArray(fields)) return fields
  return []
}

/** Derive display label from handle */
function displayLabel(handle: string): string {
  return handle
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function GridField({ value, onChange, field, error }: FieldComponentProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const columns = getColumns(field)
  const rawRows: GridRow[] = Array.isArray(value) ? (value as GridRow[]) : []

  // Ensure all rows have stable IDs for dnd-kit
  const rowsRef = useRef<GridRow[]>(rawRows)
  const rows = useMemo(() => {
    const withIds = ensureRowIds(rawRows)
    if (withIds !== rawRows) {
      rowsRef.current = withIds
    }
    return withIds
  }, [rawRows])

  // Sync IDs back to parent if they were missing
  useEffect(() => {
    if (rowsRef.current !== rawRows && rowsRef.current.length > 0) {
      onChange(rowsRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rowIds = useMemo(() => rows.map((r) => r._id), [rows])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function addRow() {
    const newRow: GridRow = { _id: generateRowId() }
    // Pre-populate defaults from column definitions
    for (const col of columns) {
      if (col.field.default !== undefined) {
        newRow[col.handle] = col.field.default
      } else {
        newRow[col.handle] = ''
      }
    }
    onChange([...rows, newRow])
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index))
  }

  function updateCell(rowIndex: number, handle: string, cellValue: unknown) {
    const updated = rows.map((row, i) =>
      i === rowIndex ? { ...row, [handle]: cellValue } : row
    )
    onChange(updated)
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)

      if (over && active.id !== over.id) {
        const oldIndex = rowIds.indexOf(active.id as string)
        const newIndex = rowIds.indexOf(over.id as string)
        if (oldIndex !== -1 && newIndex !== -1) {
          onChange(arrayMove(rows, oldIndex, newIndex))
        }
      }
    },
    [rowIds, rows, onChange]
  )

  const activeRow = activeId ? rows.find((r) => r._id === activeId) : undefined

  // No columns defined — show configuration hint
  if (columns.length === 0) {
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
            No columns configured for this grid field.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add a <code className="bg-muted px-1 py-0.5 rounded">fields</code> option to
            the blueprint to define grid columns.
          </p>
        </div>
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

      {rows.length > 0 ? (
        <div className="rounded-lg border overflow-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    {columns.map((col) => (
                      <TableHead key={col.handle}>
                        {col.field.display || displayLabel(col.handle)}
                        {col.field.required && (
                          <span className="text-destructive ml-0.5">*</span>
                        )}
                      </TableHead>
                    ))}
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <SortableRow
                      key={row._id}
                      row={row}
                      index={index}
                      columns={columns}
                      onUpdateCell={(handle, val) => updateCell(index, handle, val)}
                      onRemoveRow={() => removeRow(index)}
                    />
                  ))}
                </TableBody>
              </Table>
            </SortableContext>

            <DragOverlay
              dropAnimation={{
                duration: 200,
                easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
              }}
            >
              {activeRow ? (
                <DragOverlayRow row={activeRow} columns={columns} />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">No rows yet.</p>
        </div>
      )}

      {/* Add row button */}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="size-3.5" />
        Add Row
      </Button>

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

// ─── Sortable Row Component ─────────────────────────────────────────────────

interface SortableRowProps {
  row: GridRow
  index: number
  columns: FieldDefinition[]
  onUpdateCell: (handle: string, value: unknown) => void
  onRemoveRow: () => void
}

function SortableRow({
  row,
  index,
  columns,
  onUpdateCell,
  onRemoveRow,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row._id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'opacity-40' : undefined}
      aria-label={`Row ${index + 1}`}
    >
      {/* Drag handle */}
      <TableCell className="w-8 px-1">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none rounded-sm p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Drag to reorder row ${index + 1}`}
          aria-roledescription="sortable"
        >
          <GripVertical className="size-3.5 text-muted-foreground/50" aria-hidden="true" />
        </button>
      </TableCell>

      {/* Inline cell editors */}
      {columns.map((col) => (
        <TableCell key={col.handle}>
          <InlineCell
            column={col}
            value={row[col.handle]}
            onChange={(val) => onUpdateCell(col.handle, val)}
          />
        </TableCell>
      ))}

      {/* Remove row */}
      <TableCell className="w-8 px-1">
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
              <AlertDialogTitle>Remove row?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove row {index + 1} and all its data. This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onRemoveRow}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  )
}

// ─── Inline Cell Editor ─────────────────────────────────────────────────────

interface InlineCellProps {
  column: FieldDefinition
  value: unknown
  onChange: (value: unknown) => void
}

function InlineCell({ column, value, onChange }: InlineCellProps) {
  const { field } = column
  const type = field.type

  // For simple types, render inline inputs directly
  switch (type) {
    case 'text':
    case 'slug':
    case 'code':
      return (
        <Input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.options?.placeholder as string | undefined}
          className="h-7 text-sm"
          aria-label={field.display || column.handle}
        />
      )

    case 'number':
      return (
        <Input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={(e) => {
            const v = e.target.value
            onChange(v === '' ? null : Number(v))
          }}
          min={field.options?.min as number | undefined}
          max={field.options?.max as number | undefined}
          step={field.options?.step as number | undefined}
          className="h-7 text-sm"
          aria-label={field.display || column.handle}
        />
      )

    case 'toggle':
      return (
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value)}
          aria-label={field.display || column.handle}
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            value ? 'bg-primary' : 'bg-input'
          }`}
        >
          <span
            className={`pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${
              value ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      )

    case 'select': {
      const options =
        (field.options?.options as string[]) ?? (field.options?.choices as string[]) ?? []
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-full min-w-[100px] rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={field.display || column.handle}
        >
          <option value="">—</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )
    }

    case 'date':
      return (
        <Input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 text-sm"
          aria-label={field.display || column.handle}
        />
      )

    // For complex types (markdown, tiptap, asset, entries, taxonomy, replicator, grid, yaml, multiselect),
    // fall back to a simple text input showing stringified value
    default:
      return (
        <Input
          type="text"
          value={typeof value === 'string' ? value : (value != null ? JSON.stringify(value) : '')}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value))
            } catch {
              onChange(e.target.value)
            }
          }}
          className="h-7 text-sm"
          aria-label={field.display || column.handle}
        />
      )
  }
}

// ─── Drag Overlay Row ───────────────────────────────────────────────────────

interface DragOverlayRowProps {
  row: GridRow
  columns: FieldDefinition[]
}

function DragOverlayRow({ row, columns }: DragOverlayRowProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background p-2 shadow-2xl ring-2 ring-primary/30">
      <GripVertical className="size-3.5 text-muted-foreground/50 shrink-0 cursor-grabbing" />
      {columns.slice(0, 3).map((col) => {
        const val = row[col.handle]
        const display = typeof val === 'string' ? val : (val != null ? JSON.stringify(val) : '—')
        return (
          <span key={col.handle} className="text-xs text-muted-foreground truncate max-w-[120px]">
            {display || '—'}
          </span>
        )
      })}
      {columns.length > 3 && (
        <span className="text-xs text-muted-foreground">+{columns.length - 3} more</span>
      )}
    </div>
  )
}
