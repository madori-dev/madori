'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Globe,
  FileText,
  Type,
  AlertTriangle,
  Pencil,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import type { NavigationItem } from '@/lib/types'
import type { Blueprint, FieldDefinition } from '@/lib/blueprints/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FlatItem {
  id: string
  item: NavigationItem
  depth: number
  parentId: string | null
  index: number
}

interface NavigationTreeEditorProps {
  items: NavigationItem[]
  onChange: (items: NavigationItem[]) => void
  maxDepth?: number
  blueprint?: Blueprint | null
}

// ─── Utilities ───────────────────────────────────────────────────────────────

let idCounter = 0
function generateId(): string {
  return `nav-item-${Date.now()}-${++idCounter}`
}

/** Flatten a tree into a list with depth/parent info for rendering */
function flattenTree(
  items: NavigationItem[],
  parentId: string | null = null,
  depth: number = 0,
  expandedIds: Set<string>,
  idMap: Map<NavigationItem, string>
): FlatItem[] {
  const result: FlatItem[] = []
  items.forEach((item, index) => {
    const id = getOrCreateId(item, idMap)
    result.push({ id, item, depth, parentId, index })
    if (item.children?.length && expandedIds.has(id)) {
      result.push(...flattenTree(item.children, id, depth + 1, expandedIds, idMap))
    }
  })
  return result
}

/** Assign stable IDs to items */
function getOrCreateId(item: NavigationItem, idMap: Map<NavigationItem, string>): string {
  let id = idMap.get(item)
  if (!id) {
    id = generateId()
    idMap.set(item, id)
  }
  return id
}

/** Get the display label for an item (first string field, or fallback) */
function getItemLabel(item: NavigationItem): string {
  if (typeof item.label === 'string') return item.label
  if (typeof item.title === 'string') return item.title
  for (const [key, val] of Object.entries(item)) {
    if (key === 'children') continue
    if (typeof val === 'string' && val.length > 0) return val
  }
  return '(untitled)'
}

/** Get a secondary detail string for display */
function getItemDetail(item: NavigationItem): string {
  if (typeof item.url === 'string') return item.url
  if (typeof item.entry === 'string') return item.entry
  return ''
}

/** Get depth of a subtree */
function getSubtreeDepth(item: NavigationItem): number {
  if (!item.children?.length) return 0
  return 1 + Math.max(...item.children.map(getSubtreeDepth))
}

/** Deep clone items without mutating, re-registering clones in the idMap */
function cloneItems(items: NavigationItem[], idMap: Map<NavigationItem, string>): NavigationItem[] {
  return items.map((item) => {
    const clone: NavigationItem = {
      ...item,
      children: item.children ? cloneItems(item.children, idMap) : undefined,
    }
    // Transfer the ID from original to clone so lookups still work
    const existingId = idMap.get(item)
    if (existingId) {
      idMap.set(clone, existingId)
    }
    return clone
  })
}

/** Find an item by id in the tree and return its parent array + index */
function findItemById(
  items: NavigationItem[],
  targetId: string,
  idMap: Map<NavigationItem, string>
): { parentArray: NavigationItem[]; index: number } | null {
  for (let i = 0; i < items.length; i++) {
    if (idMap.get(items[i]) === targetId) {
      return { parentArray: items, index: i }
    }
    if (items[i].children?.length) {
      const found = findItemById(items[i].children!, targetId, idMap)
      if (found) return found
    }
  }
  return null
}

/** Calculate depth of an item by id */
function getItemDepth(
  items: NavigationItem[],
  targetId: string,
  idMap: Map<NavigationItem, string>,
  currentDepth: number = 0
): number {
  for (const item of items) {
    if (idMap.get(item) === targetId) return currentDepth
    if (item.children?.length) {
      const found = getItemDepth(item.children, targetId, idMap, currentDepth + 1)
      if (found >= 0) return found
    }
  }
  return -1
}

/** Get all fields from a blueprint (flattened across tabs/sections) */
function getBlueprintFields(blueprint: Blueprint | null | undefined): FieldDefinition[] {
  if (!blueprint) return []
  const fields: FieldDefinition[] = []
  for (const tab of Object.values(blueprint.tabs)) {
    fields.push(...tab.fields)
    if (tab.sections) {
      for (const section of Object.values(tab.sections)) {
        fields.push(...section.fields)
      }
    }
  }
  return fields
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function NavigationTreeEditor({ items, onChange, maxDepth, blueprint }: NavigationTreeEditorProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const idMapRef = useRef<Map<NavigationItem, string>>(new Map())

  const blueprintFields = useMemo(() => getBlueprintFields(blueprint), [blueprint])

  // Initialize expanded state with all items that have children
  useEffect(() => {
    const ids = new Set<string>()
    function collectIds(navItems: NavigationItem[]) {
      for (const item of navItems) {
        const id = getOrCreateId(item, idMapRef.current)
        if (item.children?.length) {
          ids.add(id)
          collectIds(item.children)
        }
      }
    }
    collectIds(items)
    setExpandedIds(ids)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const flatItems = useMemo(
    () => flattenTree(items, null, 0, expandedIds, idMapRef.current),
    [items, expandedIds]
  )

  const flatItemIds = useMemo(() => flatItems.map((fi) => fi.id), [flatItems])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ─── Tree Mutations ──────────────────────────────────────────────────

  const addItem = useCallback(
    (newItem: NavigationItem) => {
      const updated = [...items, newItem]
      onChange(updated)
      setAddSheetOpen(false)
    },
    [items, onChange]
  )

  const updateItem = useCallback(
    (targetId: string, updates: Partial<NavigationItem>) => {
      const cloned = cloneItems(items, idMapRef.current)
      const found = findItemById(cloned, targetId, idMapRef.current)
      if (found) {
        const item = found.parentArray[found.index]
        // Replace all non-children fields with updates
        const { children } = item
        const newItem: NavigationItem = { ...updates }
        if (children) newItem.children = children
        found.parentArray[found.index] = newItem
        onChange(cloned)
      }
    },
    [items, onChange]
  )

  const removeItemPromoteChildren = useCallback(
    (targetId: string) => {
      const cloned = cloneItems(items, idMapRef.current)
      const found = findItemById(cloned, targetId, idMapRef.current)
      if (found) {
        const item = found.parentArray[found.index]
        const children = item.children ?? []
        found.parentArray.splice(found.index, 1, ...children)
        onChange(cloned)
      }
    },
    [items, onChange]
  )

  const removeItemWithChildren = useCallback(
    (targetId: string) => {
      const cloned = cloneItems(items, idMapRef.current)
      const found = findItemById(cloned, targetId, idMapRef.current)
      if (found) {
        found.parentArray.splice(found.index, 1)
        onChange(cloned)
      }
    },
    [items, onChange]
  )

  const moveUp = useCallback(
    (targetId: string) => {
      const cloned = cloneItems(items, idMapRef.current)
      const found = findItemById(cloned, targetId, idMapRef.current)
      if (found && found.index > 0) {
        const [item] = found.parentArray.splice(found.index, 1)
        found.parentArray.splice(found.index - 1, 0, item)
        onChange(cloned)
      }
    },
    [items, onChange]
  )

  const moveDown = useCallback(
    (targetId: string) => {
      const cloned = cloneItems(items, idMapRef.current)
      const found = findItemById(cloned, targetId, idMapRef.current)
      if (found && found.index < found.parentArray.length - 1) {
        const [item] = found.parentArray.splice(found.index, 1)
        found.parentArray.splice(found.index + 1, 0, item)
        onChange(cloned)
      }
    },
    [items, onChange]
  )

  const indentItem = useCallback(
    (targetId: string) => {
      const cloned = cloneItems(items, idMapRef.current)
      const found = findItemById(cloned, targetId, idMapRef.current)
      if (!found || found.index === 0) return

      const item = found.parentArray[found.index]
      const currentDepth = getItemDepth(cloned, targetId, idMapRef.current)
      const subtreeDepth = getSubtreeDepth(item)

      if (maxDepth !== undefined && currentDepth + 1 + subtreeDepth > maxDepth) {
        return
      }

      const prevSibling = found.parentArray[found.index - 1]
      found.parentArray.splice(found.index, 1)
      if (!prevSibling.children) prevSibling.children = []
      prevSibling.children.push(item)

      const prevId = idMapRef.current.get(prevSibling)
      if (prevId) setExpandedIds((prev) => new Set([...prev, prevId]))

      onChange(cloned)
    },
    [items, onChange, maxDepth]
  )

  const outdentItem = useCallback(
    (targetId: string) => {
      const cloned = cloneItems(items, idMapRef.current)

      function findParent(
        searchItems: NavigationItem[],
      ): { grandparentArray: NavigationItem[]; parentIndex: number; childIndex: number } | null {
        for (let i = 0; i < searchItems.length; i++) {
          if (searchItems[i].children?.length) {
            for (let j = 0; j < searchItems[i].children!.length; j++) {
              if (idMapRef.current.get(searchItems[i].children![j]) === targetId) {
                return {
                  grandparentArray: searchItems,
                  parentIndex: i,
                  childIndex: j,
                }
              }
            }
            const found = findParent(searchItems[i].children!)
            if (found) return found
          }
        }
        return null
      }

      const result = findParent(cloned)
      if (!result) return

      const parent = result.grandparentArray[result.parentIndex]
      const [item] = parent.children!.splice(result.childIndex, 1)
      if (parent.children!.length === 0) parent.children = undefined

      result.grandparentArray.splice(result.parentIndex + 1, 0, item)
      onChange(cloned)
    },
    [items, onChange]
  )

  // ─── Drag and Drop ───────────────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)

      if (!over || active.id === over.id) return

      const activeIndex = flatItems.findIndex((fi) => fi.id === active.id)
      const overIndex = flatItems.findIndex((fi) => fi.id === over.id)

      if (activeIndex === -1 || overIndex === -1) return

      const activeFlat = flatItems[activeIndex]
      const overFlat = flatItems[overIndex]

      const cloned = cloneItems(items, idMapRef.current)
      const activeFound = findItemById(cloned, activeFlat.id, idMapRef.current)
      const overFound = findItemById(cloned, overFlat.id, idMapRef.current)

      if (!activeFound || !overFound) return

      if (activeFound.parentArray === overFound.parentArray) {
        const [item] = activeFound.parentArray.splice(activeFound.index, 1)
        const newOverIndex = overFound.parentArray.indexOf(overFound.parentArray[overFound.index])
        const insertAt = activeFound.index < overFound.index ? newOverIndex : overFound.index
        activeFound.parentArray.splice(insertAt, 0, item)
        onChange(cloned)
      } else {
        const activeItem = activeFound.parentArray[activeFound.index]
        const newDepth = overFlat.depth
        const subtreeDepth = getSubtreeDepth(activeItem)

        if (maxDepth !== undefined && newDepth + subtreeDepth > maxDepth) {
          return
        }

        activeFound.parentArray.splice(activeFound.index, 1)
        const overFoundAgain = findItemById(cloned, overFlat.id, idMapRef.current)
        if (overFoundAgain) {
          overFoundAgain.parentArray.splice(overFoundAgain.index, 0, activeItem)
        }
        onChange(cloned)
      }
    },
    [flatItems, items, onChange, maxDepth]
  )

  // ─── Expand/Collapse ─────────────────────────────────────────────────

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ─── Active item for drag overlay ────────────────────────────────────

  const activeItem = activeId
    ? flatItems.find((fi) => fi.id === activeId)
    : undefined

  // ─── Currently editing item ──────────────────────────────────────────

  const editingItem = editingId
    ? flatItems.find((fi) => fi.id === editingId)
    : undefined

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Tree items */}
        {flatItems.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Type className="mx-auto size-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No navigation items yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add your first item to start building the navigation.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={flatItemIds} strategy={verticalListSortingStrategy}>
              <div
                className="rounded-lg border divide-y overflow-hidden"
                role="tree"
                aria-label="Navigation tree"
              >
                {flatItems.map((flatItem) => (
                  <NavigationTreeItem
                    key={flatItem.id}
                    flatItem={flatItem}
                    isExpanded={expandedIds.has(flatItem.id)}
                    maxDepth={maxDepth}
                    blueprintFields={blueprintFields}
                    totalSiblings={
                      flatItems.filter((fi) => fi.parentId === flatItem.parentId).length
                    }
                    onToggleExpanded={() => toggleExpanded(flatItem.id)}
                    onStartEdit={() => setEditingId(flatItem.id)}
                    onUpdate={(updates) => updateItem(flatItem.id, updates)}
                    onRemovePromote={() => removeItemPromoteChildren(flatItem.id)}
                    onRemoveWithChildren={() => removeItemWithChildren(flatItem.id)}
                    onMoveUp={() => moveUp(flatItem.id)}
                    onMoveDown={() => moveDown(flatItem.id)}
                    onIndent={() => indentItem(flatItem.id)}
                    onOutdent={() => outdentItem(flatItem.id)}
                    canIndent={flatItem.index > 0 && (maxDepth === undefined || flatItem.depth < maxDepth)}
                    canOutdent={flatItem.depth > 0}
                  />
                ))}
              </div>
            </SortableContext>

            <DragOverlay
              dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}
            >
              {activeItem ? <NavigationDragOverlay flatItem={activeItem} /> : null}
            </DragOverlay>
          </DndContext>
        )}

        {/* Max depth indicator */}
        {maxDepth !== undefined && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="size-3" />
            <span>Maximum nesting depth: {maxDepth} level{maxDepth !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Add item button */}
        <Button variant="outline" size="sm" onClick={() => setAddSheetOpen(true)}>
          <Plus className="size-3.5" />
          Add item
        </Button>

        {/* Add Item Sheet */}
        <AddItemSheet
          open={addSheetOpen}
          onOpenChange={setAddSheetOpen}
          onAdd={addItem}
          blueprintFields={blueprintFields}
        />

        {/* Edit Item Sheet */}
        <EditItemSheet
          open={!!editingId}
          onOpenChange={(open) => { if (!open) setEditingId(null) }}
          item={editingItem?.item ?? null}
          onSave={(updates) => {
            if (editingId) {
              updateItem(editingId, updates)
              setEditingId(null)
            }
          }}
          blueprintFields={blueprintFields}
        />
      </div>
    </TooltipProvider>
  )
}

// ─── Tree Item Component ─────────────────────────────────────────────────────

interface NavigationTreeItemProps {
  flatItem: FlatItem
  isExpanded: boolean
  maxDepth?: number
  blueprintFields: FieldDefinition[]
  totalSiblings: number
  onToggleExpanded: () => void
  onStartEdit: () => void
  onUpdate: (updates: Partial<NavigationItem>) => void
  onRemovePromote: () => void
  onRemoveWithChildren: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onIndent: () => void
  onOutdent: () => void
  canIndent: boolean
  canOutdent: boolean
}

function NavigationTreeItem({
  flatItem,
  isExpanded,
  maxDepth,
  blueprintFields,
  totalSiblings,
  onToggleExpanded,
  onStartEdit,
  onRemovePromote,
  onRemoveWithChildren,
  onMoveUp,
  onMoveDown,
  onIndent,
  onOutdent,
  canIndent,
  canOutdent,
}: NavigationTreeItemProps) {
  const { item, depth, index } = flatItem
  const hasChildren = !!item.children?.length
  const atMaxDepth = maxDepth !== undefined && depth >= maxDepth

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: flatItem.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Determine what to show as secondary info in collapsed view
  const secondaryFields = useMemo(() => {
    if (blueprintFields.length === 0) return null
    const extras: { label: string; value: string }[] = []
    for (const field of blueprintFields) {
      if (field.handle === 'label' || field.handle === 'title') continue
      const val = item[field.handle]
      if (val && typeof val === 'string') {
        extras.push({ label: field.field.display || field.handle, value: val })
      } else if (val && typeof val === 'boolean') {
        extras.push({ label: field.field.display || field.handle, value: val ? 'Yes' : 'No' })
      }
    }
    return extras.length > 0 ? extras : null
  }, [blueprintFields, item])

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, paddingLeft: `${depth * 24 + 8}px` }}
      className={`group flex items-center gap-1 py-1.5 pr-2 transition-opacity ${
        isDragging ? 'opacity-40' : 'opacity-100'
      } ${atMaxDepth ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}`}
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-level={depth + 1}
      aria-label={getItemLabel(item)}
    >
      {/* Drag handle */}
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none rounded p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Drag to reorder ${getItemLabel(item)}`}
        aria-roledescription="sortable"
      >
        <GripVertical className="size-3.5 text-muted-foreground/50" aria-hidden="true" />
      </button>

      {/* Expand/collapse */}
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="rounded p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </button>
      ) : (
        <span className="w-5" />
      )}

      {/* Item icon */}
      <ItemIcon item={item} className="size-3.5 shrink-0" />

      {/* Label + details */}
      <button
        type="button"
        className="flex items-center gap-2 flex-1 min-w-0 text-left rounded px-1 py-0.5 hover:bg-muted/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onDoubleClick={onStartEdit}
        onClick={onStartEdit}
        aria-label={`Edit ${getItemLabel(item)}`}
      >
        <span className="text-sm font-medium truncate">{getItemLabel(item)}</span>
        {!secondaryFields && getItemDetail(item) && (
          <span className="text-xs text-muted-foreground truncate">
            {getItemDetail(item)}
          </span>
        )}
        {secondaryFields && secondaryFields.length > 0 && (
          <span className="text-xs text-muted-foreground truncate">
            {secondaryFields[0].value}
          </span>
        )}
        {item.external === true && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            external
          </Badge>
        )}
      </button>

      {/* Depth warning */}
      {atMaxDepth && (
        <Tooltip>
          <TooltipTrigger
            render={<span className="shrink-0" />}
          >
            <AlertTriangle className="size-3 text-amber-500" />
          </TooltipTrigger>
          <TooltipContent>Maximum nesting depth reached</TooltipContent>
        </Tooltip>
      )}

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onMoveUp}
                disabled={index === 0}
                aria-label={`Move ${getItemLabel(item)} up`}
              />
            }
          >
            <ArrowUp className="size-3" />
          </TooltipTrigger>
          <TooltipContent>Move up</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onMoveDown}
                disabled={index >= totalSiblings - 1}
                aria-label={`Move ${getItemLabel(item)} down`}
              />
            }
          >
            <ArrowDown className="size-3" />
          </TooltipTrigger>
          <TooltipContent>Move down</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onOutdent}
                disabled={!canOutdent}
                aria-label={`Outdent ${getItemLabel(item)}`}
              />
            }
          >
            <ArrowLeft className="size-3" />
          </TooltipTrigger>
          <TooltipContent>Outdent (move to parent level)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onIndent}
                disabled={!canIndent}
                aria-label={`Indent ${getItemLabel(item)}`}
              />
            }
          >
            <ArrowRight className="size-3" />
          </TooltipTrigger>
          <TooltipContent>Indent (nest under previous item)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onStartEdit}
                aria-label={`Edit ${getItemLabel(item)}`}
              />
            }
          >
            <Pencil className="size-3" />
          </TooltipTrigger>
          <TooltipContent>Edit</TooltipContent>
        </Tooltip>

        <RemoveItemDialog
          item={item}
          hasChildren={hasChildren}
          onRemovePromote={onRemovePromote}
          onRemoveWithChildren={onRemoveWithChildren}
        />
      </div>
    </div>
  )
}

// ─── Item Icon ───────────────────────────────────────────────────────────────

function ItemIcon({ item, className }: { item: NavigationItem; className?: string }) {
  if (typeof item.url === 'string' && item.url) {
    return <Globe className={`${className} text-blue-500`} aria-hidden="true" />
  }
  if (typeof item.entry === 'string' && item.entry) {
    return <FileText className={`${className} text-green-500`} aria-hidden="true" />
  }
  return <Type className={`${className} text-muted-foreground`} aria-hidden="true" />
}

// ─── Drag Overlay ────────────────────────────────────────────────────────────

function NavigationDragOverlay({ flatItem }: { flatItem: FlatItem }) {
  const { item } = flatItem

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-popover px-3 py-2 shadow-xl ring-2 ring-primary/20">
      <GripVertical className="size-3.5 text-muted-foreground/50 cursor-grabbing" />
      <span className="text-sm font-medium">{getItemLabel(item)}</span>
      {getItemDetail(item) && (
        <span className="text-xs text-muted-foreground">{getItemDetail(item)}</span>
      )}
    </div>
  )
}

// ─── Remove Item Dialog ──────────────────────────────────────────────────────

interface RemoveItemDialogProps {
  item: NavigationItem
  hasChildren: boolean
  onRemovePromote: () => void
  onRemoveWithChildren: () => void
}

function RemoveItemDialog({
  item,
  hasChildren,
  onRemovePromote,
  onRemoveWithChildren,
}: RemoveItemDialogProps) {
  if (!hasChildren) {
    return (
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${getItemLabel(item)}`}
            />
          }
        >
          <Trash2 className="size-3" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove &ldquo;{getItemLabel(item)}&rdquo; from the navigation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onRemoveWithChildren}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${getItemLabel(item)}`}
          />
        }
      >
        <Trash2 className="size-3" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove &ldquo;{getItemLabel(item)}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This item has {item.children!.length} child{' '}
            {item.children!.length === 1 ? 'item' : 'items'}. Choose how to handle them:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="outline" onClick={onRemovePromote}>
            Promote children
          </AlertDialogAction>
          <AlertDialogAction variant="destructive" onClick={onRemoveWithChildren}>
            Delete all
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── Navigation Field Renderer ───────────────────────────────────────────────

interface FieldRendererProps {
  field: FieldDefinition
  value: unknown
  onChange: (value: unknown) => void
}

function NavigationFieldRenderer({ field, value, onChange }: FieldRendererProps) {
  const { type, display, options } = field.field
  const label = display || field.handle
  const id = `nav-field-${field.handle}`

  switch (type) {
    case 'text':
    case 'slug':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id} className="text-xs font-medium">
            {label}
            {field.field.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            id={id}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            placeholder={label}
            className="h-8 text-sm"
          />
          {field.field.instructions && (
            <p className="text-xs text-muted-foreground">{field.field.instructions}</p>
          )}
        </div>
      )

    case 'number':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id} className="text-xs font-medium">
            {label}
            {field.field.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            id={id}
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
            placeholder={label}
            className="h-8 text-sm"
          />
          {field.field.instructions && (
            <p className="text-xs text-muted-foreground">{field.field.instructions}</p>
          )}
        </div>
      )

    case 'toggle':
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={!!value}
              onCheckedChange={(checked) => onChange(checked === true ? true : undefined)}
            />
            <Label htmlFor={id} className="text-xs font-medium cursor-pointer">
              {label}
              {field.field.required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
          </div>
          {field.field.instructions && (
            <p className="text-xs text-muted-foreground ml-6">{field.field.instructions}</p>
          )}
        </div>
      )

    case 'select': {
      const selectOptions = (options?.options as string[]) ?? []
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id} className="text-xs font-medium">
            {label}
            {field.field.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Select
            value={(value as string) ?? ''}
            onValueChange={(val) => onChange(val || undefined)}
          >
            <SelectTrigger className="w-full h-8 text-sm">
              <SelectValue placeholder={`Select ${label.toLowerCase()}...`} />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.field.instructions && (
            <p className="text-xs text-muted-foreground">{field.field.instructions}</p>
          )}
        </div>
      )
    }

    case 'markdown':
    case 'tiptap':
    case 'code':
    case 'yaml':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id} className="text-xs font-medium">
            {label}
            {field.field.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <textarea
            id={id}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            placeholder={label}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y min-h-[60px]"
          />
          {field.field.instructions && (
            <p className="text-xs text-muted-foreground">{field.field.instructions}</p>
          )}
        </div>
      )

    default:
      // Fallback: text input for unknown types
      return (
        <div className="space-y-1.5">
          <Label htmlFor={id} className="text-xs font-medium">
            {label}
            {field.field.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            id={id}
            value={typeof value === 'string' ? value : (value != null ? String(value) : '')}
            onChange={(e) => onChange(e.target.value || undefined)}
            placeholder={label}
            className="h-8 text-sm"
          />
          {field.field.instructions && (
            <p className="text-xs text-muted-foreground">{field.field.instructions}</p>
          )}
        </div>
      )
  }
}

// ─── Edit Item Sheet ─────────────────────────────────────────────────────────

interface EditItemSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: NavigationItem | null
  onSave: (updates: Partial<NavigationItem>) => void
  blueprintFields: FieldDefinition[]
}

function EditItemSheet({ open, onOpenChange, item, onSave, blueprintFields }: EditItemSheetProps) {
  const [fields, setFields] = useState<Record<string, unknown>>({})

  // Sync local state when item changes
  useEffect(() => {
    if (item) {
      const { children: _children, ...data } = item
      setFields({ ...data })
    } else {
      setFields({})
    }
  }, [item])

  function handleFieldChange(handle: string, value: unknown) {
    setFields((prev) => {
      const next = { ...prev }
      if (value === undefined || value === '' || value === null) {
        delete next[handle]
      } else {
        next[handle] = value
      }
      return next
    })
  }

  function handleSave() {
    onSave(fields)
  }

  if (!item) return null

  const hasBlueprint = blueprintFields.length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Navigation Item</SheetTitle>
          <SheetDescription>
            Update the fields for this navigation item.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 py-2">
          {hasBlueprint ? (
            // Render blueprint-defined fields
            blueprintFields.map((field) => (
              <NavigationFieldRenderer
                key={field.handle}
                field={field}
                value={fields[field.handle]}
                onChange={(val) => handleFieldChange(field.handle, val)}
              />
            ))
          ) : (
            // Default fields when no blueprint
            <>
              <div className="space-y-1.5">
                <Label htmlFor="edit-label" className="text-xs font-medium">
                  Label <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-label"
                  value={(fields.label as string) ?? ''}
                  onChange={(e) => handleFieldChange('label', e.target.value)}
                  placeholder="Navigation label"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-url" className="text-xs font-medium">URL</Label>
                <Input
                  id="edit-url"
                  value={(fields.url as string) ?? ''}
                  onChange={(e) => handleFieldChange('url', e.target.value)}
                  placeholder="/path or https://..."
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-entry" className="text-xs font-medium">Entry Reference</Label>
                <Input
                  id="edit-entry"
                  value={(fields.entry as string) ?? ''}
                  onChange={(e) => handleFieldChange('entry', e.target.value)}
                  placeholder="collection/slug"
                  className="h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Link to a content entry instead of a URL.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-external"
                  checked={!!fields.external}
                  onCheckedChange={(checked) => handleFieldChange('external', checked === true ? true : undefined)}
                />
                <Label htmlFor="edit-external" className="text-xs font-medium cursor-pointer">
                  Open in new tab (external link)
                </Label>
              </div>
            </>
          )}
        </div>

        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>
            Cancel
          </SheetClose>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ─── Add Item Sheet ──────────────────────────────────────────────────────────

interface AddItemSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (item: NavigationItem) => void
  blueprintFields: FieldDefinition[]
}

type ItemType = 'url' | 'entry' | 'text'

function AddItemSheet({ open, onOpenChange, onAdd, blueprintFields }: AddItemSheetProps) {
  const [itemType, setItemType] = useState<ItemType>('url')
  const [fields, setFields] = useState<Record<string, unknown>>({})

  const hasBlueprint = blueprintFields.length > 0

  function reset() {
    setItemType('url')
    setFields({})
  }

  function handleFieldChange(handle: string, value: unknown) {
    setFields((prev) => {
      const next = { ...prev }
      if (value === undefined || value === '' || value === null) {
        delete next[handle]
      } else {
        next[handle] = value
      }
      return next
    })
  }

  function handleSubmit() {
    if (hasBlueprint) {
      // Validate required fields
      const missingRequired = blueprintFields.some(
        (f) => f.field.required && !fields[f.handle]
      )
      if (missingRequired) return

      onAdd(fields as NavigationItem)
    } else {
      const label = fields.label as string | undefined
      if (!label?.trim()) return

      const newItem: NavigationItem = { label: label.trim() }
      if (itemType === 'url' && fields.url) {
        newItem.url = (fields.url as string).trim()
        if (fields.external) newItem.external = true
      }
      if (itemType === 'entry' && fields.entry) {
        newItem.entry = (fields.entry as string).trim()
      }

      onAdd(newItem)
    }
    reset()
  }

  // Check if form is valid for submit button state
  const isValid = hasBlueprint
    ? !blueprintFields.some((f) => f.field.required && !fields[f.handle])
    : !!(fields.label as string)?.trim()

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen)
        if (!isOpen) reset()
      }}
    >
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Navigation Item</SheetTitle>
          <SheetDescription>
            {hasBlueprint
              ? 'Fill in the fields defined by the navigation blueprint.'
              : 'Choose the item type and fill in the details.'}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 py-2">
          {hasBlueprint ? (
            // Render blueprint-defined fields
            blueprintFields.map((field) => (
              <NavigationFieldRenderer
                key={field.handle}
                field={field}
                value={fields[field.handle]}
                onChange={(val) => handleFieldChange(field.handle, val)}
              />
            ))
          ) : (
            // Default mode: type selector + fields
            <>
              {/* Item type selector */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Type</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={itemType === 'url' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setItemType('url')}
                  >
                    <Globe className="size-3.5" />
                    URL
                  </Button>
                  <Button
                    type="button"
                    variant={itemType === 'entry' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setItemType('entry')}
                  >
                    <FileText className="size-3.5" />
                    Entry
                  </Button>
                  <Button
                    type="button"
                    variant={itemType === 'text' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setItemType('text')}
                  >
                    <Type className="size-3.5" />
                    Text Only
                  </Button>
                </div>
              </div>

              {/* Label */}
              <div className="space-y-1.5">
                <Label htmlFor="add-label" className="text-xs font-medium">
                  Label <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="add-label"
                  value={(fields.label as string) ?? ''}
                  onChange={(e) => handleFieldChange('label', e.target.value)}
                  placeholder="e.g. Getting Started"
                  autoFocus
                  className="h-8 text-sm"
                />
              </div>

              {/* URL fields */}
              {itemType === 'url' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-url" className="text-xs font-medium">URL</Label>
                    <Input
                      id="add-url"
                      value={(fields.url as string) ?? ''}
                      onChange={(e) => handleFieldChange('url', e.target.value)}
                      placeholder="e.g. /docs/getting-started"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="add-external"
                      checked={!!fields.external}
                      onCheckedChange={(checked) => handleFieldChange('external', checked === true ? true : undefined)}
                    />
                    <Label htmlFor="add-external" className="text-xs font-medium cursor-pointer">
                      Open in new tab (external link)
                    </Label>
                  </div>
                </>
              )}

              {/* Entry reference */}
              {itemType === 'entry' && (
                <div className="space-y-1.5">
                  <Label htmlFor="add-entry" className="text-xs font-medium">Entry Reference</Label>
                  <Input
                    id="add-entry"
                    value={(fields.entry as string) ?? ''}
                    onChange={(e) => handleFieldChange('entry', e.target.value)}
                    placeholder="e.g. pages/getting-started"
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Collection and slug path, e.g. &ldquo;pages/docs/configuration&rdquo;
                  </p>
                </div>
              )}

              {/* Text-only note */}
              {itemType === 'text' && (
                <p className="text-xs text-muted-foreground">
                  Text-only items serve as section headers or non-clickable labels in the navigation.
                </p>
              )}
            </>
          )}
        </div>

        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>
            Cancel
          </SheetClose>
          <Button onClick={handleSubmit} disabled={!isValid}>
            Add Item
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
