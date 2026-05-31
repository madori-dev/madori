'use client'

import { useState } from 'react'
import { Folder, FileText, Trash2, FolderInput, Pencil } from 'lucide-react'
import type { Asset } from '@/lib/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

interface AssetGridProps {
  assets: Asset[]
  directories: string[]
  selectedPaths: Set<string>
  currentDirectory: string
  onToggleSelection: (path: string) => void
  onSelectRange: (path: string) => void
  onNavigateToDirectory: (dir: string) => void
  onDeleteAsset: (path: string) => void
  onDeleteDirectory: (name: string) => void
  onRenameDirectory: (oldName: string, newName: string) => void
  onMoveAsset: (from: string, to: string) => void
}

export function AssetGrid({
  assets,
  directories,
  selectedPaths,
  currentDirectory,
  onToggleSelection,
  onSelectRange,
  onNavigateToDirectory,
  onDeleteAsset,
  onDeleteDirectory,
  onRenameDirectory,
  onMoveAsset,
}: AssetGridProps) {
  const [renamingDir, setRenamingDir] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirmAsset, setDeleteConfirmAsset] = useState<string | null>(null)
  const [deleteConfirmDir, setDeleteConfirmDir] = useState<string | null>(null)
  const [draggedAsset, setDraggedAsset] = useState<string | null>(null)
  const [dragOverDir, setDragOverDir] = useState<string | null>(null)

  function handleStartRename(dir: string) {
    setRenamingDir(dir)
    setRenameValue(dir)
  }

  function handleConfirmRename() {
    if (renamingDir && renameValue.trim() && renameValue !== renamingDir) {
      onRenameDirectory(renamingDir, renameValue.trim())
    }
    setRenamingDir(null)
    setRenameValue('')
  }

  function handleAssetClick(e: React.MouseEvent, assetPath: string) {
    if (e.shiftKey) {
      onSelectRange(assetPath)
    } else if (e.metaKey || e.ctrlKey) {
      onToggleSelection(assetPath)
    } else {
      onToggleSelection(assetPath)
    }
  }

  function handleDragStart(e: React.DragEvent, assetPath: string) {
    setDraggedAsset(assetPath)
    e.dataTransfer.setData('text/plain', assetPath)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, dir: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDir(dir)
  }

  function handleDragLeave() {
    setDragOverDir(null)
  }

  function handleDrop(e: React.DragEvent, targetDir: string) {
    e.preventDefault()
    setDragOverDir(null)
    setDraggedAsset(null)

    const sourcePath = e.dataTransfer.getData('text/plain')
    if (!sourcePath) return

    const filename = sourcePath.split('/').pop() ?? sourcePath
    const destination = currentDirectory
      ? `${currentDirectory}/${targetDir}/${filename}`
      : `${targetDir}/${filename}`

    onMoveAsset(sourcePath, destination)
  }

  if (assets.length === 0 && directories.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No files in this folder.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Drag and drop files here or use the Upload button.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {/* Directories */}
        {directories.map((dir) => (
          <ContextMenu key={`dir-${dir}`}>
            <ContextMenuTrigger>
              <div
                className={cn(
                  'group relative flex flex-col items-center gap-2 rounded-lg border border-border p-3 transition-colors cursor-pointer',
                  'hover:bg-accent hover:border-accent-foreground/20',
                  dragOverDir === dir && 'border-primary bg-primary/10'
                )}
                onDoubleClick={() => {
                  const target = currentDirectory ? `${currentDirectory}/${dir}` : dir
                  onNavigateToDirectory(target)
                }}
                onDragOver={(e) => handleDragOver(e, dir)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, dir)}
              >
                <Folder className="h-10 w-10 text-blue-500" />
                {renamingDir === dir ? (
                  <Input
                    className="h-6 text-xs text-center"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleConfirmRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmRename()
                      if (e.key === 'Escape') setRenamingDir(null)
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="w-full truncate text-center text-xs font-medium text-foreground">
                    {dir}
                  </span>
                )}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => {
                const target = currentDirectory ? `${currentDirectory}/${dir}` : dir
                onNavigateToDirectory(target)
              }}>
                <Folder className="mr-2 h-4 w-4" />
                Open
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleStartRename(dir)}>
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-destructive"
                onClick={() => setDeleteConfirmDir(dir)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}

        {/* Assets */}
        {assets.map((asset) => {
          const isSelected = selectedPaths.has(asset.path)
          const isImage = asset.mimeType?.startsWith('image/')

          return (
            <ContextMenu key={asset.path}>
              <ContextMenuTrigger>
                <div
                  className={cn(
                    'group relative flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors cursor-pointer',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent hover:border-accent-foreground/20',
                    draggedAsset === asset.path && 'opacity-50'
                  )}
                  onClick={(e) => handleAssetClick(e, asset.path)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, asset.path)}
                  onDragEnd={() => setDraggedAsset(null)}
                >
                  {/* Checkbox */}
                  <div className={cn(
                    'absolute top-2 left-2 transition-opacity',
                    isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  )}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelection(asset.path)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  {/* Thumbnail */}
                  {isImage ? (
                    <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded">
                      <img
                        src={`/assets/${asset.path}`}
                        alt={asset.filename}
                        className="h-full w-full object-contain"
                        draggable={false}
                      />
                    </div>
                  ) : (
                    <div className="flex h-16 w-full items-center justify-center">
                      <FileText className="h-10 w-10 text-muted-foreground/50" />
                    </div>
                  )}

                  {/* Filename */}
                  <span className="w-full truncate text-center text-xs text-foreground">
                    {asset.filename}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatFileSize(asset.size)}
                  </span>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(`/assets/${asset.path}`)
                  }}
                >
                  Copy Path
                </ContextMenuItem>
                {directories.length > 0 && (
                  <>
                    <ContextMenuSeparator />
                    {directories.map((dir) => (
                      <ContextMenuItem
                        key={dir}
                        onClick={() => {
                          const filename = asset.path.split('/').pop() ?? asset.filename
                          const dest = currentDirectory
                            ? `${currentDirectory}/${dir}/${filename}`
                            : `${dir}/${filename}`
                          onMoveAsset(asset.path, dest)
                        }}
                      >
                        <FolderInput className="mr-2 h-4 w-4" />
                        Move to {dir}
                      </ContextMenuItem>
                    ))}
                  </>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="text-destructive"
                  onClick={() => setDeleteConfirmAsset(asset.path)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
      </div>

      {/* Delete asset confirmation */}
      <AlertDialog
        open={!!deleteConfirmAsset}
        onOpenChange={(open) => !open && setDeleteConfirmAsset(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{deleteConfirmAsset?.split('/').pop()}&rdquo;.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirmAsset) onDeleteAsset(deleteConfirmAsset)
                setDeleteConfirmAsset(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete directory confirmation */}
      <AlertDialog
        open={!!deleteConfirmDir}
        onOpenChange={(open) => !open && setDeleteConfirmDir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the &ldquo;{deleteConfirmDir}&rdquo; folder. The folder must be empty.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirmDir) onDeleteDirectory(deleteConfirmDir)
                setDeleteConfirmDir(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename directory dialog */}
      <Dialog open={!!renamingDir} onOpenChange={(open) => !open && setRenamingDir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmRename()
            }}
            autoFocus
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button onClick={handleConfirmRename} disabled={!renameValue.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
